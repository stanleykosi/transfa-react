-- Migration: make_account_fields_nullable_for_money_drop
-- Description: Makes anchor_account_id and virtual_nuban nullable to support money drop ledger accounts.
-- Money drop accounts don't need Anchor accounts until they're first used (lazy creation).

-- Step 1: Remove NOT NULL constraint from anchor_account_id
ALTER TABLE public.accounts 
ALTER COLUMN anchor_account_id DROP NOT NULL;

-- Step 2: Remove NOT NULL constraint from virtual_nuban
ALTER TABLE public.accounts 
ALTER COLUMN virtual_nuban DROP NOT NULL;

-- Step 3: Update UNIQUE constraint on anchor_account_id to allow NULL values
-- PostgreSQL allows multiple NULL values in UNIQUE columns, so this is fine
-- But we should add a partial unique index to ensure only one money_drop account per user
CREATE UNIQUE INDEX idx_accounts_user_money_drop 
ON public.accounts(user_id, account_type) 
WHERE account_type = 'money_drop';

-- Step 4: Update comments
COMMENT ON COLUMN public.accounts.anchor_account_id IS 'Foreign key to the Anchor BaaS deposit account resource ID. NULL for money_drop accounts that haven''t been provisioned yet.';
COMMENT ON COLUMN public.accounts.virtual_nuban IS 'The unique NUBAN for funding this wallet. NULL for money_drop accounts that haven''t been provisioned yet.';
