/**
 * Migration: add_in_app_notifications_and_payment_request_settlement
 *
 * Description:
 * - Adds in_app_notifications table for app inbox (request/newsletter/system/general feed).
 * - Adds settlement metadata columns for payment requests so pay/decline actions are auditable.
 * - Adds indexes for low-latency inbox and incoming-request queries.
 */

DO $$
BEGIN
  CREATE TYPE public.notification_category AS ENUM ('request', 'newsletter', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.notification_status AS ENUM ('unread', 'read');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.payment_request_status ADD VALUE IF NOT EXISTS 'processing';

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category public.notification_category NOT NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT,
  status public.notification_status NOT NULL DEFAULT 'unread',
  related_entity_type VARCHAR(40),
  related_entity_id UUID,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key VARCHAR(180),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created_at
  ON public.in_app_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_status
  ON public.in_app_notifications(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_category_created
  ON public.in_app_notifications(user_id, category, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_notifications_dedupe_key
  ON public.in_app_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE public.in_app_notifications IS 'In-app notification inbox consumed by mobile clients.';
COMMENT ON COLUMN public.in_app_notifications.category IS 'Notification tab grouping: request, newsletter, or system.';
COMMENT ON COLUMN public.in_app_notifications.type IS 'Concrete notification event type (e.g. request.incoming, transfer.received).';
COMMENT ON COLUMN public.in_app_notifications.data IS 'Structured metadata payload used to render specific notification cards.';
COMMENT ON COLUMN public.in_app_notifications.dedupe_key IS 'Optional idempotency key to avoid duplicate inbox entries.';

CREATE TRIGGER set_in_app_notifications_updated_at
BEFORE UPDATE ON public.in_app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS fulfilled_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient_status_created
  ON public.payment_requests(recipient_user_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_requests_settled_transaction_id
  ON public.payment_requests(settled_transaction_id)
  WHERE settled_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.payment_requests.fulfilled_by_user_id IS 'User who paid/fulfilled the request.';
COMMENT ON COLUMN public.payment_requests.settled_transaction_id IS 'Transaction record generated when the request was paid.';
COMMENT ON COLUMN public.payment_requests.processing_started_at IS 'Timestamp when request was claimed for payment processing.';
COMMENT ON COLUMN public.payment_requests.responded_at IS 'Timestamp when request moved out of pending state.';
COMMENT ON COLUMN public.payment_requests.declined_reason IS 'Optional decline reason shown to request creator.';

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications."
ON public.in_app_notifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id
      AND users.clerk_user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can mark their own notifications as read."
ON public.in_app_notifications FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id
      AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = in_app_notifications.user_id
      AND users.clerk_user_id = auth.uid()::text
  )
);
