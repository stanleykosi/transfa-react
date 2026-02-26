/**
 * Migration: remove_pin_change_otp_challenges
 *
 * Description:
 * Removes legacy backend OTP challenge storage for PIN change flow.
 * PIN change now depends on Clerk reverification + backend session freshness checks.
 */

DROP TRIGGER IF EXISTS set_pin_change_otp_challenges_updated_at ON public.pin_change_otp_challenges;
DROP TABLE IF EXISTS public.pin_change_otp_challenges;
