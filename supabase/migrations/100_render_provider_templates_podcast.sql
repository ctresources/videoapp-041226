-- 2026-11-03: video templates ("template"), Spark Podcast at the desk
-- ("podcast_desk") and a partner's copy of an episode ("podcast_copy") are
-- finished by our own steps. The list of allowed kinds refused them, so the
-- first template video failed before anything was made.
alter table public.generated_videos drop constraint if exists generated_videos_render_provider_check;
alter table public.generated_videos add constraint generated_videos_render_provider_check
  check (render_provider = any (array['creatomate', 'heygen', 'heygen_agent', 'heygen_v2', 'heygen_v3_direct', 'heygen_v3_translate', 'camera', 'ffmpeg', 'template', 'podcast_desk', 'podcast_copy']::text[]));
