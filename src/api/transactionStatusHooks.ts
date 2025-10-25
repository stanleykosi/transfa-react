import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTransactionStatus } from '@/api/transactionApi';
import { TransactionStatusResponse } from '@/types/api';
import { supabase } from '@/api/supabaseClient';

const mapSupabaseRecordToStatus = (record: any): TransactionStatusResponse => ({
  id: record.id,
  status: record.status,
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
    refetchInterval: enablePolling ? 5000 : false,
    refetchOnWindowFocus: enablePolling,
  });

export const useTransactionStatusSubscription = (transactionId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!transactionId) {
      return undefined;
    }

    const channel = supabase
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
              ...(prev ?? null),
              ...mapped,
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [transactionId, queryClient]);
};
