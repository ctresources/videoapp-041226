-- Clarity on the Monday watch email (2026-11-12, the owner's ask).
--
-- Clarity's export only covers the last 1-3 days and allows 10 requests a
-- day, so a daily cron saves yesterday's numbers by page here and Monday's
-- email adds up the week. The raw answer is kept whole, so nothing is lost
-- if Clarity names a field differently from what the reader expects.
create table if not exists public.clarity_snapshots (
  day date primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.clarity_snapshots enable row level security;
grant select, insert, update, delete on public.clarity_snapshots to service_role;
