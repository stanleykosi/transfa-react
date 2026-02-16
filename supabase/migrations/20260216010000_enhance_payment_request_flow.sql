/**
 * Migration: enhance_payment_request_flow
 *
 * Description:
 * Extends payment request schema for the request-payment product flow:
 * - request type (general vs individual)
 * - title
 * - optional recipient linkage/snapshots for individual requests
 * - soft delete support
 * - declined status support
 * - performance indexes for dashboard/history/search
 */

DO $$
BEGIN
  CREATE TYPE public.payment_request_type AS ENUM ('general', 'individual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.payment_request_status ADD VALUE IF NOT EXISTS 'declined';

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS request_type public.payment_request_type NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Payment request',
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_username_snapshot VARCHAR(50),
  ADD COLUMN IF NOT EXISTS recipient_full_name_snapshot VARCHAR(255),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_requests_creator_created_at
  ON public.payment_requests(creator_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_requests_creator_type
  ON public.payment_requests(creator_id, request_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient_user
  ON public.payment_requests(recipient_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient_username_search
  ON public.payment_requests(LOWER(recipient_username_snapshot))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.payment_requests.request_type IS 'Whether request is shareable general request or user-targeted individual request.';
COMMENT ON COLUMN public.payment_requests.title IS 'Short title for the payment request shown in request cards and details.';
COMMENT ON COLUMN public.payment_requests.recipient_user_id IS 'Internal recipient user id when request_type is individual.';
COMMENT ON COLUMN public.payment_requests.recipient_username_snapshot IS 'Recipient username captured at creation time for immutable history display.';
COMMENT ON COLUMN public.payment_requests.recipient_full_name_snapshot IS 'Recipient full name captured at creation time for immutable history display.';
COMMENT ON COLUMN public.payment_requests.deleted_at IS 'Soft-delete timestamp. Non-null rows are hidden from app lists/details.';
