/**
 * @description
 * This file defines TanStack Query hooks for money movement API calls,
 * such as Peer-to-Peer (P2P) transfers and Self-Transfers (withdrawals).
 *
 * Key features:
 * - Abstraction: Encapsulates the logic for initiating transfers, separating it from UI components.
 * - State Management: `useMutation` automatically handles loading, error, and success states for these critical async operations.
 * - Type Safety: Uses defined API types for request payloads and responses.
 * - Error Handling: Consistent error handling patterns matching the existing codebase.
 *
 * @dependencies
 * - @tanstack/react-query: For the `useMutation` hook.
 * - @/api/apiClient: The configured Axios instance for making authenticated requests.
 * - @/types/api: For transaction-related type definitions.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import apiClient from './apiClient';
import {
  P2PTransferPayload,
  SelfTransferPayload,
  TransactionResponse,
  Beneficiary,
  ReceivingPreference,
  UpdateReceivingPreferencePayload,
  SetDefaultBeneficiaryPayload,
  AccountBalance,
} from '@/types/api';

// Transaction service URL from environment variables with fallback
const TRANSACTION_SERVICE_URL =
  process.env.EXPO_PUBLIC_TRANSACTION_SERVICE_URL || 'http://localhost:8083';

// Define query keys for cache invalidation
const TRANSACTIONS_QUERY_KEY = 'transactions';
const BENEFICIARIES_QUERY_KEY = 'beneficiaries';
const RECEIVING_PREFERENCE_QUERY_KEY = 'receiving-preference';
const DEFAULT_BENEFICIARY_QUERY_KEY = 'default-beneficiary';
const ACCOUNT_BALANCE_QUERY_KEY = 'account-balance';

/**
 * Custom hook to perform a Peer-to-Peer (P2P) transfer to another Transfa user.
 * @param options Optional mutation options (e.g., onSuccess, onError callbacks).
 * @returns A TanStack Mutation object for the P2P transfer action.
 */
