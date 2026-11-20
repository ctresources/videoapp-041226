-- My voice (2026-11-18, the owner's approved mockup): a short "how I talk"
-- note every script writer follows, learned from the agent's own words
-- (scripts they paste, recordings, edits, and which of two versions they pick).
alter table public.profiles
  add column if not exists my_voice text,
  add column if not exists my_voice_learning boolean not null default true,
  add column if not exists my_voice_sources jsonb not null default '{}'::jsonb;
