/**
 * Migration: add_user_security_credentials
 *
 * Description:
 * Adds a backend-owned credentials table for sensitive user security factors.
 * For now it stores the hashed transaction PIN used for transaction authorization.
 *
 * Notes:
 * - PIN values are never stored in plaintext, only bcrypt hashes.
 * - This table is backend-only; enabling RLS without policies blocks direct client access.
 */

CREATE TABLE IF NOT EXISTS public.user_security_credentials (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_pin_hash TEXT NOT NULL,
    pin_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    last_failed_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_security_credentials IS 'Backend-managed security credentials for users (e.g., transaction PIN hash).';
COMMENT ON COLUMN public.user_security_credentials.transaction_pin_hash IS 'bcrypt hash of the user transaction PIN.';
COMMENT ON COLUMN public.user_security_credentials.pin_set_at IS 'Timestamp when the user last set/rotated their transaction PIN.';
COMMENT ON COLUMN public.user_security_credentials.failed_attempts IS 'Server-side failed PIN verification counter for lockout enforcement.';
COMMENT ON COLUMN public.user_security_credentials.locked_until IS 'If set in the future, PIN verification should be blocked until this time.';

DROP TRIGGER IF EXISTS set_user_security_credentials_updated_at ON public.user_security_credentials;
CREATE TRIGGER set_user_security_credentials_updated_at
BEFORE UPDATE ON public.user_security_credentials
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

ALTER TABLE public.user_security_credentials ENABLE ROW LEVEL SECURITY;
