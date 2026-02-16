/**
 * Migration: add_payment_request_settlement_lookup_index
 *
 * Description:
 * - Adds a composite index to accelerate payment-request settlement reconciliation lookups.
 */

CREATE INDEX IF NOT EXISTS idx_transactions_request_settlement_lookup
  ON public.transactions(sender_id, recipient_id, amount, created_at DESC)
  WHERE category = 'p2p_transfer';
