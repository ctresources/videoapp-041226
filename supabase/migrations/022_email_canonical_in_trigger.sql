-- Populate email_canonical when the profile row is created, not afterwards.
--
-- email_canonical is the key the signup guard dedupes on (spam-guards.ts,
-- screenSignup), but it was written by application code in two separate places
-- AFTER the profile already existed: the email register route and the Google
-- OAuth callback. Anything that interrupted the request between profile
-- creation and that update left the column null — and a null row is INVISIBLE
-- to the guard, because .eq("email_canonical", ...) never matches null. One
-- skipped write silently reopens the repeat-free-video hole that migration 020
-- exists to close.
--
-- That is not hypothetical: the first Google signup after the feature shipped
-- (2026-07-29) landed on 2026-08-02 with a null, while every earlier account
-- had a value purely because migration 020's backfill had covered them.
--
-- Computing it inside handle_new_user() puts it in the same INSERT — and so the
-- same transaction — as the row itself. No code path can miss it, including
-- ones that don't exist yet. The expression is character-for-character the one
-- migration 020 backfilled with, so behaviour is unchanged.
--
-- The app-level updates in the register route and OAuth callback are left in
-- place. They now rewrite the same value they would have written anyway, which
-- is harmless and idempotent.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, email_canonical)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    -- Null-safe: a null email falls through to the ELSE branch, where SQL's
    -- null propagation through || yields null rather than a bogus "@" string.
    CASE
      WHEN split_part(lower(NEW.email), '@', 2) IN ('gmail.com', 'googlemail.com')
        THEN replace(split_part(split_part(lower(NEW.email), '@', 1), '+', 1), '.', '') || '@gmail.com'
      ELSE split_part(split_part(lower(NEW.email), '@', 1), '+', 1)
           || '@' || split_part(lower(NEW.email), '@', 2)
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill whatever the application path already missed.
UPDATE public.profiles
SET email_canonical = CASE
      WHEN split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
        THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
      ELSE split_part(split_part(lower(email), '@', 1), '+', 1)
           || '@' || split_part(lower(email), '@', 2)
    END
WHERE email IS NOT NULL AND email_canonical IS NULL;
