-- AI crawler visits for the Monday watch email (2026-11-12, the owner's ask).
-- Clarity's Bot Activity needs a CDN that Vercel isn't one of, so the app
-- counts known AI crawlers itself (middleware.ts): one row per day, crawler
-- and page, with a hit count. Server only: RLS on, no policies.
create table if not exists public.ai_crawler_daily (
  day date not null,
  bot text not null,
  path text not null,
  hits integer not null default 0,
  primary key (day, bot, path)
);
alter table public.ai_crawler_daily enable row level security;
grant select, insert, update, delete on public.ai_crawler_daily to service_role;

create or replace function public.bump_ai_crawler(p_bot text, p_path text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_crawler_daily (day, bot, path, hits)
  values ((now() at time zone 'utc')::date, left(p_bot, 60), left(p_path, 200), 1)
  on conflict (day, bot, path) do update set hits = public.ai_crawler_daily.hits + 1;
$$;
revoke all on function public.bump_ai_crawler(text, text) from public, anon, authenticated;
grant execute on function public.bump_ai_crawler(text, text) to service_role;
