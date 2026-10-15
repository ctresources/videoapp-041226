-- 054: Seller Update, any day and with a video (2026-10-15)
--
-- An update is dated the day it is written rather than filed under its
-- week's Monday, so an agent can send one whenever they like; the numbers
-- compare with the update before it, whenever that was. Writing again on the
-- same day still replaces that day's update.
--
-- And an update can carry a video the agent recorded on the camera for it:
-- the take (generated_videos), its address, a still with a play button drawn
-- on for the email, and its length.

alter table public.seller_listing_updates rename column week_of to update_on;

alter table public.seller_listing_updates
  add column if not exists video_id uuid references public.generated_videos(id) on delete set null,
  add column if not exists video_url text,
  add column if not exists video_poster_url text,
  add column if not exists video_seconds integer;
