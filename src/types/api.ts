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
    // Tier 0 (personal) - structured name fields
    firstName?: string;
    lastName?: string;
    middleName?: string;
    maidenName?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    // Tier 1 (personal)
    bvn?: string;
    dateOfBirth?: string;
    gender?: 'Male' | 'Female';
    // Business basics
    businessName?: string;
    rcNumber?: string;
  };
}

// Defines the expected shape of a successful response from the POST /onboarding endpoint.
export interface OnboardingResponse {
  user_id: string;
  status: string;
  anchor_customer_id?: string;
}
