-- AutoSparks drafts 1 video + 2 blogs a week by default (2026-10-24, the
-- owner's ask): every plan has 4 short videos a month, and 2 a week was about
-- double that. Accounts still on the old default of 2 move to 1; on
-- 2026-10-24 that was 20 accounts, and the one that had chosen 1 is unchanged.
ALTER TABLE public.profiles ALTER COLUMN autopilot_videos SET DEFAULT 1;
UPDATE public.profiles SET autopilot_videos = 1 WHERE autopilot_videos = 2;
