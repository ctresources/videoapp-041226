-- Deleting a video no longer erases the record that it was published.
--
-- social_posts.video_id was NOT NULL with ON DELETE CASCADE, so tidying up My
-- Videos took the publish log with it: Analytics' "Posts Published" dropped
-- while the videos were still live on YouTube, and the delete dialog said only
-- "This action cannot be undone" — never that it would rewrite your history.
--
-- The row now survives with video_id set to NULL. video_title is a snapshot
-- taken at publish time, because a row pointing at nothing is unreadable —
-- the title is the only thing that says what was posted.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS video_title TEXT;

-- Existing rows get a title from the project they still point at, so history
-- that predates this is readable too.
UPDATE social_posts sp
SET video_title = COALESCE(p.title, 'Untitled video')
FROM generated_videos gv
LEFT JOIN projects p ON p.id = gv.project_id
WHERE sp.video_id = gv.id
  AND sp.video_title IS NULL;

ALTER TABLE social_posts ALTER COLUMN video_id DROP NOT NULL;

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_video_id_fkey;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_video_id_fkey
  FOREIGN KEY (video_id) REFERENCES generated_videos(id) ON DELETE SET NULL;
