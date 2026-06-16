-- Allow 'heygen_v3_direct' as a valid render_provider for the opt-in
-- HeyGen v3 Direct Video path (POST /v3/videos, single talking-head).
ALTER TABLE public.generated_videos
  DROP CONSTRAINT IF EXISTS generated_videos_render_provider_check;

ALTER TABLE public.generated_videos
  ADD CONSTRAINT generated_videos_render_provider_check
  CHECK (render_provider IN ('creatomate', 'heygen', 'heygen_agent', 'heygen_v2', 'heygen_v3_direct', 'camera'));
