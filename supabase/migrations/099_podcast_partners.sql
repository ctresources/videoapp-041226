-- Spark Podcast, 2026-11-02 (the owner's ask): another SparkReels user as the
-- co-host, as their own Digital Twin and voice, only once they press Allow.
-- Written only by the server (service role); each side can read its own rows.

create table if not exists public.podcast_partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_email text not null,
  partner_id uuid references auth.users(id) on delete cascade,
  -- How the host introduces them, e.g. "mortgage lender".
  role text,
  status text not null default 'invited' check (status in ('invited', 'allowed', 'declined', 'removed')),
  token text not null unique,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists podcast_partners_owner on public.podcast_partners (owner_id);
create index if not exists podcast_partners_partner on public.podcast_partners (partner_id);
create unique index if not exists podcast_partners_pair on public.podcast_partners (owner_id, lower(partner_email));

alter table public.podcast_partners enable row level security;
drop policy if exists "podcast_partners_read_own" on public.podcast_partners;
create policy "podcast_partners_read_own" on public.podcast_partners
  for select to authenticated using (owner_id = auth.uid() or partner_id = auth.uid());

grant select on public.podcast_partners to authenticated;
grant all on public.podcast_partners to service_role;

-- A desk episode is two renders that finish separately. Each finish is
-- recorded in one statement, so two arriving together can't overwrite each
-- other; returns the episode's desk record as it now stands.
create or replace function public.podcast_desk_part(row_id uuid, part text, info jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  update generated_videos
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array['desk', 'parts', part],
                              coalesce(metadata #> array['desk', 'parts', part], '{}'::jsonb) || info, true)
   where id = row_id
  returning metadata -> 'desk';
$$;
revoke all on function public.podcast_desk_part(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.podcast_desk_part(uuid, text, jsonb) to service_role;
