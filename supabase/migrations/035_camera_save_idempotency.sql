-- Idempotent camera saves, so retrying an upload cannot duplicate a video.
--
-- A camera take is now held on the recording device until the server confirms
-- it has been saved, and offered back if it was not. Retrying used to replay
-- the whole save: another row in generated_videos, often another project, and
-- another copy of the file in storage. The recorder now sends a recovery id
-- with every attempt for the same recording, and this column is where it
-- lands, so a second attempt returns the first attempt's row instead of
-- inserting a second one.
--
-- Nullable, and unique only among rows that have one: every video made any
-- other way, and every camera recording saved before today, keeps NULL here
-- and is untouched. Scoped by user as well as key so two people's recovery
-- ids can never collide with each other.
--
-- Applied to production 2026-09-11 as migration "camera_save_idempotency".

ALTER TABLE public.generated_videos
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_videos_idempotency
  ON public.generated_videos(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
