-- 2026-11-07: the SparkReels.ai Affiliate Program Terms. Which version an
-- affiliate accepted, and when. Until the current version is accepted, new
-- sign-ups through their link aren't credited and payouts wait.
alter table public.affiliates add column if not exists terms_version text;
alter table public.affiliates add column if not exists terms_accepted_at timestamptz;
