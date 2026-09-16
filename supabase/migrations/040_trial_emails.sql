-- 040: remember which trial emails have been sent
--
-- The 30-day window that opens when someone generates their free video used to
-- close in silence: the app locked the camera and the tools, and nothing ever
-- said so unless the person happened to open the dashboard. These two columns
-- are what let a daily job say it once.
--
-- Timestamps rather than booleans, for the same reason as the consent columns:
-- "did we email them, and when" answers a support question that "true" cannot.
-- NULL means not sent. Neither is ever cleared, so neither email can repeat.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_warning_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ended_email_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.trial_warning_email_at IS
  'When the "3 days left" email was sent. NULL = never. Set once, never cleared.';
COMMENT ON COLUMN public.profiles.trial_ended_email_at IS
  'When the "your window closed" email was sent. NULL = never. Set once, never cleared.';

-- The cron scans free-tier accounts whose clock has started. Tiny table today,
-- but this is the query it runs every morning.
CREATE INDEX IF NOT EXISTS idx_profiles_trial_clock
  ON public.profiles(first_video_generated_at)
  WHERE first_video_generated_at IS NOT NULL;
