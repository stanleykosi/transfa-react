/**
 * Migration: create_onboarding_status_table
 *
 * Description:
 * Creates the onboarding_status table used by backend services to track
 * tier progression states for each user.
 */

CREATE TABLE IF NOT EXISTS public.onboarding_status (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_status_updated_at
ON public.onboarding_status(updated_at);

COMMENT ON TABLE public.onboarding_status IS 'Tracks onboarding stage status transitions for each user.';
COMMENT ON COLUMN public.onboarding_status.stage IS 'Onboarding stage key (e.g., tier1, tier2).';
COMMENT ON COLUMN public.onboarding_status.status IS 'Current stage status (e.g., pending, created, completed, failed).';
COMMENT ON COLUMN public.onboarding_status.reason IS 'Optional failure or review reason for the current status.';
