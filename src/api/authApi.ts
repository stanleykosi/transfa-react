/**
 * @description
 * This file defines TanStack Query hooks for authentication-related API calls,
 * such as the user onboarding process.
 *
 * Key features:
 * - Abstraction: Encapsulates the logic for API mutations, separating it from UI components.
 * - State Management: Automatically handles loading, error, and success states for async operations.
 * - Type Safety: Uses the defined API types for request payloads and responses.
 *
 * @dependencies
 * - @tanstack/react-query: For the `useMutation` hook.
 * - @/api/apiClient: The configured Axios instance for making requests.
 * - @/types/api: For the request and response type definitions.
 */
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import apiClient from './apiClient';
import {
  AccountTypeOptionsResponse,
  AuthSessionResponse,
  OnboardingPayload,
  OnboardingResponse,
} from '@/types/api';
import { useAuth, useUser } from '@clerk/clerk-expo';

/**
 * A custom hook that provides a mutation function for submitting the user's
 * onboarding data to the backend.
 *
 * The backend expects snake_case keys and a Clerk user context. We attach:
 * - Authorization: Bearer <JWT>
 * - X-Clerk-User-Id: <user.id>
 */
export const useOnboardingMutation = (
  options?: UseMutationOptions<OnboardingResponse, unknown, OnboardingPayload>
) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const onboardingMutation = async (payload: OnboardingPayload): Promise<OnboardingResponse> => {
    const token = await getToken().catch(() => undefined);

    // Transform to backend's expected shape (snake_case)
    const body = {
      username: payload.username,
      user_type: payload.userType,
      email: payload.email,
      phone_number: payload.phoneNumber,
      kyc_data: payload.kycData,
    } as const;

    const { data } = await apiClient.post<OnboardingResponse>('/onboarding', body, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(user?.id ? { 'X-Clerk-User-Id': user.id } : {}),
      },
    });
    return data;
  };

  return useMutation<OnboardingResponse, unknown, OnboardingPayload>({
    mutationFn: onboardingMutation,
    ...(options || {}),
  });
};

/**
 * Fetches authenticated session bootstrap data from auth-service.
 * This endpoint is used after login to determine onboarding progression.
 */
export const fetchAuthSession = async (): Promise<AuthSessionResponse> => {
  const { data } = await apiClient.get<AuthSessionResponse>('/auth/session');
  return data;
};

export const fetchAccountTypeOptions = async (): Promise<AccountTypeOptionsResponse> => {
  const { data } = await apiClient.get<AccountTypeOptionsResponse>('/onboarding/account-types');
  return data;
};
