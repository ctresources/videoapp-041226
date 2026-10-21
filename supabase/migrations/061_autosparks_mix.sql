-- AutoSparks: each agent picks the week's mix (2026-10-21, the owner's ask).
-- How many of the 3 weekly drafts are videos; the rest are blog posts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS autopilot_videos SMALLINT NOT NULL DEFAULT 2
  CHECK (autopilot_videos BETWEEN 0 AND 3);
