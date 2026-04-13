-- =====================================================
-- MIGRATION 005: Blotato Integration
-- Adds Blotato API key + ElevenLabs voice ID to profiles
-- Drops social_accounts table (Blotato manages OAuth now)
-- Run in Supabase SQL Editor
-- =====================================================

-- Add new columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS blotato_api_key TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;

-- social_accounts no longer needed — Blotato manages OAuth
-- Drop table if it was created in migration 004
-- (Safe to run even if it doesn't exist)
DROP TABLE IF EXISTS social_accounts CASCADE;

-- scheduled_posts no longer needed — Blotato manages scheduling
DROP TABLE IF EXISTS scheduled_posts CASCADE;

-- social_posts: keep for audit log but remove token-based columns
-- (already has the right shape from migration 004)
