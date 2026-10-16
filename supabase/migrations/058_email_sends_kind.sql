-- 058: blog and newsletter emails sent through BoldTrail (2026-10-15)
--
-- The same record as video emails, so every send through BoldTrail is in one
-- place and the quick picks come from all of them. kind says which: 'video',
-- 'blog' (a post's email version) or 'newsletter'; project_ids names the
-- post(s) it was made from.

alter table public.video_email_sends
  add column if not exists kind text not null default 'video',
  add column if not exists project_ids uuid[];
