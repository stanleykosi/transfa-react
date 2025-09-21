/**
 * @description
 * This file contains TypeScript type definitions for API request payloads
 * and response bodies, ensuring type safety throughout the application's
 * data-fetching layer.
 */

// Defines the shape of the data sent to the POST /onboarding endpoint.
export interface OnboardingPayload {
  username: string;
  userType: 'personal' | 'merchant';
  email: string | undefined;
  phoneNumber: string | undefined;
  kycData: {
    userType: 'personal' | 'merchant';
    fullName?: string;
    bvn?: string;
    dateOfBirth?: string;
    gender?: 'Male' | 'Female';
    businessName?: string;
    rcNumber?: string;
  };
}

// Defines the expected shape of a successful response from the POST /onboarding endpoint.
export interface OnboardingResponse {
  user_id: string;
  status: string;
}
