-- 057: emailing a video from My Sparks through BoldTrail (2026-10-15)
--
-- One row per send: which video, what it said, and to whom (each recipient's
-- BoldTrail contact, and whether their email went). Also where the quick
-- picks come from: people the agent has emailed a video to before.
-- generated_videos.email_poster_url keeps the still-with-play-button made for
-- the email, so it is made once per video.
--
-- Read and written only by the server: RLS on, no policies.

create table if not exists public.video_email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid references public.generated_videos(id) on delete set null,
  subject text not null,
  note text,
  sent_to jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null default now()
);
create index if not exists video_email_sends_user_idx on public.video_email_sends (user_id, sent_at desc);
alter table public.video_email_sends enable row level security;

alter table public.generated_videos add column if not exists email_poster_url text;
