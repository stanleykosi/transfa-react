/**
 * @description
 * This file defines TanStack Query hooks for account-related API calls,
 * specifically for managing user beneficiaries (external bank accounts).
 *
 * Key features:
 * - Abstraction: Encapsulates the logic for API queries and mutations, separating it from UI components.
 * - State Management: Automatically handles loading, error, success, and caching for account data.
 * - Type Safety: Uses defined API types for request payloads and responses.
 *
 * @dependencies
 * - @tanstack/react-query: For `useQuery` and `useMutation` hooks.
 * - @/api/apiClient: The configured Axios instance for making authenticated requests.
 * - @/types/api: For beneficiary-related type definitions.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import apiClient from './apiClient';

// Account service URL from environment variables
const ACCOUNT_SERVICE_URL = process.env.EXPO_PUBLIC_ACCOUNT_SERVICE_URL;
import {
  Beneficiary,
  AddBeneficiaryPayload,
  BanksResponse,
  VerifyBeneficiaryAccountPayload,
  VerifyBeneficiaryAccountResponse,
} from '@/types/api';

// Define query keys for caching and invalidation.
const BENEFICIARIES_QUERY_KEY = 'beneficiaries';
const BANKS_QUERY_KEY = 'banks';

/**
 * Custom hook to fetch the list of beneficiaries for the authenticated user.
 * @returns A TanStack Query object containing the list of beneficiaries, loading state, etc.
 */
export const useListBeneficiaries = () => {
  const fetchBeneficiaries = async (): Promise<Beneficiary[]> => {
    const { data } = await apiClient.get<Beneficiary[]>('/beneficiaries', {
      baseURL: ACCOUNT_SERVICE_URL,
    });
    return data;
  };

  return useQuery<Beneficiary[], Error>({
    queryKey: [BENEFICIARIES_QUERY_KEY],
    queryFn: fetchBeneficiaries,
  });
};

/**
 * Custom hook to fetch the list of supported banks.
 * This is cached for a long time since banks don't change frequently.
 * @returns A TanStack Query object containing the list of banks, loading state, etc.
 */
export const useListBanks = () => {
  const fetchBanks = async (): Promise<BanksResponse> => {
    const { data } = await apiClient.get<BanksResponse>('/banks', {
      baseURL: ACCOUNT_SERVICE_URL,
    });
    return data;
  };

  return useQuery<BanksResponse, Error>({
    queryKey: [BANKS_QUERY_KEY],
    queryFn: fetchBanks,
    staleTime: 1000 * 60 * 60, // 1 hour - banks don't change often
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};

/**
 * Custom hook to add a new beneficiary for the authenticated user.
 * The backend handles verification internally during the creation process.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for the add action.
 */
export const useAddBeneficiary = (
  options?: UseMutationOptions<Beneficiary, Error, AddBeneficiaryPayload>
) => {
  const queryClient = useQueryClient();

  const addBeneficiaryMutation = async (payload: AddBeneficiaryPayload): Promise<Beneficiary> => {
    const { data } = await apiClient.post<Beneficiary>('/beneficiaries', payload, {
      baseURL: ACCOUNT_SERVICE_URL,
    });
    return data;
  };

  return useMutation<Beneficiary, Error, AddBeneficiaryPayload>({
    mutationFn: addBeneficiaryMutation,
    onSuccess: () => {
      // After a new beneficiary is added, invalidate the beneficiaries list
      // to trigger a re-fetch and update the UI.
      queryClient.invalidateQueries({ queryKey: [BENEFICIARIES_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to delete a beneficiary.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for the delete action.
 */
export const useDeleteBeneficiary = (options?: UseMutationOptions<void, Error, string>) => {
  const queryClient = useQueryClient();
  const deleteBeneficiaryMutation = async (beneficiaryId: string): Promise<void> => {
    await apiClient.delete(`/beneficiaries/${beneficiaryId}`, {
      baseURL: ACCOUNT_SERVICE_URL,
    });
  };

  return useMutation<void, Error, string>({
    mutationFn: deleteBeneficiaryMutation,
    onSuccess: () => {
      // After deleting a beneficiary, invalidate the list to update the UI.
      queryClient.invalidateQueries({ queryKey: [BENEFICIARIES_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Resolve account details before linking a new beneficiary.
 */
export const useVerifyBeneficiaryAccount = (
  options?: UseMutationOptions<
    VerifyBeneficiaryAccountResponse,
    Error,
    VerifyBeneficiaryAccountPayload
  >
) => {
  const verifyBeneficiaryMutation = async (
    payload: VerifyBeneficiaryAccountPayload
  ): Promise<VerifyBeneficiaryAccountResponse> => {
    const { data } = await apiClient.post<VerifyBeneficiaryAccountResponse>(
      '/beneficiaries/verify',
      payload,
      {
        baseURL: ACCOUNT_SERVICE_URL,
      }
    );
    return data;
  };

  return useMutation<VerifyBeneficiaryAccountResponse, Error, VerifyBeneficiaryAccountPayload>({
    mutationFn: verifyBeneficiaryMutation,
    ...options,
  });
};
