/**
 * Migration: make_username_nullable_for_post_kyc_flow
 *
 * Description:
 * Username is no longer collected during onboarding.
 * It is set in a dedicated post-tier2 flow (username creation screen).
 */

ALTER TABLE public.users
ALTER COLUMN username DROP NOT NULL;
