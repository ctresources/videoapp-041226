-- 041: the latest YouTube numbers for a published video
--
-- One row per social post, overwritten each day. Deliberately NOT a history
-- table: the owner asked for the latest figures, and a snapshot per video per
-- day would be a table that grows forever to answer a question nobody has yet.
-- When a trend graph is wanted, this becomes the newest row of a history table
-- and the cron stops upserting — that is an additive change, not a rewrite.
--
-- Not columns on social_posts, because these are not facts about the post. The
-- post is what we did; this is what the world did back, fetched at a moment,
-- and it goes stale in a way posted_at never does.
--
-- Scoped by the cron to posts from 1 September 2026 on, which is where this
-- account's real publishing starts.

CREATE TABLE IF NOT EXISTS public.video_stats (
  social_post_id UUID PRIMARY KEY REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'youtube',
  -- The YouTube video id this counts, copied so a row is readable on its own.
  platform_post_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_stats_user ON public.video_stats(user_id);

ALTER TABLE public.video_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own video stats" ON public.video_stats
  FOR SELECT USING (auth.uid() = user_id);
