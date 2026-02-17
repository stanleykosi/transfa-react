-- Consolidated schema for Transfa (for Supabase SQL editor)
-- Generated from supabase/migrations/*.sql and updated for platform fees
-- Run on a fresh database.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM types
CREATE TYPE public.user_type AS ENUM ('personal', 'merchant');
CREATE TYPE public.account_type AS ENUM ('primary', 'money_drop');
CREATE TYPE public.account_status AS ENUM ('active', 'frozen');
CREATE TYPE public.transaction_type AS ENUM (
    'p2p',
    'self_transfer',
    'money_drop_funding',
    'money_drop_claim',
    'money_drop_refund',
    'platform_fee'
);
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE public.money_drop_status AS ENUM ('active', 'completed', 'expired_and_refunded');
CREATE TYPE public.payment_request_status AS ENUM ('pending', 'processing', 'fulfilled', 'declined');
CREATE TYPE public.payment_request_type AS ENUM ('general', 'individual');
CREATE TYPE public.notification_category AS ENUM ('request', 'newsletter', 'system');
CREATE TYPE public.notification_status AS ENUM ('unread', 'read');
CREATE TYPE public.platform_fee_status AS ENUM ('pending', 'paid', 'failed', 'delinquent', 'waived');
CREATE TYPE public.platform_fee_attempt_status AS ENUM ('success', 'failed');

-- Functions
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_valid_json(input_text text) RETURNS boolean AS $$
BEGIN
    PERFORM input_text::json;
    RETURN TRUE;
EXCEPTION
    WHEN others THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.is_valid_json(text) IS 'Validates if the input text is valid JSON format';

-- Core tables
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    anchor_customer_id VARCHAR(255) UNIQUE,
    username VARCHAR(50) UNIQUE,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(50) UNIQUE,
    full_name VARCHAR(255),
    profile_picture_url TEXT,
    user_type public.user_type NOT NULL,
    allow_sending BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Stores user profile information, linking Clerk auth to internal and BaaS IDs.';
COMMENT ON COLUMN public.users.id IS 'Internal unique identifier for the user (UUID).';
COMMENT ON COLUMN public.users.clerk_user_id IS 'Foreign key to the Clerk user ID. Used for RLS policies.';
COMMENT ON COLUMN public.users.anchor_customer_id IS 'Foreign key to the Anchor BaaS customer resource ID.';
COMMENT ON COLUMN public.users.username IS 'Unique, user-chosen, and searchable username.';
COMMENT ON COLUMN public.users.user_type IS 'Type of user account: personal or merchant.';
COMMENT ON COLUMN public.users.allow_sending IS 'Flag to control sending capabilities, primarily for merchants.';

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.user_security_credentials (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_pin_hash TEXT NOT NULL,
    pin_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    last_failed_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_security_credentials IS 'Backend-managed security credentials for users (e.g., transaction PIN hash).';
COMMENT ON COLUMN public.user_security_credentials.transaction_pin_hash IS 'bcrypt hash of the user transaction PIN.';
COMMENT ON COLUMN public.user_security_credentials.pin_set_at IS 'Timestamp when the user last set/rotated their transaction PIN.';
COMMENT ON COLUMN public.user_security_credentials.failed_attempts IS 'Server-side failed PIN verification counter for lockout enforcement.';
COMMENT ON COLUMN public.user_security_credentials.locked_until IS 'If set in the future, PIN verification should be blocked until this time.';

CREATE TRIGGER set_user_security_credentials_updated_at
BEFORE UPDATE ON public.user_security_credentials
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    anchor_account_id VARCHAR(255) UNIQUE,
    virtual_nuban VARCHAR(10) UNIQUE,
    account_type public.account_type NOT NULL DEFAULT 'primary',
    balance BIGINT NOT NULL DEFAULT 0,
    status public.account_status NOT NULL DEFAULT 'active',
    bank_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX idx_accounts_bank_name ON public.accounts(bank_name);
CREATE UNIQUE INDEX idx_accounts_user_money_drop
ON public.accounts(user_id, account_type)
WHERE account_type = 'money_drop';

COMMENT ON TABLE public.accounts IS 'Stores user wallet accounts, linking them to users and Anchor BaaS accounts.';
COMMENT ON COLUMN public.accounts.user_id IS 'Foreign key to the internal user ID.';
COMMENT ON COLUMN public.accounts.anchor_account_id IS 'Foreign key to the Anchor BaaS deposit account resource ID. NULL for money_drop accounts that have not been provisioned yet.';
COMMENT ON COLUMN public.accounts.virtual_nuban IS 'The unique NUBAN for funding this wallet. NULL for money_drop accounts that have not been provisioned yet.';
COMMENT ON COLUMN public.accounts.account_type IS 'Type of account: primary wallet or a special-purpose account like for Money Drops.';
COMMENT ON COLUMN public.accounts.balance IS 'Current account balance, stored in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.accounts.status IS 'Status of the account (e.g., active, frozen).';
COMMENT ON COLUMN public.accounts.bank_name IS 'The name of the bank associated with the Virtual NUBAN (e.g., CORESTEP MICROFINANCE BANK).';

CREATE TRIGGER set_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.onboarding_status (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, stage)
);

CREATE INDEX idx_onboarding_status_updated_at ON public.onboarding_status(updated_at);

COMMENT ON TABLE public.onboarding_status IS 'Tracks onboarding stage status transitions for each user.';
COMMENT ON COLUMN public.onboarding_status.stage IS 'Onboarding stage key (e.g., tier1, tier2).';
COMMENT ON COLUMN public.onboarding_status.status IS 'Current stage status (e.g., pending, created, completed, failed).';
COMMENT ON COLUMN public.onboarding_status.reason IS 'Optional failure or review reason for the current status.';

CREATE TABLE public.onboarding_progress (
    clerk_user_id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    user_type TEXT NOT NULL DEFAULT 'personal',
    current_step SMALLINT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 3),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_progress_updated_at
ON public.onboarding_progress(updated_at);
CREATE UNIQUE INDEX idx_onboarding_progress_user_id
ON public.onboarding_progress(user_id)
WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.onboarding_progress IS 'Stores draft onboarding progress for resume-after-login behavior.';
COMMENT ON COLUMN public.onboarding_progress.current_step IS 'Latest onboarding step reached (1-3).';
COMMENT ON COLUMN public.onboarding_progress.payload IS 'Partial onboarding form payload for draft resume.';

CREATE TABLE public.event_outbox (
    id BIGSERIAL PRIMARY KEY,
    exchange TEXT NOT NULL,
    routing_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('pending', 'processing', 'published'))
);

CREATE INDEX idx_event_outbox_dispatch
ON public.event_outbox(status, next_attempt_at, created_at);

CREATE INDEX idx_event_outbox_processing_started_at
ON public.event_outbox(processing_started_at)
WHERE status = 'processing';

COMMENT ON TABLE public.event_outbox IS 'Transactional outbox for reliable async event publishing.';
COMMENT ON COLUMN public.event_outbox.status IS 'Dispatch state: pending, processing, published.';
COMMENT ON COLUMN public.event_outbox.next_attempt_at IS 'Time when the dispatcher should retry publishing.';

-- Cached banks
CREATE TABLE public.cached_banks (
    id SERIAL PRIMARY KEY,
    banks_data JSONB NOT NULL,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cached_banks_expires_at ON public.cached_banks(expires_at);
CREATE INDEX idx_cached_banks_cached_at ON public.cached_banks(cached_at);

COMMENT ON TABLE public.cached_banks IS 'Caches bank information from Anchor API to reduce external API calls';
COMMENT ON COLUMN public.cached_banks.banks_data IS 'JSON array of bank objects from Anchor API';
COMMENT ON COLUMN public.cached_banks.cached_at IS 'When the banks were cached';
COMMENT ON COLUMN public.cached_banks.expires_at IS 'When the cache expires (typically 24 hours)';

-- Beneficiaries and user settings
CREATE TABLE public.beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    anchor_counterparty_id VARCHAR(255) UNIQUE NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number_masked VARCHAR(20) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_beneficiaries_user_default
ON public.beneficiaries (user_id)
WHERE is_default = TRUE;

COMMENT ON TABLE public.beneficiaries IS 'Represents saved external bank accounts (beneficiaries) for users.';
COMMENT ON COLUMN public.beneficiaries.user_id IS 'Foreign key linking the beneficiary to a Transfa user.';
COMMENT ON COLUMN public.beneficiaries.anchor_counterparty_id IS 'Foreign key to the Anchor BaaS CounterParty resource ID.';
COMMENT ON COLUMN public.beneficiaries.is_default IS 'Indicates if this is the user''s default beneficiary for receiving external transfers.';

CREATE TRIGGER set_beneficiaries_updated_at
BEFORE UPDATE ON public.beneficiaries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    default_beneficiary_id UUID REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_settings IS 'Stores user-specific settings and preferences.';
COMMENT ON COLUMN public.user_settings.user_id IS 'Primary key, linking settings directly to a user.';
COMMENT ON COLUMN public.user_settings.default_beneficiary_id IS 'The beneficiary a user designates as their default for receiving external payments.';

CREATE TRIGGER set_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.user_receiving_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    use_external_account BOOLEAN NOT NULL DEFAULT TRUE,
    default_beneficiary_id UUID REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_receiving_preferences IS 'Stores user preferences for receiving transfers (external beneficiary vs internal wallet).';
COMMENT ON COLUMN public.user_receiving_preferences.use_external_account IS 'If true, use external beneficiary for receiving; if false, use internal wallet.';
COMMENT ON COLUMN public.user_receiving_preferences.default_beneficiary_id IS 'The beneficiary to use when use_external_account is true.';

CREATE TRIGGER set_user_receiving_preferences_updated_at
BEFORE UPDATE ON public.user_receiving_preferences
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Transactions
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anchor_transfer_id VARCHAR(255) UNIQUE,
    sender_id UUID REFERENCES public.users(id),
    recipient_id UUID REFERENCES public.users(id),
    source_account_id UUID NOT NULL REFERENCES public.accounts(id),
    destination_account_id UUID REFERENCES public.accounts(id),
    destination_beneficiary_id UUID REFERENCES public.beneficiaries(id),
    type public.transaction_type NOT NULL,
    category VARCHAR(100),
    status public.transaction_status NOT NULL DEFAULT 'pending',
    amount BIGINT NOT NULL,
    fee BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    transfer_type VARCHAR(20),
    failure_reason TEXT,
    anchor_session_id VARCHAR(255),
    anchor_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_sender_id ON public.transactions(sender_id);
CREATE INDEX idx_transactions_recipient_id ON public.transactions(recipient_id);
CREATE INDEX idx_transactions_anchor_transfer_id ON public.transactions(anchor_transfer_id);
CREATE INDEX idx_transactions_transfer_type ON public.transactions(transfer_type);
CREATE INDEX idx_transactions_request_settlement_lookup ON public.transactions(sender_id, recipient_id, amount, created_at DESC) WHERE category = 'p2p_transfer';
CREATE INDEX idx_transactions_sender_recipient_created ON public.transactions(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_transactions_recipient_sender_created ON public.transactions(recipient_id, sender_id, created_at DESC);

COMMENT ON TABLE public.transactions IS 'The central log of all money movements and financial events.';
COMMENT ON COLUMN public.transactions.anchor_transfer_id IS 'Foreign key to the Anchor BaaS transfer resource ID.';
COMMENT ON COLUMN public.transactions.sender_id IS 'The user who initiated the transaction.';
COMMENT ON COLUMN public.transactions.recipient_id IS 'The user who received the funds (for internal transfers).';
COMMENT ON COLUMN public.transactions.source_account_id IS 'The internal wallet the funds were debited from.';
COMMENT ON COLUMN public.transactions.destination_account_id IS 'The internal wallet the funds were credited to.';
COMMENT ON COLUMN public.transactions.destination_beneficiary_id IS 'The external account the funds were sent to.';
COMMENT ON COLUMN public.transactions.amount IS 'Transaction amount in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.transactions.fee IS 'Transaction fee in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.transactions.transfer_type IS 'Transfer rail used for this transaction (e.g., nip, book).';
COMMENT ON COLUMN public.transactions.failure_reason IS 'Failure reason returned by Anchor when a transfer fails.';
COMMENT ON COLUMN public.transactions.anchor_session_id IS 'Anchor session identifier for the transfer (when available).';
COMMENT ON COLUMN public.transactions.anchor_reason IS 'Human-readable reason/description returned by Anchor for the transfer.';

CREATE TRIGGER set_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Platform fees
CREATE TABLE public.platform_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type public.user_type NOT NULL,
    fee_amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    effective_from DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_platform_fee_config_unique
ON public.platform_fee_config(user_type, effective_from);

COMMENT ON TABLE public.platform_fee_config IS 'Configures platform fees by user type and effective date.';
COMMENT ON COLUMN public.platform_fee_config.user_type IS 'Applies fee for personal or merchant users.';
COMMENT ON COLUMN public.platform_fee_config.fee_amount IS 'Platform fee amount in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.platform_fee_config.effective_from IS 'Date the fee becomes effective for billing.';

CREATE TRIGGER set_platform_fee_config_updated_at
BEFORE UPDATE ON public.platform_fee_config
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.platform_fee_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_type public.user_type NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    grace_until TIMESTAMPTZ NOT NULL,
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    status public.platform_fee_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_platform_fee_invoice UNIQUE (user_id, period_start)
);

CREATE INDEX idx_platform_fee_invoices_status_due
ON public.platform_fee_invoices(status, due_at);

CREATE INDEX idx_platform_fee_invoices_user_period
ON public.platform_fee_invoices(user_id, period_start);

COMMENT ON TABLE public.platform_fee_invoices IS 'Monthly platform fee invoices per user.';
COMMENT ON COLUMN public.platform_fee_invoices.user_type IS 'Snapshot of user type at invoice creation.';
COMMENT ON COLUMN public.platform_fee_invoices.grace_until IS 'End of grace period before delinquency.';

CREATE TRIGGER set_platform_fee_invoices_updated_at
BEFORE UPDATE ON public.platform_fee_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.platform_fee_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.platform_fee_invoices(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount BIGINT NOT NULL,
    status public.platform_fee_attempt_status NOT NULL,
    failure_reason TEXT,
    provider_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_fee_attempts_invoice_id ON public.platform_fee_attempts(invoice_id);

COMMENT ON TABLE public.platform_fee_attempts IS 'Audit log of platform fee charge attempts.';

-- Money Drop
CREATE TABLE public.money_drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.money_drop_status NOT NULL DEFAULT 'active',
    amount_per_claim BIGINT NOT NULL,
    total_claims_allowed INTEGER NOT NULL,
    claims_made_count INTEGER NOT NULL DEFAULT 0,
    expiry_timestamp TIMESTAMPTZ NOT NULL,
    funding_source_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    money_drop_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_money_drops_funding_source_account_id ON public.money_drops(funding_source_account_id);
CREATE INDEX idx_money_drops_money_drop_account_id ON public.money_drops(money_drop_account_id);

COMMENT ON TABLE public.money_drops IS 'Stores instances of Money Drops, which are pools of funds to be claimed.';
COMMENT ON COLUMN public.money_drops.creator_id IS 'The user who created and funded the Money Drop.';
COMMENT ON COLUMN public.money_drops.amount_per_claim IS 'The amount in kobo each user can claim.';
COMMENT ON COLUMN public.money_drops.expiry_timestamp IS 'The time at which the drop becomes inactive.';
COMMENT ON COLUMN public.money_drops.funding_source_account_id IS 'The primary account from which funds were debited to create this money drop.';
COMMENT ON COLUMN public.money_drops.money_drop_account_id IS 'The money_drop account type that holds the locked funds for this drop.';

CREATE TRIGGER set_money_drops_updated_at
BEFORE UPDATE ON public.money_drops
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE public.money_drop_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES public.money_drops(id) ON DELETE CASCADE,
    claimant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_drop_claimant UNIQUE (drop_id, claimant_id)
);

CREATE INDEX idx_money_drop_claims_drop_id ON public.money_drop_claims(drop_id);
CREATE INDEX idx_money_drop_claims_claimant_id ON public.money_drop_claims(claimant_id);

COMMENT ON TABLE public.money_drop_claims IS 'A ledger of successful claims for a Money Drop, ensuring one claim per person.';
COMMENT ON COLUMN public.money_drop_claims.claimant_id IS 'The user who successfully claimed from the drop.';

-- Payment Requests
CREATE TABLE public.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.payment_request_status NOT NULL DEFAULT 'pending',
    request_type public.payment_request_type NOT NULL DEFAULT 'general',
    title TEXT NOT NULL DEFAULT 'Payment request',
    recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    recipient_username_snapshot VARCHAR(50),
    recipient_full_name_snapshot VARCHAR(255),
    amount BIGINT NOT NULL,
    description TEXT,
    image_url TEXT,
    fulfilled_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    settled_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    processing_started_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    declined_reason TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_requests_creator_id ON public.payment_requests(creator_id);
CREATE INDEX idx_payment_requests_creator_created_at ON public.payment_requests(creator_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_requests_creator_type ON public.payment_requests(creator_id, request_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_requests_recipient_user ON public.payment_requests(recipient_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_requests_recipient_username_search ON public.payment_requests(LOWER(recipient_username_snapshot)) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_requests_recipient_status_created ON public.payment_requests(recipient_user_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_requests_settled_transaction_id ON public.payment_requests(settled_transaction_id) WHERE settled_transaction_id IS NOT NULL;

COMMENT ON TABLE public.payment_requests IS 'Stores user-created payment requests with status and details.';
COMMENT ON COLUMN public.payment_requests.creator_id IS 'Foreign key to the user who created the request.';
COMMENT ON COLUMN public.payment_requests.status IS 'The current status of the request (pending, fulfilled/paid, or declined).';
COMMENT ON COLUMN public.payment_requests.request_type IS 'Whether request is shareable general request or user-targeted individual request.';
COMMENT ON COLUMN public.payment_requests.title IS 'Short title for the payment request shown in request cards and details.';
COMMENT ON COLUMN public.payment_requests.recipient_user_id IS 'Internal recipient user id when request_type is individual.';
COMMENT ON COLUMN public.payment_requests.recipient_username_snapshot IS 'Recipient username captured at creation time for immutable history display.';
COMMENT ON COLUMN public.payment_requests.recipient_full_name_snapshot IS 'Recipient full name captured at creation time for immutable history display.';
COMMENT ON COLUMN public.payment_requests.amount IS 'The requested amount in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.payment_requests.image_url IS 'URL of an optional image uploaded to Supabase Storage.';
COMMENT ON COLUMN public.payment_requests.fulfilled_by_user_id IS 'User who paid/fulfilled the request.';
COMMENT ON COLUMN public.payment_requests.settled_transaction_id IS 'Transaction record generated when the request was paid.';
COMMENT ON COLUMN public.payment_requests.processing_started_at IS 'Timestamp when request was claimed for payment processing.';
COMMENT ON COLUMN public.payment_requests.responded_at IS 'Timestamp when request moved out of pending state.';
COMMENT ON COLUMN public.payment_requests.declined_reason IS 'Optional decline reason shown to request creator.';
COMMENT ON COLUMN public.payment_requests.deleted_at IS 'Soft-delete timestamp. Non-null rows are hidden from app lists/details.';

CREATE TRIGGER set_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- In-App Notifications
CREATE TABLE public.in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category public.notification_category NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(120) NOT NULL,
    body TEXT,
    status public.notification_status NOT NULL DEFAULT 'unread',
    related_entity_type VARCHAR(40),
    related_entity_id UUID,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key VARCHAR(180),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_in_app_notifications_user_created_at ON public.in_app_notifications(user_id, created_at DESC);
CREATE INDEX idx_in_app_notifications_user_status ON public.in_app_notifications(user_id, status, created_at DESC);
CREATE INDEX idx_in_app_notifications_user_category_created ON public.in_app_notifications(user_id, category, created_at DESC);
CREATE UNIQUE INDEX idx_in_app_notifications_dedupe_key ON public.in_app_notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE public.in_app_notifications IS 'In-app notification inbox consumed by mobile clients.';
COMMENT ON COLUMN public.in_app_notifications.category IS 'Notification tab grouping: request, newsletter, or system.';
COMMENT ON COLUMN public.in_app_notifications.type IS 'Concrete notification event type (e.g. request.incoming, transfer.received).';
COMMENT ON COLUMN public.in_app_notifications.data IS 'Structured metadata payload used to render specific notification cards.';
COMMENT ON COLUMN public.in_app_notifications.dedupe_key IS 'Optional idempotency key to avoid duplicate inbox entries.';

CREATE TRIGGER set_in_app_notifications_updated_at
BEFORE UPDATE ON public.in_app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_receiving_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_drop_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile."
ON public.users FOR SELECT
USING (auth.uid()::text = clerk_user_id);

CREATE POLICY "Users can update their own profile."
ON public.users FOR UPDATE
USING (auth.uid()::text = clerk_user_id);

-- Accounts policies
CREATE POLICY "Users can access their own accounts."
ON public.accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = accounts.user_id AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = accounts.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Beneficiaries policy
CREATE POLICY "Users can access their own beneficiaries."
ON public.beneficiaries FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = beneficiaries.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- User settings policy
CREATE POLICY "Users can access their own settings."
ON public.user_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_settings.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- User receiving preferences policy
CREATE POLICY "Users can access their own receiving preferences."
ON public.user_receiving_preferences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_receiving_preferences.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Transactions policy (read-only for clients)
CREATE POLICY "Users can view their own transactions."
ON public.transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE
      users.clerk_user_id = auth.uid()::text AND (
        users.id = transactions.sender_id OR users.id = transactions.recipient_id
      )
  )
);

-- Platform fee config policy (service role only)
CREATE POLICY "Service role can manage platform fee config."
ON public.platform_fee_config FOR ALL
USING (auth.role() = 'service_role');

-- Platform fee invoices policies
CREATE POLICY "Users can view their own platform fee invoices."
ON public.platform_fee_invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = platform_fee_invoices.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Platform fee attempts policies
CREATE POLICY "Users can view their own platform fee attempts."
ON public.platform_fee_attempts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.platform_fee_invoices inv
    JOIN public.users u ON inv.user_id = u.id
    WHERE inv.id = platform_fee_attempts.invoice_id AND u.clerk_user_id = auth.uid()::text
  )
);

-- Money drop policies
CREATE POLICY "Users can view active and their own money drops."
ON public.money_drops FOR SELECT
USING (
    (status = 'active' AND expiry_timestamp > now()) OR
    (EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = money_drops.creator_id AND users.clerk_user_id = auth.uid()::text
    ))
);

CREATE POLICY "Creators can manage their own money drops."
ON public.money_drops FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = money_drops.creator_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Money drop claims policy (read-only for clients)
CREATE POLICY "Users can view relevant money drop claims."
ON public.money_drop_claims FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = money_drop_claims.claimant_id AND users.clerk_user_id = auth.uid()::text
    ) OR
    EXISTS (
        SELECT 1 FROM public.money_drops md
        JOIN public.users u ON md.creator_id = u.id
        WHERE md.id = money_drop_claims.drop_id AND u.clerk_user_id = auth.uid()::text
    )
);

-- Payment requests policy
CREATE POLICY "Users can manage their own payment requests."
ON public.payment_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = payment_requests.creator_id AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = payment_requests.creator_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Notifications policies
CREATE POLICY "Users can view their own notifications."
ON public.in_app_notifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can mark their own notifications as read."
ON public.in_app_notifications FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id AND users.clerk_user_id = auth.uid()::text
  )
);
