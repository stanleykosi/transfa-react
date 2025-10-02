/**
 * Migration: add_bank_name_to_accounts
 *
 * Description:
 * This migration adds a bank_name column to the accounts table to store
 * the bank name associated with each account's Virtual NUBAN.
 *
 * The bank name is retrieved from Anchor's API when fetching the Virtual NUBAN
 * and is used for display purposes on the frontend.
 */

-- Add bank_name column to the accounts table
ALTER TABLE public.accounts 
ADD COLUMN bank_name VARCHAR(255);

-- Add comment for clarity
COMMENT ON COLUMN public.accounts.bank_name IS 'The name of the bank associated with the Virtual NUBAN (e.g., "CORESTEP MICROFINANCE BANK")';

-- Create index on bank_name for potential future queries
CREATE INDEX idx_accounts_bank_name ON public.accounts(bank_name);
