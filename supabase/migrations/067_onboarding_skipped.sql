-- "Finish later" on the setup page (2026-10-23, the owner's ask). Set when a
-- new user leaves setup unfinished; the middleware then stops sending them
-- back to /onboarding, and Spark Studio shows a Finish setup reminder until
-- onboarding_done is true.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at TIMESTAMPTZ;
