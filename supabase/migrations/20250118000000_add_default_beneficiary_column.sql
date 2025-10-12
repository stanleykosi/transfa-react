/**
 * Migration: add_default_beneficiary_column
 *
 * Description:
 * This migration adds the `is_default` column to the existing `beneficiaries` table.
 * This column indicates which beneficiary is the user's default for receiving external transfers.
 */

-- Add the is_default column to the beneficiaries table
ALTER TABLE public.beneficiaries 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Add a comment for clarity
COMMENT ON COLUMN public.beneficiaries.is_default IS 'Indicates if this is the user''s default beneficiary for receiving external transfers.';

-- Create a unique partial index to ensure only one default beneficiary per user
-- This prevents multiple beneficiaries from being marked as default for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiaries_user_default 
ON public.beneficiaries (user_id) 
WHERE is_default = TRUE;
