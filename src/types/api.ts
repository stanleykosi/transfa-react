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
  is_default: boolean;
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

// Payload for POST /transactions/p2p
export interface P2PTransferPayload {
  recipient_username: string;
  amount: number; // in kobo
  description: string; // Required for Anchor API compliance
}

// Payload for POST /transactions/self-transfer
export interface SelfTransferPayload {
  beneficiary_id: string;
  amount: number; // in kobo
  description: string; // Required for Anchor API compliance
}

// Generic response for a transaction initiation
export interface TransactionResponse {
  transaction_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  message: string;
  amount?: number; // in kobo
  fee?: number; // in kobo
  timestamp?: string;
}

// Transaction history item from the backend
export interface TransactionHistoryItem {
  id: string;
  anchor_transfer_id?: string;
  sender_id: string;
  recipient_id?: string;
  source_account_id: string;
  destination_account_id?: string;
  destination_beneficiary_id?: string;
  type: string;
  category: string;
  status: string;
  amount: number;
  fee: number;
  description: string;
  created_at: string;
  updated_at: string;
}

// User's receiving preference for incoming transfers
export interface ReceivingPreference {
  user_id: string;
  use_external_account: boolean; // true = use beneficiary, false = use internal wallet
  default_beneficiary_id?: string;
  created_at: string;
  updated_at: string;
}

// Payload for updating receiving preference
export interface UpdateReceivingPreferencePayload {
  use_external_account: boolean;
  default_beneficiary_id?: string;
}

// Payload for setting default beneficiary
export interface SetDefaultBeneficiaryPayload {
  beneficiary_id: string;
}

// Account balance information
export interface AccountBalance {
  available_balance: number; // in kobo
  ledger_balance: number; // in kobo
  hold: number; // in kobo
  pending: number; // in kobo
}

// =================================================================
// Subscription Types
// =================================================================

// Represents the user's subscription status as returned by the backend.
export interface SubscriptionStatus {
  status: 'active' | 'inactive' | 'lapsed';
  current_period_end?: string; // ISO 8601 date string
  auto_renew: boolean;
  is_active: boolean;
  transfers_remaining: number; // -1 for unlimited (premium), 0-5 for free tier
}

// Structure for a payment request object from the API.
export interface PaymentRequest {
  id: string;
  creator_id: string;
  status: 'pending' | 'fulfilled';
  amount: number; // in kobo
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

// Payload for creating a new payment request.
export interface CreatePaymentRequestPayload {
  amount: number; // in kobo
  description?: string;
  image_url?: string;
}
