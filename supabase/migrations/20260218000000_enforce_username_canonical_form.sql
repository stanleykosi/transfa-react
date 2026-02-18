/**
 * Migration: enforce_username_canonical_form
 *
 * Description:
 * - Canonicalizes existing usernames to trimmed lowercase.
 * - Enforces canonical username storage via DB constraints.
 * - Adds a canonical lookup index for lower(btrim(username)) queries.
 *
 * Notes:
 * - Username remains nullable (post-onboarding flow).
 * - Empty strings are disallowed; use NULL when username is unset.
 */

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(btrim(username)) AS canonical_username, COUNT(*) AS total
      FROM public.users
      WHERE username IS NOT NULL
        AND btrim(username) <> ''
      GROUP BY lower(btrim(username))
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot enforce canonical username form: duplicate canonical usernames exist.';
  END IF;
END
$$;

UPDATE public.users
SET username = lower(btrim(username))
WHERE username IS NOT NULL
  AND btrim(username) <> ''
  AND username <> lower(btrim(username));

UPDATE public.users
SET username = NULL
WHERE username IS NOT NULL
  AND btrim(username) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE username IS NOT NULL
      AND username !~ '^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$'
  ) THEN
    RAISE EXCEPTION 'Cannot enforce canonical username form: one or more usernames do not match required format.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_username_not_blank'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_username_not_blank
      CHECK (username IS NULL OR btrim(username) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_username_canonical'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_username_canonical
      CHECK (username IS NULL OR username = lower(btrim(username)));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_username_format'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_username_format
      CHECK (
        username IS NULL OR
        username ~ '^[a-z0-9](?:[a-z0-9._]{1,18}[a-z0-9])?$'
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_username_canonical_lookup
  ON public.users ((lower(btrim(username))));
