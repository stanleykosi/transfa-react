/**
 * Migration: add_bilateral_transaction_history_index
 *
 * Description:
 * - Adds composite indexes to accelerate bilateral transaction history lookups.
 */

CREATE INDEX IF NOT EXISTS idx_transactions_sender_recipient_created
  ON public.transactions(sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_recipient_sender_created
  ON public.transactions(recipient_id, sender_id, created_at DESC);
