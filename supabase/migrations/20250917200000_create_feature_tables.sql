/**
 * Migration: create_feature_tables
 *
 * Description:
 * This migration creates the tables necessary for the subscription model and the Money Drop feature.
 * It includes:
 * 1. `subscriptions`: Manages user subscription status and billing periods.
 * 2. `monthly_transfer_usage`: Tracks the usage of free external transfers for non-subscribed users.
 * 3. `money_drops`: Stores details for each created Money Drop instance.
 * 4. `money_drop_claims`: Records which users have claimed a specific Money Drop.
 *
 * It also defines the necessary ENUM types and implements strict Row Level Security (RLS) policies
 * to protect user data related to these features.
 */

-- Step 1: Create custom ENUM types for new tables.
CREATE TYPE public.subscription_status AS ENUM ('active', 'inactive', 'lapsed');
CREATE TYPE public.money_drop_status AS ENUM ('active', 'completed', 'expired_and_refunded');

-- Step 2: Create the 'subscriptions' table.
-- This table manages the subscription state for each user.
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    status public.subscription_status NOT NULL DEFAULT 'inactive',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity.
COMMENT ON TABLE public.subscriptions IS 'Manages user subscription status, billing cycles, and renewal settings.';
COMMENT ON COLUMN public.subscriptions.user_id IS 'A one-to-one relationship with the users table.';
COMMENT ON COLUMN public.subscriptions.status IS 'The current status of the user''s subscription.';

-- Apply the timestamp trigger.
CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 3: Create the 'monthly_transfer_usage' table.
-- This table tracks the free transfer quota for non-subscribed users each month.
CREATE TABLE public.monthly_transfer_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    period DATE NOT NULL, -- Represents the first day of the month for the usage period.
    external_receipt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_period UNIQUE (user_id, period)
);

-- Add indexes for performance.
CREATE INDEX idx_monthly_transfer_usage_user_id_period ON public.monthly_transfer_usage(user_id, period);

-- Add comments for clarity.
COMMENT ON TABLE public.monthly_transfer_usage IS 'Tracks the number of free external transfers received by a non-subscribed user per month.';
COMMENT ON COLUMN public.monthly_transfer_usage.period IS 'The first day of the month this usage record applies to (e.g., ''2025-08-01'').';

-- Apply the timestamp trigger.
CREATE TRIGGER set_monthly_transfer_usage_updated_at
BEFORE UPDATE ON public.monthly_transfer_usage
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 4: Create the 'money_drops' table.
-- This table stores information about each Money Drop created by a user.
CREATE TABLE public.money_drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.money_drop_status NOT NULL DEFAULT 'active',
    amount_per_claim BIGINT NOT NULL,
    total_claims_allowed INTEGER NOT NULL,
    claims_made_count INTEGER NOT NULL DEFAULT 0,
    expiry_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity.
COMMENT ON TABLE public.money_drops IS 'Stores instances of Money Drops, which are pools of funds to be claimed.';
COMMENT ON COLUMN public.money_drops.creator_id IS 'The user who created and funded the Money Drop.';
COMMENT ON COLUMN public.money_drops.amount_per_claim IS 'The amount in kobo each user can claim.';
COMMENT ON COLUMN public.money_drops.expiry_timestamp IS 'The time at which the drop becomes inactive.';

-- Apply the timestamp trigger.
CREATE TRIGGER set_money_drops_updated_at
BEFORE UPDATE ON public.money_drops
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();


-- Step 5: Create the 'money_drop_claims' table.
-- This table is a ledger of claims against each Money Drop, preventing duplicate claims.
CREATE TABLE public.money_drop_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES public.money_drops(id) ON DELETE CASCADE,
    claimant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_drop_claimant UNIQUE (drop_id, claimant_id)
);

-- Add indexes for performance.
CREATE INDEX idx_money_drop_claims_drop_id ON public.money_drop_claims(drop_id);
CREATE INDEX idx_money_drop_claims_claimant_id ON public.money_drop_claims(claimant_id);

-- Add comments for clarity.
COMMENT ON TABLE public.money_drop_claims IS 'A ledger of successful claims for a Money Drop, ensuring one claim per person.';
COMMENT ON COLUMN public.money_drop_claims.claimant_id IS 'The user who successfully claimed from the drop.';

-- Step 6: Enable Row Level Security (RLS) on all new tables.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_transfer_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_drop_claims ENABLE ROW LEVEL SECURITY;


-- Step 7: Create RLS policies for the new tables.

-- Subscriptions Policy: Users can manage their own subscription record.
CREATE POLICY "Users can manage their own subscription."
ON public.subscriptions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = subscriptions.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Monthly Transfer Usage Policy: Users can view their own transfer usage.
CREATE POLICY "Users can view their own transfer usage."
ON public.monthly_transfer_usage FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = monthly_transfer_usage.user_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Money Drops Policies:
-- SELECT: Authenticated users can see active drops, and creators can see all their own drops.
CREATE POLICY "Users can view active and their own money drops."
ON public.money_drops FOR SELECT
USING (
    (status = 'active' AND expiry_timestamp > now()) OR
    (EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = money_drops.creator_id AND users.clerk_user_id = auth.uid()::text
    ))
);
-- INSERT/UPDATE/DELETE: Only the creator can manage their drops.
CREATE POLICY "Creators can manage their own money drops."
ON public.money_drops FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = money_drops.creator_id AND users.clerk_user_id = auth.uid()::text
  )
);

-- Money Drop Claims Policies:
-- SELECT: A user can see their own claims, and a drop creator can see all claims on their drops.
CREATE POLICY "Users can view relevant money drop claims."
ON public.money_drop_claims FOR SELECT
USING (
    -- The user is the claimant
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = money_drop_claims.claimant_id AND users.clerk_user_id = auth.uid()::text
    ) OR
    -- The user is the creator of the drop
    EXISTS (
        SELECT 1 FROM public.money_drops md
        JOIN public.users u ON md.creator_id = u.id
        WHERE md.id = money_drop_claims.drop_id AND u.clerk_user_id = auth.uid()::text
    )
);
-- Note: Inserts on claims are handled by a trusted backend service role to ensure atomicity.
-- A client-side policy would be insufficient to prevent race conditions.
