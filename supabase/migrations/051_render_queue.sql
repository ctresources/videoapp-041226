-- The waiting line for video renders (2026-10-14).
--
-- HeyGen runs ten jobs at once for the whole account. An eleventh used to be
-- turned away with "try again in a few minutes"; it now waits here and is
-- sent by /api/cron/render-queue, oldest first, as soon as a slot frees.
-- body is the render request exactly as the editor sent it, so the start
-- from the line is the same render the agent asked for.
create table if not exists public.render_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  body jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'starting', 'started', 'failed', 'cancelled')),
  attempts integer not null default 0,
  next_try_at timestamptz not null default now(),
  video_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists render_queue_status_created on public.render_queue (status, created_at);
create index if not exists render_queue_user on public.render_queue (user_id, created_at desc);

alter table public.render_queue enable row level security;

-- Read your own place in line. Every write is the server's.
drop policy if exists "render_queue_select_own" on public.render_queue;
create policy "render_queue_select_own" on public.render_queue
  for select using (auth.uid() = user_id);
