-- 049: numbers from the other platforms, beside YouTube's
--
-- video_stats already holds one row per social post and names its platform,
-- so a Facebook or Instagram post's figures go in the same table. Two things
-- it did not have:
--
-- shares    YouTube's API gives no share count, so there was no column. The
--           other platforms do, and it is the figure that says a post
--           travelled.
--
-- metrics   What the platform reported, as it came. Each platform names its
--           figures differently (reach, reactions, saves, reposts), and the
--           four columns above are our reading of them. Keeping the original
--           means a wrong reading can be corrected without waiting a day for
--           the next fetch, and a figure nobody asked for yet is not lost.
--
-- Both additive. Existing rows keep their values; shares starts at 0.

ALTER TABLE public.video_stats
  ADD COLUMN IF NOT EXISTS shares INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics JSONB;
