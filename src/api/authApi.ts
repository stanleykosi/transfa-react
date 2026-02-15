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
  OnboardingStatusResponse,
  OnboardingPayload,
  OnboardingProgressPayload,
  OnboardingResponse,
  SecurityStatusResponse,
  SetTransactionPinPayload,
  SetTransactionPinResponse,
  SetUsernamePayload,
  SetUsernameResponse,
  Tier1ProfileUpdatePayload,
  Tier1ProfileUpdateResponse,
  Tier2VerificationPayload,
  Tier2VerificationResponse,
  UserDiscoveryResponse,
} from '@/types/api';
import { useAuth, useUser } from '@clerk/clerk-expo';

export const submitOnboarding = async (payload: OnboardingPayload): Promise<OnboardingResponse> => {
  const body = {
    user_type: payload.userType,
    phone_number: payload.phoneNumber,
    kyc_data: payload.kycData,
  } as const;

  const { data } = await apiClient.post<OnboardingResponse>('/onboarding', body);
  return data;
};

export const fetchOnboardingStatus = async (): Promise<OnboardingStatusResponse> => {
  const { data } = await apiClient.get<OnboardingStatusResponse>('/onboarding/status');
  return data;
};

export const submitTier2Verification = async (
  payload: Tier2VerificationPayload
): Promise<Tier2VerificationResponse> => {
  const { data } = await apiClient.post<Tier2VerificationResponse>('/onboarding/tier2', payload);
  return data;
};

export const submitTier1ProfileUpdate = async (
  payload: Tier1ProfileUpdatePayload
): Promise<Tier1ProfileUpdateResponse> => {
  const body = {
    user_type: payload.userType,
    phone_number: payload.phoneNumber,
    kyc_data: payload.kycData,
  } as const;

  const { data } = await apiClient.post<Tier1ProfileUpdateResponse>(
    '/onboarding/tier1/update',
    body
  );
  return data;
};

export const saveOnboardingProgress = async (payload: OnboardingProgressPayload): Promise<void> => {
  await apiClient.post('/onboarding/progress', {
    user_type: payload.userType,
    current_step: payload.currentStep,
    payload: payload.payload || {},
  });
};

export const clearOnboardingProgress = async (): Promise<void> => {
  await apiClient.post('/onboarding/progress/clear');
};

export const submitUsernameSetup = async (
  payload: SetUsernamePayload
): Promise<SetUsernameResponse> => {
  const { data } = await apiClient.post<SetUsernameResponse>('/me/username', payload);
  return data;
};

export const submitTransactionPinSetup = async (
  payload: SetTransactionPinPayload
): Promise<SetTransactionPinResponse> => {
  const { data } = await apiClient.post<SetTransactionPinResponse>('/me/transaction-pin', payload);
  return data;
};

export const fetchSecurityStatus = async (): Promise<SecurityStatusResponse> => {
  const { data } = await apiClient.get<SecurityStatusResponse>('/me/security-status');
  return data;
};

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

    const { data } = await apiClient.post<OnboardingResponse>(
      '/onboarding',
      {
        user_type: payload.userType,
        phone_number: payload.phoneNumber,
        kyc_data: payload.kycData,
      },
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(user?.id ? { 'X-Clerk-User-Id': user.id } : {}),
        },
      }
    );
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

export const searchUsers = async (query: string, limit = 10): Promise<UserDiscoveryResponse> => {
  const { data } = await apiClient.get<UserDiscoveryResponse>('/users/search', {
    params: { q: query, limit },
  });
  return data;
};

export const fetchFrequentUsers = async (limit = 6): Promise<UserDiscoveryResponse> => {
  const { data } = await apiClient.get<UserDiscoveryResponse>('/users/frequent', {
    params: { limit },
  });
  return data;
};
