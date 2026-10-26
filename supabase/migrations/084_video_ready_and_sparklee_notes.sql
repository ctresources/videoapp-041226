-- 2026-10-26, usability sweep #9 and #12.
--
-- #9: a finished video is announced once. ready_notified_at is claimed by the
-- first path that sees the video finish; ready_seen_at is set when Sparklee's
-- in-app pop-up shows it, so the email only goes to someone who wasn't there.
alter table public.generated_videos
  add column if not exists ready_notified_at timestamptz,
  add column if not exists ready_seen_at timestamptz;

-- #12: Sparklee's one-line notes. "fixed" = something the app repaired by
-- itself; "needs" = something only the agent can do, with the button for it.
create table if not exists public.sparklee_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fixed', 'needs')),
  title text not null,
  body text,
  action_label text,
  action_href text,
  project_id uuid,
  video_id uuid,
  dedupe_key text,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists sparklee_notes_user_open
  on public.sparklee_notes (user_id, created_at desc) where dismissed_at is null;
create unique index if not exists sparklee_notes_dedupe
  on public.sparklee_notes (user_id, dedupe_key) where dedupe_key is not null;

alter table public.sparklee_notes enable row level security;

drop policy if exists "own notes read" on public.sparklee_notes;
create policy "own notes read" on public.sparklee_notes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own notes dismiss" on public.sparklee_notes;
create policy "own notes dismiss" on public.sparklee_notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.sparklee_notes to authenticated;
grant all on public.sparklee_notes to service_role;
