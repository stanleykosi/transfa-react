import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { fetchTransactionStatus } from '@/api/transactionApi';
import { TransactionStatusResponse } from '@/types/api';
import { supabase } from '@/api/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

const normalizeStatus = (status?: string | null): TransactionStatusResponse['status'] => {
  if (!status) {
    return 'pending';
  }

  const normalized = status.toLowerCase();
  if (normalized === 'success' || normalized === 'successful') {
    return 'completed';
  }
  if (normalized === 'failure') {
    return 'failed';
  }
  if (normalized === 'initiated') {
    return 'processing';
  }

  return normalized as TransactionStatusResponse['status'];
};

const mapSupabaseRecordToStatus = (record: any): TransactionStatusResponse => ({
  id: record.id,
  status: normalizeStatus(record.status),
  amount: Number(record.amount ?? 0),
  fee: Number(record.fee ?? 0),
  failure_reason: record.failure_reason ?? undefined,
  anchor_reason: record.anchor_reason ?? undefined,
  transfer_type: record.transfer_type ?? undefined,
});

export const useTransactionStatus = (transactionId: string, enablePolling = true) =>
  useQuery<TransactionStatusResponse | null, Error>({
    queryKey: ['transaction-status', transactionId],
    queryFn: async () => {
      if (!transactionId) {
        return null;
      }
      const { data } = await fetchTransactionStatus(transactionId);
      return data;
    },
    enabled: Boolean(transactionId),
    refetchInterval: (query) => {
      if (!enablePolling) {
        return false;
      }
      const data = query.state.data as TransactionStatusResponse | null;
      if (!data) {
        return 5000;
      }
      return data.status === 'completed' || data.status === 'failed' ? false : 5000;
    },
    refetchOnWindowFocus: (query) => {
      if (!enablePolling) {
        return false;
      }
      const data = query.state.data as TransactionStatusResponse | null;
      if (!data) {
        return true;
      }
      return data.status !== 'completed' && data.status !== 'failed';
    },
    select: (result) => {
      if (!result) {
        return result;
      }

      return {
        ...result,
        status: normalizeStatus(result.status),
        failure_reason: result.failure_reason ?? undefined,
        anchor_reason: result.anchor_reason ?? undefined,
      };
    },
  });

export const useTransactionStatusSubscription = (transactionId?: string) => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  useEffect(() => {
    if (!transactionId) {
      return undefined;
    }

    let isMounted = true;
    let channel: RealtimeChannel | null = null;

    const setupRealtime = async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (token) {
          supabase.realtime.setAuth(token);
        }
      } catch (error) {
        console.warn('Failed to set Supabase realtime auth token', error);
      }

      if (!isMounted) {
        return;
      }

      channel = supabase
        .channel(`transaction-status-${transactionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `id=eq.${transactionId}`,
          },
          (payload) => {
            if (!payload.new) {
              return;
            }

            const mapped = mapSupabaseRecordToStatus(payload.new);
            queryClient.setQueryData<TransactionStatusResponse | null>(
              ['transaction-status', transactionId],
              (prev) => ({
                ...(prev ?? {}),
                ...mapped,
              })
            );

            if (mapped.status === 'completed' || mapped.status === 'failed') {
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              queryClient.invalidateQueries({ queryKey: ['account-balance'] });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            queryClient.invalidateQueries({
              queryKey: ['transaction-status', transactionId],
            });
          }
        });
    };

    setupRealtime();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [transactionId, queryClient, getToken]);
};
