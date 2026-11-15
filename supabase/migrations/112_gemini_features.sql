-- Gemini features (2026-11-15, the owner's approved plan).

-- Monthly counts of Gemini use: searches (capped at 4,000 to stay free),
-- images, video checks, take tips, photo sorts, files.
create table if not exists public.gemini_usage (
  month text primary key,
  counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gemini_usage enable row level security;
grant select, insert, update, delete on public.gemini_usage to service_role;

create or replace function public.gemini_count(p_kind text, p_n int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m text := to_char(now() at time zone 'America/New_York', 'YYYY-MM');
  v int;
begin
  insert into public.gemini_usage (month, counts)
  values (m, jsonb_build_object(p_kind, p_n))
  on conflict (month) do update
    set counts = public.gemini_usage.counts
      || jsonb_build_object(p_kind, coalesce((public.gemini_usage.counts->>p_kind)::int, 0) + p_n),
        updated_at = now()
  returning (counts->>p_kind)::int into v;
  return v;
end
$$;
revoke all on function public.gemini_count(text, int) from public, anon, authenticated;
grant execute on function public.gemini_count(text, int) to service_role;

-- One row per finished-video check.
create table if not exists public.video_checks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.generated_videos(id) on delete cascade,
  user_id uuid not null,
  mode text not null check (mode in ('enforce', 'record')),
  status text not null check (status in ('ok', 'problems', 'error')),
  problems jsonb not null default '[]'::jsonb,
  action text check (action in ('refinished', 'remake_offered', 'would_refinish', 'would_offer_remake')),
  seconds int,
  created_at timestamptz not null default now()
);
create index if not exists video_checks_created_idx on public.video_checks (created_at desc);
create index if not exists video_checks_video_idx on public.video_checks (video_id);
alter table public.video_checks enable row level security;
grant select, insert, update, delete on public.video_checks to service_role;

-- Photo Touch-Up edits, for the 30-a-month allowance.
create table if not exists public.photo_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  source_url text,
  result_url text,
  created_at timestamptz not null default now()
);
create index if not exists photo_edits_user_idx on public.photo_edits (user_id, created_at desc);
alter table public.photo_edits enable row level security;
grant select, insert, update, delete on public.photo_edits to service_role;
