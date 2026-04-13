-- =====================================================
-- MIGRATION 006: Language Support + Listing Video Type
-- Run in Supabase SQL Editor
-- =====================================================

-- Add preferred_language to profiles (default English)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

-- Extend project_type to include listing_video
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN ('blog_video', 'short_form', 'carousel', 'listing_video', 'trending'));

-- Listing data storage (photos, address, details scraped from MLS URL)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS listing_data JSONB;

-- Add city/state/zip to projects for location-based videos
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS location_city  TEXT,
  ADD COLUMN IF NOT EXISTS location_state TEXT,
  ADD COLUMN IF NOT EXISTS location_zip   TEXT;

-- Analytics: track video performance
CREATE TABLE IF NOT EXISTS public.video_analytics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id     UUID NOT NULL REFERENCES public.generated_videos(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform     TEXT,
  views        INTEGER NOT NULL DEFAULT 0,
  likes        INTEGER NOT NULL DEFAULT 0,
  comments     INTEGER NOT NULL DEFAULT 0,
  shares       INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.video_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own analytics" ON public.video_analytics
  FOR ALL USING (auth.uid() = user_id);

-- CRM Webhooks: user-configured webhook endpoints
CREATE TABLE IF NOT EXISTS public.crm_webhooks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  events       TEXT[] NOT NULL DEFAULT ARRAY['video.published'],
  secret       TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own webhooks" ON public.crm_webhooks
  FOR ALL USING (auth.uid() = user_id);

-- Fix social_posts: make social_account_id nullable (social_accounts was dropped in 005)
ALTER TABLE public.social_posts
  ALTER COLUMN social_account_id DROP NOT NULL;
