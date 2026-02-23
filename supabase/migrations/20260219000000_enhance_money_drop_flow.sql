-- Enhance money drop schema for the MVP flow:
-- - creator-defined title
-- - total amount tracking
-- - optional password-protected drops
-- - fee metadata per drop
-- - explicit end metadata

ALTER TABLE public.money_drops
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS total_amount BIGINT,
ADD COLUMN IF NOT EXISTS refunded_amount BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS lock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lock_password_hash TEXT,
ADD COLUMN IF NOT EXISTS lock_password_encrypted TEXT,
ADD COLUMN IF NOT EXISTS fee_amount BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(10,6) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_reason TEXT;

-- Backfill safe defaults for existing records.
UPDATE public.money_drops
SET title = COALESCE(NULLIF(BTRIM(title), ''), 'MoneyDrop')
WHERE title IS NULL OR BTRIM(title) = '';

UPDATE public.money_drops
SET total_amount = amount_per_claim * total_claims_allowed
WHERE total_amount IS NULL;

UPDATE public.money_drops
SET refunded_amount = 0
WHERE refunded_amount IS NULL;

ALTER TABLE public.money_drops
ALTER COLUMN title SET NOT NULL,
ALTER COLUMN total_amount SET NOT NULL;

ALTER TABLE public.money_drops
ADD CONSTRAINT chk_money_drops_total_amount_positive CHECK (total_amount > 0),
ADD CONSTRAINT chk_money_drops_total_amount_consistency CHECK (total_amount = amount_per_claim * total_claims_allowed),
ADD CONSTRAINT chk_money_drops_refunded_amount_non_negative CHECK (refunded_amount >= 0),
ADD CONSTRAINT chk_money_drops_refunded_amount_within_total CHECK (refunded_amount <= total_amount),
ADD CONSTRAINT chk_money_drops_fee_amount_non_negative CHECK (fee_amount >= 0),
ADD CONSTRAINT chk_money_drops_fee_percentage_non_negative CHECK (fee_percentage >= 0),
ADD CONSTRAINT chk_money_drops_password_when_locked CHECK (
  (lock_enabled = FALSE AND lock_password_hash IS NULL)
  OR (lock_enabled = TRUE AND lock_password_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_money_drops_creator_status_created_at
  ON public.money_drops(creator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_money_drops_status_expiry_timestamp
  ON public.money_drops(status, expiry_timestamp);

CREATE INDEX IF NOT EXISTS idx_money_drop_claims_drop_claimed_at
  ON public.money_drop_claims(drop_id, claimed_at DESC);

COMMENT ON COLUMN public.money_drops.title IS 'Creator-defined display title for the money drop.';
COMMENT ON COLUMN public.money_drops.total_amount IS 'Total amount allocated to this drop in kobo.';
COMMENT ON COLUMN public.money_drops.refunded_amount IS 'Cumulative amount already refunded to creator for this drop in kobo.';
COMMENT ON COLUMN public.money_drops.lock_enabled IS 'Whether claiming this drop requires a password.';
COMMENT ON COLUMN public.money_drops.lock_password_hash IS 'bcrypt hash used to verify claim password for locked drops.';
COMMENT ON COLUMN public.money_drops.lock_password_encrypted IS 'Encrypted lock password for owner-only reveal workflow.';
COMMENT ON COLUMN public.money_drops.fee_amount IS 'Absolute fee amount charged at creation in kobo.';
COMMENT ON COLUMN public.money_drops.fee_percentage IS 'Fee percentage configured when this drop was created.';
COMMENT ON COLUMN public.money_drops.ended_at IS 'Timestamp this drop transitioned out of active state.';
COMMENT ON COLUMN public.money_drops.ended_reason IS 'Reason code for ending (completed, expired, manual_end, refund_processing, refund_retry_pending, refund_payout_inflight, refund_persistence_failed).';
