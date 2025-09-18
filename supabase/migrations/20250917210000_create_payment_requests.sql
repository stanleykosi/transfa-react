/**
 * Migration: create_payment_requests
 *
 * Description:
 * This migration creates the `payment_requests` table, which is essential for the
 * Payment Request feature. This table stores all the details of a payment request
 * created by a user, including the amount, description, an optional image, and its status.
 *
 * It also defines the necessary ENUM type for the status and implements strict
 * Row Level Security (RLS) policies to ensure users can only access and manage
 * their own payment requests.
 */

-- Step 1: Create a custom ENUM type for the payment request status.
-- This ensures that the status column can only contain predefined values.
CREATE TYPE public.payment_request_status AS ENUM ('pending', 'fulfilled');

-- Step 2: Create the 'payment_requests' table.
-- This table will store all user-generated payment requests.
CREATE TABLE public.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.payment_request_status NOT NULL DEFAULT 'pending',
    amount BIGINT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity and schema documentation.
COMMENT ON TABLE public.payment_requests IS 'Stores user-created payment requests with status and details.';
COMMENT ON COLUMN public.payment_requests.creator_id IS 'Foreign key to the user who created the request.';
COMMENT ON COLUMN public.payment_requests.status IS 'The current status of the request (pending or fulfilled).';
COMMENT ON COLUMN public.payment_requests.amount IS 'The requested amount in the smallest currency unit (kobo).';
COMMENT ON COLUMN public.payment_requests.image_url IS 'URL of an optional image uploaded to Supabase Storage.';

-- Add an index on the creator_id for faster lookups of a user's requests.
CREATE INDEX idx_payment_requests_creator_id ON public.payment_requests(creator_id);

-- Step 3: Apply the existing timestamp trigger to the 'payment_requests' table.
-- This ensures the `updated_at` column is automatically managed.
CREATE TRIGGER set_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Step 4: Enable Row Level Security (RLS) on the new table.
-- This is a critical security step to protect user data.
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for the 'payment_requests' table.
-- This policy ensures that a user can only interact with their own payment requests.
-- They can perform all actions (SELECT, INSERT, UPDATE, DELETE) on records they created.
CREATE POLICY "Users can manage their own payment requests."
ON public.payment_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = payment_requests.creator_id AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = payment_requests.creator_id AND users.clerk_user_id = auth.uid()::text
  )
);
