-- Allow 'ffmpeg' as a render_provider, for photo reels.
--
-- Every value in this list so far names something that rendered the video
-- somewhere else and sent it back: Creatomate, one of the HeyGen endpoints, or
-- 'camera' for a recording the browser composited itself. A photo reel is the
-- first thing this app renders on its own server, so it needs a name of its
-- own — filing it under 'camera' would say a person recorded it, which is the
-- one thing that did not happen.
--
-- It matters beyond tidiness: My Videos and the publish flow read this column
-- to decide what a video is and what can be done with it, and a reel that
-- claims to be a camera take will eventually be offered something that only
-- makes sense for one.
ALTER TABLE public.generated_videos
  DROP CONSTRAINT IF EXISTS generated_videos_render_provider_check;

ALTER TABLE public.generated_videos
  ADD CONSTRAINT generated_videos_render_provider_check
  CHECK (render_provider IN (
    'creatomate',
    'heygen',
    'heygen_agent',
    'heygen_v2',
    'heygen_v3_direct',
    'heygen_v3_translate',
    'camera',
    'ffmpeg'
  ));
