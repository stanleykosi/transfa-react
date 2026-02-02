/**
 * Migration: add_platform_fees
 *
 * Description:
 * - Adds platform fee tables and enums.
 * - Removes subscription tables and monthly usage tracking.
 * - Introduces platform_fee transaction type.
 */

-- Ensure platform fee enums exist
DO $$
BEGIN
    CREATE TYPE public.platform_fee_status AS ENUM ('pending', 'paid', 'failed', 'delinquent', 'waived');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE public.platform_fee_attempt_status AS ENUM ('success', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add platform_fee to transaction_type enum (keep existing values for compatibility)
DO $$
BEGIN
    ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'platform_fee';
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Platform fee configuration
CREATE TABLE IF NOT EXISTS public.platform_fee_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_type public.user_type NOT NULL,
    fee_amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    effective_from DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_fee_config_unique
ON public.platform_fee_config(user_type, effective_from);

CREATE TRIGGER set_platform_fee_config_updated_at
BEFORE UPDATE ON public.platform_fee_config
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Platform fee invoices
CREATE TABLE IF NOT EXISTS public.platform_fee_invoices (
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

CREATE INDEX IF NOT EXISTS idx_platform_fee_invoices_status_due
ON public.platform_fee_invoices(status, due_at);

CREATE INDEX IF NOT EXISTS idx_platform_fee_invoices_user_period
ON public.platform_fee_invoices(user_id, period_start);

CREATE TRIGGER set_platform_fee_invoices_updated_at
BEFORE UPDATE ON public.platform_fee_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Platform fee attempts
CREATE TABLE IF NOT EXISTS public.platform_fee_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.platform_fee_invoices(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount BIGINT NOT NULL,
    status public.platform_fee_attempt_status NOT NULL,
    failure_reason TEXT,
    provider_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_attempts_invoice_id
ON public.platform_fee_attempts(invoice_id);

-- Enable RLS
ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_attempts ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Service role can manage platform fee config." ON public.platform_fee_config;
CREATE POLICY "Service role can manage platform fee config."
ON public.platform_fee_config FOR ALL
USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own platform fee invoices." ON public.platform_fee_invoices;
CREATE POLICY "Users can view their own platform fee invoices."
ON public.platform_fee_invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = platform_fee_invoices.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Users can view their own platform fee attempts." ON public.platform_fee_attempts;
CREATE POLICY "Users can view their own platform fee attempts."
ON public.platform_fee_attempts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.platform_fee_invoices inv
    JOIN public.users u ON u.id = inv.user_id
    WHERE inv.id = platform_fee_attempts.invoice_id AND u.clerk_user_id = auth.uid()::text
  )
);

-- Remove subscription tables if present
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.monthly_transfer_usage CASCADE;

-- Drop subscription_status enum if present
DO $$
BEGIN
    DROP TYPE IF EXISTS public.subscription_status;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;
