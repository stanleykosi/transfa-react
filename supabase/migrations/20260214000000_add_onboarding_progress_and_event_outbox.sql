/**
 * Migration: add_onboarding_progress_and_event_outbox
 *
 * Description:
 * - Adds onboarding_progress to persist step-level onboarding resume state.
 * - Adds event_outbox for transactional outbox publishing to RabbitMQ.
 */

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    clerk_user_id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    user_type TEXT NOT NULL DEFAULT 'personal',
    current_step SMALLINT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 3),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_updated_at
ON public.onboarding_progress(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_progress_user_id
ON public.onboarding_progress(user_id)
WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.onboarding_progress IS 'Stores draft onboarding progress for resume-after-login behavior.';
COMMENT ON COLUMN public.onboarding_progress.current_step IS 'Latest onboarding step reached (1-3).';
COMMENT ON COLUMN public.onboarding_progress.payload IS 'Partial onboarding form payload for draft resume.';

CREATE TABLE IF NOT EXISTS public.event_outbox (
    id BIGSERIAL PRIMARY KEY,
    exchange TEXT NOT NULL,
    routing_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('pending', 'processing', 'published'))
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_dispatch
ON public.event_outbox(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_event_outbox_processing_started_at
ON public.event_outbox(processing_started_at)
WHERE status = 'processing';

COMMENT ON TABLE public.event_outbox IS 'Transactional outbox for reliable async event publishing.';
COMMENT ON COLUMN public.event_outbox.status IS 'Dispatch state: pending, processing, published.';
COMMENT ON COLUMN public.event_outbox.next_attempt_at IS 'Time when the dispatcher should retry publishing.';
