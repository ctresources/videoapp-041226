-- Ask for Google Review Video Email (2026-10-30, the owner's ask):
-- the agent's own default words ({ script, subject }), filled in each time,
-- and one saved review video reused for every request (made once, never again).
alter table public.profiles
  add column if not exists review_request_defaults jsonb,
  add column if not exists review_video_id uuid references public.generated_videos(id) on delete set null;
