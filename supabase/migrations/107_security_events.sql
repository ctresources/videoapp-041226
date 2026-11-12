-- The weekly watch email (2026-11-12, the owner's ask).
--
-- security_events: attempts to get the AI to reveal its instructions or how
-- SparkReels works, recorded as they happen (lib/security/probe.ts). Only
-- the server reads or writes it: RLS on, no policies.
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  source text not null,
  detail text,
  matched text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
alter table public.security_events enable row level security;
grant select, insert, update, delete on public.security_events to service_role;

-- New accounts from the last N days that share a sign-in address. Reads the
-- auth schema, which the Data API can't, so it runs as its owner; only the
-- server may call it.
create or replace function public.security_shared_signups(since timestamptz)
returns table (ip text, accounts bigint, emails text[])
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select host(s.ip) as ip,
         count(distinct u.id) as accounts,
         array_agg(distinct coalesce(u.email, u.id::text)) as emails
  from auth.users u
  join auth.sessions s on s.user_id = u.id
  where u.created_at >= since and s.ip is not null
  group by host(s.ip)
  having count(distinct u.id) >= 3
  order by accounts desc
  limit 20;
$$;
revoke all on function public.security_shared_signups(timestamptz) from public, anon, authenticated;
grant execute on function public.security_shared_signups(timestamptz) to service_role;
