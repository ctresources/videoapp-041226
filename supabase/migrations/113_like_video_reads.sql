-- Make one like this (2026-11-16, the owner's ask): one row per video read,
-- for the 20-a-month allowance. Only the style notes are kept; the video
-- itself is deleted right after the read.
create table if not exists public.like_video_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('upload', 'youtube')),
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists like_video_reads_user_idx on public.like_video_reads (user_id, created_at desc);
alter table public.like_video_reads enable row level security;
grant select, insert, update, delete on public.like_video_reads to service_role;
