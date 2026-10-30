-- Account file cleanup (2026-10-29, the owner's go-ahead).
-- Free accounts quiet for 6 months, and canceled accounts 90 days after their
-- plan ends (or their last use, whichever is later), get two warning emails,
-- 30 and 7 days before, then their videos and uploads are removed. The account
-- itself, its blogs and settings stay. Coming back, or paying, resets it.
-- Written only by the daily job with the service role; users never read it.

create table if not exists public.account_cleanup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('inactive_free', 'canceled')),
  due_at timestamptz not null,
  warned_30_at timestamptz,
  warned_7_at timestamptz,
  cleaned_at timestamptz,
  cleaned_files integer,
  created_at timestamptz not null default now()
);

alter table public.account_cleanup enable row level security;

grant select, insert, update, delete on public.account_cleanup to service_role;
