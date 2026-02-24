-- Harden money drop claim flow for high-concurrency production:
-- 1) Distributed password-attempt lockouts for protected drop claims
-- 2) Durable idempotency keys for claim retries

CREATE TABLE IF NOT EXISTS public.money_drop_claim_password_attempts (
    drop_id UUID NOT NULL REFERENCES public.money_drops(id) ON DELETE CASCADE,
    claimant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (drop_id, claimant_id),
    CONSTRAINT chk_money_drop_claim_password_attempts_non_negative CHECK (failed_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_money_drop_claim_password_attempts_claimant
    ON public.money_drop_claim_password_attempts(claimant_id, updated_at DESC);

COMMENT ON TABLE public.money_drop_claim_password_attempts IS 'Tracks failed password attempts per claimant/drop to enforce distributed lockouts.';
COMMENT ON COLUMN public.money_drop_claim_password_attempts.locked_until IS 'Claim attempts are blocked until this timestamp when set in the future.';

CREATE TABLE IF NOT EXISTS public.money_drop_claim_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_id UUID NOT NULL REFERENCES public.money_drops(id) ON DELETE CASCADE,
    claimant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    response_payload JSONB,
    claim_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    CONSTRAINT uq_money_drop_claim_idempotency_claimant_key UNIQUE (claimant_id, idempotency_key),
    CONSTRAINT chk_money_drop_claim_idempotency_status CHECK (status IN ('processing', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_money_drop_claim_idempotency_expires_at
    ON public.money_drop_claim_idempotency(expires_at);

CREATE INDEX IF NOT EXISTS idx_money_drop_claim_idempotency_claimant_updated
    ON public.money_drop_claim_idempotency(claimant_id, updated_at DESC);

COMMENT ON TABLE public.money_drop_claim_idempotency IS 'Durable idempotency records for money drop claim retries.';
COMMENT ON COLUMN public.money_drop_claim_idempotency.request_hash IS 'Stable hash of request semantics to prevent unsafe key reuse.';
COMMENT ON COLUMN public.money_drop_claim_idempotency.response_payload IS 'Cached successful claim response for deterministic retry responses.';

ALTER TABLE public.money_drop_claim_password_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_drop_claim_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage money drop claim password attempts."
ON public.money_drop_claim_password_attempts;

CREATE POLICY "Service role can manage money drop claim password attempts."
ON public.money_drop_claim_password_attempts FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage money drop claim idempotency."
ON public.money_drop_claim_idempotency;

CREATE POLICY "Service role can manage money drop claim idempotency."
ON public.money_drop_claim_idempotency FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_money_drop_claim_password_attempts_updated_at'
    ) THEN
        CREATE TRIGGER set_money_drop_claim_password_attempts_updated_at
        BEFORE UPDATE ON public.money_drop_claim_password_attempts
        FOR EACH ROW
        EXECUTE FUNCTION public.trigger_set_timestamp();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_money_drop_claim_idempotency_updated_at'
    ) THEN
        CREATE TRIGGER set_money_drop_claim_idempotency_updated_at
        BEFORE UPDATE ON public.money_drop_claim_idempotency
        FOR EACH ROW
        EXECUTE FUNCTION public.trigger_set_timestamp();
    END IF;
END $$;
