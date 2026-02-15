/**
 * Migration: create_transfer_batch_audit_tables
 *
 * Description:
 * Adds durable audit tables for bulk transfer orchestration so each batch and
 * each recipient line item can be reconciled independently.
 */

-- Batch-level audit table for bulk transfers.
CREATE TABLE IF NOT EXISTS public.transfer_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial_failed', 'failed')),
    requested_count INTEGER NOT NULL CHECK (requested_count > 0 AND requested_count <= 10),
    success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    total_amount BIGINT NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_fee BIGINT NOT NULL DEFAULT 0 CHECK (total_fee >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_batches_sender_created
    ON public.transfer_batches (sender_id, created_at DESC);

COMMENT ON TABLE public.transfer_batches IS 'Audit table for bulk transfer batches initiated by users.';
COMMENT ON COLUMN public.transfer_batches.status IS 'Current aggregate state of the bulk transfer batch.';
COMMENT ON COLUMN public.transfer_batches.requested_count IS 'Number of recipient items requested in this batch.';

-- Item-level audit table for each recipient in a batch.
CREATE TABLE IF NOT EXISTS public.transfer_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.transfer_batches(id) ON DELETE CASCADE,
    recipient_username VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    fee BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transfer_batch_items_batch_recipient UNIQUE (batch_id, recipient_username)
);

CREATE INDEX IF NOT EXISTS idx_transfer_batch_items_batch_status
    ON public.transfer_batch_items (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_batch_items_transaction_id
    ON public.transfer_batch_items (transaction_id);

COMMENT ON TABLE public.transfer_batch_items IS 'Per-recipient audit rows for bulk transfer processing.';
COMMENT ON COLUMN public.transfer_batch_items.transaction_id IS 'Linked transaction record when an item is successfully initiated.';

-- Reuse global updated_at trigger function for both audit tables.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_transfer_batches_updated_at'
    ) THEN
        CREATE TRIGGER set_transfer_batches_updated_at
        BEFORE UPDATE ON public.transfer_batches
        FOR EACH ROW
        EXECUTE FUNCTION public.trigger_set_timestamp();
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_transfer_batch_items_updated_at'
    ) THEN
        CREATE TRIGGER set_transfer_batch_items_updated_at
        BEFORE UPDATE ON public.transfer_batch_items
        FOR EACH ROW
        EXECUTE FUNCTION public.trigger_set_timestamp();
    END IF;
END
$$;

-- Backend-managed tables: enable RLS with no client policies.
ALTER TABLE public.transfer_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_batch_items ENABLE ROW LEVEL SECURITY;
