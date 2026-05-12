-- =====================================================
-- MIGRATION 009: Native YouTube OAuth tokens
-- Stores per-user YouTube OAuth tokens in profiles so
-- videos can be uploaded directly via YouTube Data API v3
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS youtube_access_token      TEXT,
  ADD COLUMN IF NOT EXISTS youtube_refresh_token     TEXT,
  ADD COLUMN IF NOT EXISTS youtube_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS youtube_channel_id        TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_name      TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_thumbnail TEXT;
