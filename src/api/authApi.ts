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
import { useMutation } from '@tanstack/react-query';
import apiClient from './apiClient';
import { OnboardingPayload, OnboardingResponse } from '@/types/api';

/**
 * A custom hook that provides a mutation function for submitting the user's
 * onboarding data to the backend.
 *
 * @returns A TanStack Query mutation object with `mutate`, `isPending`, `isError`, etc.
 */
export const useOnboardingMutation = () => {
  const onboardingMutation = async (payload: OnboardingPayload): Promise<OnboardingResponse> => {
    const { data } = await apiClient.post<OnboardingResponse>('/onboarding', payload);
    return data;
  };

  return useMutation({
    mutationFn: onboardingMutation,
  });
};
