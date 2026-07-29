-- The single inbox an address actually reaches: gmail ignores dots, and most
-- providers ignore a "+tag" suffix. Without this, one mailbox can collect an
-- unlimited number of free-video accounts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_canonical TEXT;

-- Backfill existing rows with the same rule the app applies at signup.
UPDATE public.profiles
SET email_canonical = CASE
      WHEN split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
        THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
      ELSE split_part(split_part(lower(email), '@', 1), '+', 1)
           || '@' || split_part(lower(email), '@', 2)
    END
WHERE email IS NOT NULL AND email_canonical IS NULL;

-- Non-unique on purpose: a hard constraint would turn an edge case into a
-- failed signup or a broken OAuth re-link. Signup queries this and refuses
-- politely instead.
CREATE INDEX IF NOT EXISTS profiles_email_canonical_idx
  ON public.profiles (email_canonical);
