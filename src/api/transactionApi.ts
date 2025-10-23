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
  queryOptions,
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
  PaymentRequest,
  CreatePaymentRequestPayload,
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
const PAYMENT_REQUESTS_QUERY_KEY = 'paymentRequests';
const USER_PROFILE_QUERY_KEY = 'user-profile';

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
    const { data } = await apiClient.get<ReceivingPreference>(
      '/transactions/receiving-preference',
      {
        baseURL: TRANSACTION_SERVICE_URL,
      }
    );
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
    console.log(
      'Fetching account balance from:',
      `${TRANSACTION_SERVICE_URL}/transactions/account/balance`
    );
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
    staleTime: 1000 * 30, // 30 seconds - balance is considered fresh for 30 seconds
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes after last use
    refetchOnWindowFocus: true, // Refetch when switching screens
    refetchOnMount: true, // Refetch when component mounts
    refetchInterval: false, // Disable automatic refetching
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
};

/**
 * Custom hook to fetch user's transaction history.
 * @returns A TanStack Query object for the transaction history.
 */
export const useTransactionHistory = () => {
  const fetchTransactionHistory = async (): Promise<TransactionResponse[]> => {
    console.log(
      'Fetching transaction history from:',
      `${TRANSACTION_SERVICE_URL}/transactions/transactions`
    );
    try {
      const { data } = await apiClient.get<TransactionResponse[]>('/transactions/transactions', {
        baseURL: TRANSACTION_SERVICE_URL,
      });
      console.log('Transaction history response:', data);
      return data;
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw error;
    }
  };

  return useQuery<TransactionResponse[], Error>({
    queryKey: [TRANSACTIONS_QUERY_KEY],
    queryFn: fetchTransactionHistory,
    staleTime: 1000 * 30, // 30 seconds - transactions are considered fresh for 30 seconds
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes after last use
    refetchOnWindowFocus: true, // Refetch when switching screens
    refetchOnMount: true, // Refetch when component mounts
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
};

export interface TransactionFeeResponse {
  p2p_fee_kobo: number;
  self_fee_kobo: number;
}

export const TRANSACTION_FEES_QUERY_KEY = 'transaction-fees';

const feesQuery = queryOptions<TransactionFeeResponse, Error>({
  queryKey: [TRANSACTION_FEES_QUERY_KEY],
  queryFn: async (): Promise<TransactionFeeResponse> => {
    console.log('Fetching transaction fees from:', `${TRANSACTION_SERVICE_URL}/transactions/fees`);
    const { data } = await apiClient.get<TransactionFeeResponse>('/transactions/fees', {
      baseURL: TRANSACTION_SERVICE_URL,
    });
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 10,
  refetchOnWindowFocus: false,
});

export const useTransactionFees = () => {
  return useQuery(feesQuery);
};

export const getTransactionFeesQuery = () => feesQuery;

/**
 * Custom hook to list all payment requests for the authenticated user.
 * @returns A TanStack Query object containing the list of payment requests.
 */
export const useListPaymentRequests = () => {
  const fetchPaymentRequests = async (): Promise<PaymentRequest[]> => {
    const { data } = await apiClient.get<PaymentRequest[]>('/transactions/payment-requests', {
      baseURL: TRANSACTION_SERVICE_URL,
    });
    return data;
  };

  return useQuery<PaymentRequest[], Error>({
    queryKey: [PAYMENT_REQUESTS_QUERY_KEY],
    queryFn: fetchPaymentRequests,
  });
};

/**
 * Custom hook to create a new payment request.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for the creation action.
 */
export const useCreatePaymentRequest = (
  options?: UseMutationOptions<PaymentRequest, Error, CreatePaymentRequestPayload>
) => {
  const queryClient = useQueryClient();

  const createPaymentRequestMutation = async (
    payload: CreatePaymentRequestPayload
  ): Promise<PaymentRequest> => {
    const { data } = await apiClient.post<PaymentRequest>(
      '/transactions/payment-requests',
      payload,
      {
        baseURL: TRANSACTION_SERVICE_URL,
      }
    );
    return data;
  };

  return useMutation<PaymentRequest, Error, CreatePaymentRequestPayload>({
    mutationFn: createPaymentRequestMutation,
    onSuccess: () => {
      // After creating a request, invalidate the list to update the UI.
      queryClient.invalidateQueries({ queryKey: [PAYMENT_REQUESTS_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to fetch a single payment request by its ID.
 * @param requestId The ID of the payment request to fetch.
 * @returns A TanStack Query object containing the payment request details.
 */
export const useGetPaymentRequest = (requestId: string) => {
  const fetchPaymentRequest = async (): Promise<PaymentRequest> => {
    const { data } = await apiClient.get<PaymentRequest>(
      `/transactions/payment-requests/${requestId}`,
      {
        baseURL: TRANSACTION_SERVICE_URL,
      }
    );
    return data;
  };

  return useQuery<PaymentRequest, Error>({
    queryKey: [PAYMENT_REQUESTS_QUERY_KEY, requestId],
    queryFn: fetchPaymentRequest,
    enabled: !!requestId, // Only run the query if requestId is available.
  });
};

/**
 * Custom hook to fetch the current user's profile including their UUID.
 * This UUID is needed to correctly identify transaction direction (sent vs received).
 * Fetches from auth-service via API Gateway.
 * @returns A TanStack Query object containing the user's profile with UUID.
 */
export interface UserProfile {
  id: string; // UUID from backend database
  clerk_user_id: string; // Clerk ID for reference
  username: string; // Actual username from database
  email?: string | null;
  phone_number?: string | null;
  full_name?: string | null;
  user_type: 'personal' | 'merchant';
  allow_sending: boolean;
  created_at: string;
  updated_at: string;
}

export const useUserProfile = () => {
  const fetchUserProfile = async (): Promise<UserProfile> => {
    // Use API Gateway URL (not TRANSACTION_SERVICE_URL) to route to auth-service
    const { data } = await apiClient.get<UserProfile>('/me/profile');
    console.log('User profile fetched:', data);
    return data;
  };

  return useQuery<UserProfile, Error>({
    queryKey: [USER_PROFILE_QUERY_KEY],
    queryFn: fetchUserProfile,
    staleTime: 1000 * 60 * 5, // User profile is fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    retry: 2,
  });
};
