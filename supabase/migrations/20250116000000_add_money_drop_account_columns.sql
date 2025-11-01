/**
 * Migration: add_money_drop_account_columns
 *
 * Description:
 * This migration adds the missing account reference columns to the money_drops table.
 * These columns are required for proper tracking of:
 * 1. `funding_source_account_id`: The primary account from which funds were debited to create the drop
 * 2. `money_drop_account_id`: The money_drop account type that holds the locked funds
 *
 * These columns are essential for:
 * - Transaction logging and audit trails
 * - Proper account balance tracking
 * - Refund processing when drops expire
 */

-- Add the missing account reference columns to money_drops table
ALTER TABLE public.money_drops
ADD COLUMN funding_source_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
ADD COLUMN money_drop_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.money_drops.funding_source_account_id IS 'The primary account from which funds were debited to create this money drop.';
COMMENT ON COLUMN public.money_drops.money_drop_account_id IS 'The money_drop account type that holds the locked funds for this drop.';

-- Add indexes for performance on foreign key lookups
CREATE INDEX idx_money_drops_funding_source_account_id ON public.money_drops(funding_source_account_id);
CREATE INDEX idx_money_drops_money_drop_account_id ON public.money_drops(money_drop_account_id);

