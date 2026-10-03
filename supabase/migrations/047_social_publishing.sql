-- Publishing to platforms beyond YouTube, through Upload-Post.
--
-- One Upload-Post "profile" holds all of one customer's connected networks.
-- The profile's name is derived from the user's id in code (see
-- profileUsername in lib/api/upload-post.ts) and is never read from the
-- database: profiles is writable by its owner, so a stored name would let a
-- user point their posts at someone else's accounts. This column only records
-- THAT a profile exists and when, so a user who never connected anything costs
-- no API call and no slot.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_profile_created_at timestamptz;

-- Posts to these platforms are handed off and finish later, so a row is
-- written as "posting" and settled when the result arrives. The request id is
-- what ties the result back to its rows; the link is what the app shows once
-- the post is live.
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS upload_request_id text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS post_url text;

CREATE INDEX IF NOT EXISTS social_posts_upload_request_id_idx
  ON social_posts (upload_request_id)
  WHERE upload_request_id IS NOT NULL;
