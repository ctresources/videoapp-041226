-- Purchased add-on videos must survive the monthly reset.
--
-- The plan allowance (credits_remaining / long_credits_remaining) is SET back
-- to the plan's amount every billing cycle, which also wiped anything the user
-- had paid extra for: buy a $39 long video on the 28th and it vanished on the
-- 1st. Add-ons now live in their own columns that renewal never touches.
--
--   credits_remaining        -> plan SHORT allowance (resets monthly)
--   long_credits_remaining   -> plan LONG allowance  (resets monthly)
--   purchased_short_videos   -> bought SHORT videos  (never expire)
--   purchased_long_videos    -> bought LONG videos   (never expire)
--
-- Availability is the sum of the two; the plan allowance is always spent first
-- so the expiring balance is used before the permanent one.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS purchased_short_videos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_long_videos  INTEGER NOT NULL DEFAULT 0;
