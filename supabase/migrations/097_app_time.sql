-- Time in the app (2026-10-30, the owner's ask): minutes actively using
-- SparkReels per person per day, and when they were last seen. A heartbeat
-- from an open, visible app page that's been used in the last few minutes
-- adds a minute (/api/profile/heartbeat). Read in Admin.
create table if not exists public.app_time_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  seconds integer not null default 0,
  last_seen timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.app_time_daily enable row level security;
grant select, insert, update, delete on public.app_time_daily to service_role;

create or replace function public.add_app_time(p_user uuid, p_seconds integer)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.app_time_daily (user_id, day, seconds, last_seen)
  values (p_user, (now() at time zone 'utc')::date, greatest(0, least(p_seconds, 120)), now())
  on conflict (user_id, day) do update
    set seconds = public.app_time_daily.seconds + greatest(0, least(excluded.seconds, 120)),
        last_seen = now();
$$;
revoke all on function public.add_app_time(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_app_time(uuid, integer) to service_role;
