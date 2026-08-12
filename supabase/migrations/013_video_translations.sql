-- Allow 'heygen_v3_translate' as a render_provider for videos created by
-- dubbing an existing render into another language (POST /v3/video-translations).
ALTER TABLE public.generated_videos
  DROP CONSTRAINT IF EXISTS generated_videos_render_provider_check;

ALTER TABLE public.generated_videos
  ADD CONSTRAINT generated_videos_render_provider_check
  CHECK (render_provider IN ('creatomate', 'heygen', 'heygen_agent', 'heygen_v2', 'heygen_v3_direct', 'camera', 'heygen_v3_translate'));

-- source_video_id links a translation back to the video it was dubbed from —
-- lets the UI show "Spanish version of X" and query all translations of a
-- given render. translation_language is HeyGen's own language string
-- (see GET /v3/video-translations/languages), stored verbatim so it can be
-- sent back to HeyGen unchanged and displayed without a lookup table.
ALTER TABLE public.generated_videos
  ADD COLUMN IF NOT EXISTS source_video_id UUID REFERENCES public.generated_videos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS translation_language TEXT;
