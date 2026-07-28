-- Split the monthly video allowance into two independent buckets.
--
-- Previously `credits_remaining` was a single pooled budget where a long video
-- drew 3. Plans are sold as "4 short AND 2 long", so the buckets are now
-- tracked separately: spending long videos no longer eats short ones.
--
--   credits_remaining       -> SHORT video allowance (1 per short video)
--   long_credits_remaining  -> LONG video allowance  (1 per long video)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS long_credits_remaining INTEGER NOT NULL DEFAULT 0;

-- Backfill existing subscribers so nobody loses access mid-cycle. The old pool
-- mixed both kinds, so grant each plan's long allowance outright and leave the
-- existing balance as the short bucket.
UPDATE public.profiles
SET long_credits_remaining = CASE subscription_tier
  WHEN 'pro'   THEN 5
  WHEN 'agent' THEN 2
  ELSE 0
END
WHERE long_credits_remaining = 0
  AND subscription_tier IN ('agent', 'pro');