export const useP2PTransfer = (
  options?: UseMutationOptions<TransactionResponse, Error, P2PTransferPayload>
) => {
  const queryClient = useQueryClient();

  const p2pTransferMutation = async (payload: P2PTransferPayload): Promise<TransactionResponse> => {
    const { data } = await apiClient.post<TransactionResponse>('/transactions/p2p', payload, {
      baseURL: TRANSACTION_SERVICE_URL,
    });
    return data;
  };

  return useMutation<TransactionResponse, Error, P2PTransferPayload>({
    mutationFn: p2pTransferMutation,
    onSuccess: () => {
      // Invalidate transactions list and account balance to refresh the UI
      queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_BALANCE_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to perform a Self-Transfer (withdrawal) to one of the user's
 * linked external bank accounts (beneficiaries).
 * @param options Optional mutation options (e.g., onSuccess, onError callbacks).
 * @returns A TanStack Mutation object for the self-transfer action.
 */
export const useSelfTransfer = (
  options?: UseMutationOptions<TransactionResponse, Error, SelfTransferPayload>
) => {
  const queryClient = useQueryClient();

  const selfTransferMutation = async (
    payload: SelfTransferPayload
  ): Promise<TransactionResponse> => {
    const { data } = await apiClient.post<TransactionResponse>(
      '/transactions/self-transfer',
      payload,
      {
        baseURL: TRANSACTION_SERVICE_URL,
      }
    );
    return data;
  };

  return useMutation<TransactionResponse, Error, SelfTransferPayload>({
    mutationFn: selfTransferMutation,
    onSuccess: () => {
      // Invalidate transactions, beneficiaries, and account balance
      queryClient.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [BENEFICIARIES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [ACCOUNT_BALANCE_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to fetch the user's receiving preference.
 * @returns A TanStack Query object containing the receiving preference.
 */
export const useReceivingPreference = () => {
  const fetchReceivingPreference = async (): Promise<ReceivingPreference> => {
    const { data } = await apiClient.get<ReceivingPreference>('/transactions/receiving-preference', {
      baseURL: TRANSACTION_SERVICE_URL,
    });
    return data;
  };

  return useQuery<ReceivingPreference, Error>({
    queryKey: [RECEIVING_PREFERENCE_QUERY_KEY],
    queryFn: fetchReceivingPreference,
  });
};

/**
 * Custom hook to update the user's receiving preference.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for updating receiving preference.
 */
export const useUpdateReceivingPreference = (
  options?: UseMutationOptions<void, Error, UpdateReceivingPreferencePayload>
) => {
  const queryClient = useQueryClient();

  const updateReceivingPreferenceMutation = async (
    payload: UpdateReceivingPreferencePayload
  ): Promise<void> => {
    await apiClient.put('/transactions/receiving-preference', payload, {
      baseURL: TRANSACTION_SERVICE_URL,
    });
  };

  return useMutation<void, Error, UpdateReceivingPreferencePayload>({
    mutationFn: updateReceivingPreferenceMutation,
    onSuccess: () => {
      // Invalidate receiving preference to refresh the UI
      queryClient.invalidateQueries({ queryKey: [RECEIVING_PREFERENCE_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to fetch the user's default beneficiary.
 * @returns A TanStack Query object containing the default beneficiary.
 */
export const useDefaultBeneficiary = () => {
  const fetchDefaultBeneficiary = async (): Promise<Beneficiary> => {
    const { data } = await apiClient.get<Beneficiary>('/transactions/beneficiaries/default', {
      baseURL: TRANSACTION_SERVICE_URL,
    });
    return data;
  };

  return useQuery<Beneficiary, Error>({
    queryKey: [DEFAULT_BENEFICIARY_QUERY_KEY],
    queryFn: fetchDefaultBeneficiary,
  });
};

/**
 * Custom hook to set the user's default beneficiary.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for setting default beneficiary.
 */
export const useSetDefaultBeneficiary = (
  options?: UseMutationOptions<void, Error, SetDefaultBeneficiaryPayload>
) => {
  const queryClient = useQueryClient();

  const setDefaultBeneficiaryMutation = async (
    payload: SetDefaultBeneficiaryPayload
  ): Promise<void> => {
    await apiClient.put('/transactions/beneficiaries/default', payload, {
      baseURL: TRANSACTION_SERVICE_URL,
    });
  };

  return useMutation<void, Error, SetDefaultBeneficiaryPayload>({
    mutationFn: setDefaultBeneficiaryMutation,
    onSuccess: () => {
      // Invalidate both default beneficiary and beneficiaries list
      queryClient.invalidateQueries({ queryKey: [DEFAULT_BENEFICIARY_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [BENEFICIARIES_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to fetch the user's account balance.
 * @returns A TanStack Query object containing the account balance.
 */
export const useAccountBalance = () => {
  const fetchAccountBalance = async (): Promise<AccountBalance> => {
    console.log('Fetching account balance from:', `${TRANSACTION_SERVICE_URL}/transactions/account/balance`);
    try {
      const { data } = await apiClient.get<AccountBalance>('/transactions/account/balance', {
        baseURL: TRANSACTION_SERVICE_URL,
      });
      console.log('Account balance response:', data);
      return data;
    } catch (error) {
      console.error('Error fetching account balance:', error);
      throw error;
    }
  };

  return useQuery<AccountBalance, Error>({
    queryKey: [ACCOUNT_BALANCE_QUERY_KEY],
    queryFn: fetchAccountBalance,
    staleTime: 1000 * 60 * 2, // 2 minutes - balance is considered fresh for 2 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes after last use
    refetchOnWindowFocus: false, // Don't refetch when switching screens
    refetchOnMount: false, // Don't refetch when component mounts if data is fresh
    refetchInterval: false, // Disable automatic refetching
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
};
