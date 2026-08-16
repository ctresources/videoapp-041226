-- Make the database's canonicalisation match the application's, exactly.
--
-- Migration 020 (and 022, which reused its expression) stripped "+tag" from
-- EVERY domain. canonicalEmail() in lib/spam-guards.ts strips it only for
-- providers known to ignore it — gmail, outlook, yahoo, icloud and friends.
-- So "foo+bar@example.com" canonicalised to "foo@example.com" in SQL but
-- "foo+bar@example.com" in TypeScript.
--
-- The SQL was the more aggressive of the two, which is the dangerous
-- direction: it can collapse two genuinely different inboxes onto one key and
-- make screenSignup refuse a legitimate signup with "An account already exists
-- for this email address."
--
-- Rather than duplicate the rule a third time, this defines it once as a
-- function both the trigger and any future backfill call. It mirrors
-- canonicalEmail() line for line, including the details that are easy to miss:
--   * lastIndexOf("@"), not the first "@", so "a@b@c.com" splits the way JS
--     splits it
--   * the `at < 1` guard, so a string with no "@" (or a leading one) comes
--     back untouched instead of being split into nonsense
--   * trim + lowercase before anything else
--   * dot-stripping ONLY for gmail/googlemail, never for the +tag providers
--   * googlemail.com folded to gmail.com last

CREATE OR REPLACE FUNCTION public.canonical_email(raw_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw          text;
  at_pos       int;
  local_part   text;
  domain_part  text;
BEGIN
  IF raw_email IS NULL THEN
    RETURN NULL;
  END IF;

  raw := lower(btrim(raw_email));

  -- 1-based index of the LAST "@". JS uses lastIndexOf and slices around it.
  at_pos := length(raw) - position('@' in reverse(raw)) + 1;

  -- No "@" at all, or the address begins with one: canonicalEmail() returns
  -- the raw string in both cases (its `at < 1` check).
  IF position('@' in raw) = 0 OR at_pos < 2 THEN
    RETURN raw;
  END IF;

  local_part  := substr(raw, 1, at_pos - 1);
  domain_part := substr(raw, at_pos + 1);

  -- PLUS_TAG_DOMAINS
  IF domain_part IN (
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'proton.me', 'protonmail.com', 'icloud.com', 'fastmail.com'
  ) THEN
    local_part := split_part(local_part, '+', 1);
  END IF;

  -- DOT_INSENSITIVE
  IF domain_part IN ('gmail.com', 'googlemail.com') THEN
    local_part := replace(local_part, '.', '');
  END IF;

  IF domain_part = 'googlemail.com' THEN
    domain_part := 'gmail.com';
  END IF;

  RETURN local_part || '@' || domain_part;
END;
$$;

-- Point the trigger at the shared function instead of an inline copy.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, email_canonical)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    public.canonical_email(NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recompute every row under the corrected rule. Rows canonicalised by the
-- old over-aggressive expression are only wrong for +tag addresses outside
-- the provider list, but recomputing all of them is what guarantees the
-- column agrees with the application from here on.
UPDATE public.profiles
SET email_canonical = public.canonical_email(email)
WHERE email IS NOT NULL
  AND email_canonical IS DISTINCT FROM public.canonical_email(email);
