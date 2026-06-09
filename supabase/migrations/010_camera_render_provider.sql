-- Allow 'camera' as a valid render_provider for teleprompter recordings
-- Also covers heygen_agent and heygen_v2 which exist in production
ALTER TABLE public.generated_videos
  DROP CONSTRAINT IF EXISTS generated_videos_render_provider_check;

ALTER TABLE public.generated_videos
  ADD CONSTRAINT generated_videos_render_provider_check
  CHECK (render_provider IN ('creatomate', 'heygen', 'heygen_agent', 'heygen_v2', 'camera'));
