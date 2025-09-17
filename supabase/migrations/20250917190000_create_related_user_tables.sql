/**
 * Migration: create_related_user_tables
 *
 * Description:
 * This migration builds upon the user and account foundation by adding tables for:
 * 1. `beneficiaries`: Stores external bank accounts that users can send money to (CounterParties).
 * 2. `user_settings`: A simple table to hold user-specific preferences, like their default receiving account.
 * 3. `transactions`: The central ledger for all money movements within the app.
 *
 * It defines custom types, applies triggers for timestamp updates, and implements
 * stringent Row Level Security (RLS) policies for each new table.
 */

-- Step 1: Create custom ENUM types for the 'transactions' table.
-- Using ENUMs ensures data consistency and integrity for transaction types and statuses.
CREATE TYPE public.transaction_type AS ENUM (
    'p2p',
    'self_transfer',
    'money_drop_funding',
    'money_drop_claim',
    'money_drop_refund',
    'subscription_fee'
);

CREATE TYPE public.transaction_status AS ENUM (
    'pending',
    'completed',
    'failed'
);


-- Step 2: Create the 'beneficiaries' table.
-- This table stores verified external bank accounts for each user.
CREATE TABLE public.beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    anchor_counterparty_id VARCHAR(255) UNIQUE NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number_masked VARCHAR(20) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity.
COMMENT ON TABLE public.beneficiaries IS 'Represents saved external bank accounts (beneficiaries) for users.';
COMMENT ON COLUMN public.beneficiaries.user_id IS 'Foreign key linking the beneficiary to a Transfa user.';
COMMENT ON COLUMN public.beneficiaries.anchor_counterparty_id IS 'Foreign key to the Anchor BaaS CounterParty resource ID.';

-- Apply the existing timestamp trigger to the 'beneficiaries' table.
CREATE TRIGGER set_beneficiaries_updated_at
BEFORE UPDATE ON public.beneficiaries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 3: Create the 'user_settings' table.
-- This table stores user-specific preferences. It has a one-to-one relationship with the users table.
CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    default_beneficiary_id UUID REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity.
COMMENT ON TABLE public.user_settings IS 'Stores user-specific settings and preferences.';
COMMENT ON COLUMN public.user_settings.user_id IS 'Primary key, linking settings directly to a user.';
COMMENT ON COLUMN public.user_settings.default_beneficiary_id IS 'The beneficiary a user designates as their default for receiving external payments.';

-- Apply the timestamp trigger to the 'user_settings' table.
CREATE TRIGGER set_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 4: Create the 'transactions' table.
-- This is the main ledger for all financial activities in the application.
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance on frequently queried columns.
CREATE INDEX idx_transactions_sender_id ON public.transactions(sender_id);
CREATE INDEX idx_transactions_recipient_id ON public.transactions(recipient_id);
CREATE INDEX idx_transactions_anchor_transfer_id ON public.transactions(anchor_transfer_id);

-- Add comments for clarity.
COMMENT ON TABLE public.transactions IS 'The central log of all money movements and financial events.';
COMMENT ON COLUMN public.transactions.anchor_transfer_id IS 'Foreign key to the Anchor BaaS transfer resource ID.';
COMMENT ON COLUMN public.transactions.sender_id IS 'The user who initiated the transaction.';
COMMENT ON COLUMN public.transactions.recipient_id IS 'The user who received the funds (for internal transfers).';
COMMENT ON COLUMN public.transactions.source_account_id IS 'The internal wallet the funds were debited from.';
COMMENT ON COLUMN public.transactions.destination_account_id IS 'The internal wallet the funds were credited to.';
COMMENT ON COLUMN public.transactions.destination_beneficiary_id IS 'The external account the funds were sent to.';
COMMENT ON COLUMN public.transactions.amount IS 'Transaction amount in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.transactions.fee IS 'Transaction fee in the smallest currency unit (kobo).';

-- Apply the timestamp trigger to the 'transactions' table.
CREATE TRIGGER set_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 5: Enable Row Level Security (RLS) on all new tables.
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;


-- Step 6: Create RLS policies.
-- These policies are essential for ensuring users can only access their own data.

-- Beneficiaries Policy: Users can manage and view their own saved beneficiaries.
CREATE POLICY "Users can access their own beneficiaries."
ON public.beneficiaries FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = beneficiaries.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- User Settings Policy: Users can manage and view their own settings.
CREATE POLICY "Users can access their own settings."
ON public.user_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_settings.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Transactions Policy: A user can view a transaction if they are either the sender or the recipient.
-- This is a critical security policy for financial privacy.
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

-- Note: INSERT, UPDATE, and DELETE on transactions should be handled by trusted backend services
-- using a service_role key that bypasses RLS. Client-side access is read-only.
