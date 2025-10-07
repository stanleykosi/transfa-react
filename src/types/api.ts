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

// Represents a single beneficiary (external bank account).
// This shape matches the response from the GET /beneficiaries endpoint.
export interface Beneficiary {
  id: string;
  user_id: string;
  anchor_counterparty_id: string;
  account_name: string;
  account_number_masked: string;
  bank_name: string;
  created_at: string;
  updated_at: string;
}

// Payload for the POST /beneficiaries endpoint to add a new beneficiary.
// Note: The backend handles verification internally, so we only need these fields.
export interface AddBeneficiaryPayload {
  account_number: string;
  bank_code: string;
}

// Represents a single bank from the banks list.
export interface Bank {
  id: string;
  type: string;
  attributes: {
    name: string;
    nipCode: string;
  };
}

// Response from the GET /banks endpoint.
export interface BanksResponse {
  data: Bank[];
}
