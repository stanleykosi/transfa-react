/**
 * @description
 * This file contains TypeScript type definitions for API request payloads
 * and response bodies, ensuring type safety throughout the application's
 * data-fetching layer.
 */

// Defines the shape of the data sent to the POST /onboarding endpoint.
export interface OnboardingPayload {
  userType: 'personal' | 'merchant';
  phoneNumber: string | undefined;
  kycData: {
    userType: 'personal' | 'merchant';
    // Tier 1 profile (personal) - structured name/address fields
    firstName?: string;
    lastName?: string;
    middleName?: string;
    maidenName?: string;
    addressLine1?: string;
    addressLine2?: string;
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

export interface AuthSessionOnboarding {
  status: string;
  reason?: string;
  next_step: 'app_tabs' | 'onboarding_form' | 'create_account' | 'create_username' | 'create_pin';
  resume_step?: 1 | 2 | 3;
  user_type?: 'personal' | 'merchant';
  draft?: Record<string, unknown>;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  clerk_user_id: string;
  user?: {
    id: string;
    clerk_user_id: string;
    username?: string | null;
    email?: string;
    phone_number?: string;
    full_name?: string;
    user_type: 'personal' | 'merchant';
    allow_sending: boolean;
    created_at: string;
    updated_at: string;
  };
  onboarding: AuthSessionOnboarding;
}

export interface AccountTypeOption {
  type: 'personal' | 'merchant';
  title: string;
  description: string;
}

export interface AccountTypeOptionsResponse {
  options: AccountTypeOption[];
}

export interface UserDiscoveryResult {
  id: string;
  username: string;
  full_name?: string | null;
}

export interface UserDiscoveryResponse {
  users: UserDiscoveryResult[];
}

export interface PrimaryAccountDetails {
  accountNumber?: string;
  bankName?: string;
}

export interface OnboardingStatusResponse {
  status: string;
  reason?: string;
  next_step: 'app_tabs' | 'onboarding_form' | 'create_account' | 'create_username' | 'create_pin';
  resume_step?: 1 | 2 | 3;
  user_type?: 'personal' | 'merchant';
  draft?: Record<string, unknown>;
}

export interface SetUsernamePayload {
  username: string;
}

export interface SetUsernameResponse {
  status: string;
  username: string;
}

export interface SetTransactionPinPayload {
  pin: string;
}

export interface SetTransactionPinResponse {
  status: string;
}

export interface SecurityStatusResponse {
  transaction_pin_set: boolean;
}

export interface Tier2VerificationPayload {
  dob: string;
  gender: 'male' | 'female';
  bvn: string;
}

export interface Tier2VerificationResponse {
  status: string;
}

export interface Tier1ProfileUpdatePayload {
  userType: 'personal';
  phoneNumber: string | undefined;
  kycData: {
    userType: 'personal';
    firstName: string;
    lastName: string;
    middleName?: string;
    maidenName?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface Tier1ProfileUpdateResponse {
  status: string;
}

export interface OnboardingProgressPayload {
  userType: 'personal' | 'merchant';
  currentStep: 1 | 2 | 3;
  payload?: Record<string, unknown>;
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
  transaction_pin: string;
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
  transaction_pin: string;
}

export interface BulkP2PTransferItemPayload {
  recipient_username: string;
  amount: number; // in kobo
  description: string; // Required for Anchor API compliance
}

export interface BulkP2PTransferPayload {
  transfers: BulkP2PTransferItemPayload[];
  transaction_pin: string;
}

export interface BulkP2PTransferFailure {
  recipient_username: string;
  amount: number;
  description: string;
  error: string;
}

export interface BulkP2PTransferResponse {
  batch_id: string;
  status: 'completed' | 'partial_failed' | 'failed';
  message: string;
  total_amount: number;
  total_fee: number;
  success_count: number;
  failure_count: number;
  successful_transfers: TransactionResponse[];
  failed_transfers: BulkP2PTransferFailure[];
  successful_transaction_ids: string[];
}

// Payload for POST /transactions/self-transfer
export interface SelfTransferPayload {
  beneficiary_id: string;
  amount: number; // in kobo
  description: string; // Required for Anchor API compliance
  transaction_pin: string;
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

export interface UserProfileSummary {
  id: string;
  username: string;
  full_name?: string | null;
}

export interface BilateralTransactionHistoryResponse {
  user: UserProfileSummary;
  shareable_link: string;
  transactions: TransactionHistoryItem[];
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
// Platform Fee Types
// =================================================================

export interface PlatformFeeStatus {
  status: 'pending' | 'paid' | 'failed' | 'delinquent' | 'waived' | 'none';
  period_start?: string;
  period_end?: string;
  due_at?: string;
  grace_until?: string;
  amount?: number;
  currency?: string;
  retry_count?: number;
  last_attempt_at?: string;
  is_delinquent: boolean;
  is_within_grace: boolean;
}

export interface PlatformFeeInvoice {
  id: string;
  user_id: string;
  user_type: 'personal' | 'merchant';
  period_start: string;
  period_end: string;
  due_at: string;
  grace_until: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'delinquent' | 'waived';
  paid_at?: string;
  last_attempt_at?: string;
  retry_count: number;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

// Structure for a payment request object from the API.
export interface PaymentRequest {
  id: string;
  creator_id: string;
  creator_username?: string;
  creator_full_name?: string;
  status: 'pending' | 'processing' | 'fulfilled' | 'declined';
  display_status: 'pending' | 'paid' | 'declined';
  request_type: 'general' | 'individual';
  title: string;
  recipient_user_id?: string;
  recipient_username?: string;
  recipient_full_name?: string;
  amount: number; // in kobo
  description?: string;
  image_url?: string;
  fulfilled_by_user_id?: string;
  settled_transaction_id?: string;
  processing_started_at?: string;
  responded_at?: string;
  declined_reason?: string;
  shareable_link?: string;
  qr_code_content?: string;
  created_at: string;
  updated_at: string;
}

// Payload for creating a new payment request.
export interface CreatePaymentRequestPayload {
  request_type: 'general' | 'individual';
  title: string;
  recipient_username?: string;
  amount: number; // in kobo
  description?: string;
  image_url?: string;
}

export interface ListPaymentRequestsParams {
  limit?: number;
  offset?: number;
  q?: string;
  status?: 'pending' | 'processing' | 'fulfilled' | 'declined';
}

export interface PayIncomingPaymentRequestPayload {
  transaction_pin: string;
}

export interface DeclineIncomingPaymentRequestPayload {
  reason?: string;
}

export interface PayIncomingPaymentRequestResponse {
  request: PaymentRequest;
  transaction: TransactionResponse;
}

export interface TransferListMember {
  user_id: string;
  username: string;
  full_name?: string | null;
  created_at: string;
}

export interface TransferListSummary {
  id: string;
  owner_id: string;
  name: string;
  member_count: number;
  member_usernames: string[];
  created_at: string;
  updated_at: string;
}

export interface TransferList {
  id: string;
  owner_id: string;
  name: string;
  member_count: number;
  members: TransferListMember[];
  created_at: string;
  updated_at: string;
}

export interface ListTransferListsParams {
  limit?: number;
  offset?: number;
  q?: string;
}

export interface CreateTransferListPayload {
  name: string;
  member_usernames: string[];
}

export interface UpdateTransferListPayload {
  name: string;
  member_usernames: string[];
}

export interface ToggleTransferListMemberPayload {
  username: string;
}

export interface ToggleTransferListMemberResponse {
  list: TransferList;
  member?: TransferListMember;
  in_list: boolean;
  added: boolean;
  removed: boolean;
  username: string;
}

export interface NotificationListParams {
  limit?: number;
  offset?: number;
  q?: string;
  category?: 'request' | 'newsletter' | 'system';
  status?: 'unread' | 'read';
}

export interface InAppNotification {
  id: string;
  user_id: string;
  category: 'request' | 'newsletter' | 'system';
  type: string;
  title: string;
  body?: string;
  status: 'unread' | 'read';
  related_entity_type?: string;
  related_entity_id?: string;
  data?: Record<string, unknown>;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationUnreadCounts {
  total: number;
  request: number;
  newsletter: number;
  system: number;
}

export interface TransactionStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  fee: number;
  failure_reason?: string;
  anchor_reason?: string;
  transfer_type?: string;
}

// =================================================================
// Money Drop Types
// =================================================================

export interface CreateMoneyDropPayload {
  amount_per_claim: number; // in kobo
  number_of_people: number;
  expiry_in_minutes: number;
  transaction_pin: string;
}

export interface MoneyDropResponse {
  money_drop_id: string;
  qr_code_content: string;
  shareable_link: string;
  total_amount: number;
  amount_per_claim: number;
  number_of_people: number;
  fee: number; // Fee charged for creating the money drop (in kobo)
  expiry_timestamp: string;
}

export interface ClaimMoneyDropResponse {
  message: string;
  amount_claimed: number;
  creator_username: string;
}

export interface MoneyDropDetails {
  id: string;
  creator_username: string;
  amount_per_claim: number;
  status: 'active' | 'completed' | 'expired_and_refunded';
  is_claimable: boolean;
  message: string;
}
