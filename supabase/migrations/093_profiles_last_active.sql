-- When the account last opened the app (2026-10-29): written at most once a
-- day by /api/profile/allowance, read by the account cleanup job so opening
-- SparkReels counts as being back, not only signing in or making something.
alter table public.profiles add column if not exists last_active_at timestamptz;
