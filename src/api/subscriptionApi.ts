/**
 * @description
 * This file defines TanStack Query hooks for subscription-related API calls.
 * It provides hooks for fetching the user's subscription status and usage,
 * as well as mutations for upgrading or canceling a subscription.
 *
 * Key features:
 * - Abstraction: Encapsulates all API logic for subscriptions.
 * - State Management: Automatically handles server state, caching, and re-fetching.
 * - Type Safety: Uses defined API types for all requests and responses.
 *
 * @dependencies
 * - @tanstack/react-query: For `useQuery` and `useMutation` hooks.
 * - @/api/apiClient: The configured Axios instance for authenticated requests.
 * - @/types/api: For subscription-related type definitions.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import apiClient from './apiClient';
import { SubscriptionStatus } from '@/types/api';

// Subscription service URL from environment variables with a fallback
const SUBSCRIPTION_SERVICE_URL =
  process.env.EXPO_PUBLIC_SUBSCRIPTION_SERVICE_URL || 'http://localhost:8085';

// Define a query key for caching and invalidation purposes.
export const SUBSCRIPTION_STATUS_QUERY_KEY = 'subscriptionStatus';

/**
 * Custom hook to fetch the user's current subscription status and usage details.
 * @returns A TanStack Query object containing the subscription status, loading state, etc.
 */
export const useSubscriptionStatus = () => {
  const fetchSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
    const { data } = await apiClient.get<SubscriptionStatus>('/status', {
      baseURL: SUBSCRIPTION_SERVICE_URL,
    });
    return data;
  };

  return useQuery<SubscriptionStatus, Error>({
    queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
    queryFn: fetchSubscriptionStatus,
  });
};

/**
 * Custom hook to upgrade a user's subscription to the premium plan.
 * @param options Optional mutation options (e.g., onSuccess, onError).
 * @returns A TanStack Mutation object for the upgrade action.
 */
export const useUpgradeSubscription = (options?: UseMutationOptions<void, Error, void>) => {
  const queryClient = useQueryClient();

  const upgradeSubscriptionMutation = async (): Promise<void> => {
    await apiClient.post('/upgrade', null, {
      baseURL: SUBSCRIPTION_SERVICE_URL,
    });
  };

  return useMutation<void, Error, void>({
    mutationFn: upgradeSubscriptionMutation,
    onSuccess: () => {
      // After upgrading, invalidate the subscription status query
      // to re-fetch the latest data and update the UI.
      queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to cancel a user's subscription auto-renewal.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for the cancel action.
 */
export const useCancelSubscription = (options?: UseMutationOptions<void, Error, void>) => {
  const queryClient = useQueryClient();

  const cancelSubscriptionMutation = async (): Promise<void> => {
    await apiClient.post('/cancel', null, {
      baseURL: SUBSCRIPTION_SERVICE_URL,
    });
  };

  return useMutation<void, Error, void>({
    mutationFn: cancelSubscriptionMutation,
    onSuccess: () => {
      // Invalidate subscription status to reflect the change in auto-renewal.
      queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY] });
    },
    ...options,
  });
};

/**
 * Custom hook to toggle a user's subscription auto-renewal setting.
 * @param options Optional mutation options.
 * @returns A TanStack Mutation object for the toggle action.
 */
export const useToggleAutoRenew = (options?: UseMutationOptions<void, Error, boolean>) => {
  const queryClient = useQueryClient();

  const toggleAutoRenewMutation = async (enable: boolean): Promise<void> => {
    await apiClient.put(
      '/auto-renew',
      { auto_renew: enable },
      {
        baseURL: SUBSCRIPTION_SERVICE_URL,
      }
    );
  };

  return useMutation<void, Error, boolean>({
    mutationFn: toggleAutoRenewMutation,
    onSuccess: () => {
      // Invalidate subscription status to reflect the change in auto-renewal.
      queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY] });
    },
    ...options,
  });
};
