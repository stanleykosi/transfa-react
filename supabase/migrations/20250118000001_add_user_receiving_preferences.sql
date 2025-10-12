/**
 * Migration: add_user_receiving_preferences
 *
 * Description:
 * This migration adds the `user_receiving_preferences` table to store user preferences
 * for how they want to receive transfers (external beneficiary vs internal wallet).
 */

-- Create the user_receiving_preferences table
CREATE TABLE IF NOT EXISTS public.user_receiving_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    use_external_account BOOLEAN NOT NULL DEFAULT TRUE,
    default_beneficiary_id UUID REFERENCES public.beneficiaries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity
COMMENT ON TABLE public.user_receiving_preferences IS 'Stores user preferences for receiving transfers (external beneficiary vs internal wallet).';
COMMENT ON COLUMN public.user_receiving_preferences.use_external_account IS 'If true, use external beneficiary for receiving; if false, use internal wallet.';
COMMENT ON COLUMN public.user_receiving_preferences.default_beneficiary_id IS 'The beneficiary to use when use_external_account is true.';

-- Apply the timestamp trigger
DROP TRIGGER IF EXISTS set_user_receiving_preferences_updated_at ON public.user_receiving_preferences;
CREATE TRIGGER set_user_receiving_preferences_updated_at
BEFORE UPDATE ON public.user_receiving_preferences
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Enable Row Level Security
ALTER TABLE public.user_receiving_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS "Users can access their own receiving preferences." ON public.user_receiving_preferences;
CREATE POLICY "Users can access their own receiving preferences."
ON public.user_receiving_preferences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_receiving_preferences.user_id AND users.clerk_user_id = auth.uid()::text
  )
);
