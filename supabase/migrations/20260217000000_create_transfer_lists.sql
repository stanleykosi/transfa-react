/**
 * Migration: create_transfer_lists
 *
 * Description:
 * - Adds reusable transfer list entities for bulk payouts.
 * - Enforces ownership boundaries and max-performance indexes for list + member reads.
 */

CREATE TABLE IF NOT EXISTS public.transfer_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transfer_lists_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_lists_owner_name_unique
  ON public.transfer_lists(owner_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_lists_owner_updated
  ON public.transfer_lists(owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.transfer_lists IS 'User-defined reusable transfer groups for fast bulk transfer setup.';
COMMENT ON COLUMN public.transfer_lists.owner_id IS 'The list owner; only this user can mutate list metadata or members.';
COMMENT ON COLUMN public.transfer_lists.name IS 'Display label of the transfer list (e.g., Family, Brothers 4L).';
COMMENT ON COLUMN public.transfer_lists.deleted_at IS 'Soft-delete timestamp so accidental list removals are recoverable.';

CREATE TRIGGER set_transfer_lists_updated_at
BEFORE UPDATE ON public.transfer_lists
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS public.transfer_list_members (
  list_id UUID NOT NULL REFERENCES public.transfer_lists(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS idx_transfer_list_members_list_created
  ON public.transfer_list_members(list_id, created_at);

CREATE INDEX IF NOT EXISTS idx_transfer_list_members_user
  ON public.transfer_list_members(member_user_id);

COMMENT ON TABLE public.transfer_list_members IS 'Join table for transfer list membership.';
COMMENT ON COLUMN public.transfer_list_members.member_user_id IS 'The user included as a payable recipient in this list.';

ALTER TABLE public.transfer_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own transfer lists."
ON public.transfer_lists FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = transfer_lists.owner_id
      AND users.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = transfer_lists.owner_id
      AND users.clerk_user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can manage members on their own transfer lists."
ON public.transfer_list_members FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.transfer_lists tl
    JOIN public.users u ON u.id = tl.owner_id
    WHERE tl.id = transfer_list_members.list_id
      AND tl.deleted_at IS NULL
      AND u.clerk_user_id = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.transfer_lists tl
    JOIN public.users u ON u.id = tl.owner_id
    WHERE tl.id = transfer_list_members.list_id
      AND tl.deleted_at IS NULL
      AND u.clerk_user_id = auth.uid()::text
  )
);
