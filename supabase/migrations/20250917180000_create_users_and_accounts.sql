/**
 * Migration: create_users_and_accounts
 *
 * Description:
 * This migration establishes the foundational tables for the Transfa application:
 * 1. `users`: Stores user profile information, linking Clerk authentication to internal and BaaS IDs.
 * 2. `accounts`: Manages user wallets and their balances.
 *
 * It also sets up essential database infrastructure:
 * - Custom ENUM types for controlled vocabularies.
 * - An automatic timestamp update function for `updated_at` columns.
 * - Strict Row Level Security (RLS) policies to ensure users can only access their own data.
 */

-- Step 1: Create custom ENUM types for data integrity.
CREATE TYPE public.user_type AS ENUM ('personal', 'merchant');
CREATE TYPE public.account_type AS ENUM ('primary', 'money_drop');
CREATE TYPE public.account_status AS ENUM ('active', 'frozen');

-- Step 2: Create a reusable function to automatically update 'updated_at' timestamps on row changes.
-- This helps in auditing and tracking when records were last modified.
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create the 'users' table.
-- This table is the central hub for user identity.
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    anchor_customer_id VARCHAR(255) UNIQUE,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(50) UNIQUE,
    full_name VARCHAR(255),
    profile_picture_url TEXT,
    user_type public.user_type NOT NULL,
    allow_sending BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments to the table and columns for better schema understanding.
COMMENT ON TABLE public.users IS 'Stores user profile information, linking Clerk auth to internal and BaaS IDs.';
COMMENT ON COLUMN public.users.id IS 'Internal unique identifier for the user (UUID).';
COMMENT ON COLUMN public.users.clerk_user_id IS 'Foreign key to the Clerk user ID. Used for RLS policies.';
COMMENT ON COLUMN public.users.anchor_customer_id IS 'Foreign key to the Anchor BaaS customer resource ID.';
COMMENT ON COLUMN public.users.username IS 'Unique, user-chosen, and searchable username.';
COMMENT ON COLUMN public.users.user_type IS 'Type of user account: personal or merchant.';
COMMENT ON COLUMN public.users.allow_sending IS 'Flag to control sending capabilities, primarily for merchants.';

-- Apply the updated_at trigger to the 'users' table.
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Step 4: Create the 'accounts' table.
-- This table stores financial accounts (wallets) for each user.
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    anchor_account_id VARCHAR(255) UNIQUE NOT NULL,
    virtual_nuban VARCHAR(10) UNIQUE NOT NULL,
    account_type public.account_type NOT NULL DEFAULT 'primary',
    balance BIGINT NOT NULL DEFAULT 0,
    status public.account_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes on frequently queried columns for performance optimization.
CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);

-- Add comments for clarity.
COMMENT ON TABLE public.accounts IS 'Stores user wallet accounts, linking them to users and Anchor BaaS accounts.';
COMMENT ON COLUMN public.accounts.user_id IS 'Foreign key to the internal user ID.';
COMMENT ON COLUMN public.accounts.anchor_account_id IS 'Foreign key to the Anchor BaaS deposit account resource ID.';
COMMENT ON COLUMN public.accounts.virtual_nuban IS 'The unique NUBAN for funding this wallet.';
COMMENT ON COLUMN public.accounts.account_type IS 'Type of account: primary wallet or a special-purpose account like for Money Drops.';
COMMENT ON COLUMN public.accounts.balance IS 'Current account balance, stored in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.accounts.status IS 'Status of the account (e.g., active, frozen).';

-- Apply the updated_at trigger to the 'accounts' table.
CREATE TRIGGER set_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Step 5: Enable Row Level Security (RLS) on the new tables.
-- This is a critical security measure to ensure data is not exposed.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for the 'users' table.
-- These policies ensure that users can only access and modify their own data.
CREATE POLICY "Users can view their own profile."
ON public.users FOR SELECT
USING (auth.uid()::text = clerk_user_id);

CREATE POLICY "Users can update their own profile."
ON public.users FOR UPDATE
USING (auth.uid()::text = clerk_user_id);

-- NOTE: INSERT and DELETE operations on the 'users' table are expected to be handled
-- by backend services using a service_role key, which bypasses RLS. Policies are
-- primarily for client-side protection.

-- Step 7: Create RLS policies for the 'accounts' table.
-- This policy allows a user to perform any action (SELECT, INSERT, UPDATE, DELETE)
-- on an account record only if they are the owner of that account.
-- Ownership is determined by joining through the `users` table.
CREATE POLICY "Users can access their own accounts."
ON public.accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = accounts.user_id AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = accounts.user_id AND users.clerk_user_id = auth.uid()::text
  )
);
