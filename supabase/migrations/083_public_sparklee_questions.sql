-- Ask Sparklee on the public website (2026-10-26): each question a visitor
-- asks, by a hash of their IP, so each visitor gets 4 a day. Read and written
-- only by the server (service role); visitors never touch it directly.
create table if not exists public.public_sparklee_questions (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  question text not null,
  answer text,
  page text,
  created_at timestamptz not null default now()
);

create index if not exists public_sparklee_questions_ip_time
  on public.public_sparklee_questions (ip_hash, created_at desc);

alter table public.public_sparklee_questions enable row level security;

grant select, insert, update on public.public_sparklee_questions to service_role;
