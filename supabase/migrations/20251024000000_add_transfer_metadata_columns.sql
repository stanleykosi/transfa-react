-- Migration: add transfer metadata columns to transactions

-- Add optional columns for storing Anchor transfer metadata and failure details.
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS anchor_session_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS anchor_reason TEXT;

-- Helpful index for filtering by transfer type.
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_type ON public.transactions(transfer_type);

COMMENT ON COLUMN public.transactions.transfer_type IS 'Transfer rail used for this transaction (e.g., nip, book).';
COMMENT ON COLUMN public.transactions.failure_reason IS 'Failure reason returned by Anchor when a transfer fails.';
COMMENT ON COLUMN public.transactions.anchor_session_id IS 'Anchor session identifier for the transfer (when available).';
COMMENT ON COLUMN public.transactions.anchor_reason IS 'Human-readable reason/description returned by Anchor for the transfer.';

