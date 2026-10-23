-- Video on the SparkReels blog (2026-10-22, the owner's ask: "instead of
-- image for blog, can it be video blog?"). Filled by Publish to SparkReels
-- blog from the post's own project:
--   video_url        its latest finished video (played with controls)
--   header_video_url its moving header (a silent loop of the cover picture)
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS header_video_url TEXT;
