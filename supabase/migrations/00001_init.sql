-- ============================================================
-- VoiceToVideos.AI - Database Schema
-- ============================================================

-- PROFILES (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT,
  avatar_url        TEXT,
  company_name      TEXT,
  phone             TEXT,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  onboarding_done   BOOLEAN NOT NULL DEFAULT false,
  voice_clone_id    TEXT,
  heygen_photo_id   TEXT,            -- HeyGen Talking Photo ID (cached after first upload)
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'agency')),
  credits_remaining INTEGER NOT NULL DEFAULT 100,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VOICE RECORDINGS
CREATE TABLE IF NOT EXISTS public.voice_recordings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT,
  audio_url        TEXT NOT NULL,
  transcript       TEXT,
  duration_seconds INTEGER,
  status           TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','transcribing','transcribed','processing','error')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  voice_recording_id   UUID REFERENCES public.voice_recordings(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  project_type         TEXT NOT NULL DEFAULT 'blog_video' CHECK (project_type IN ('blog_video','short_form','carousel')),
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','ready','posted','error')),
  ai_script            JSONB,
  seo_data             JSONB,
  thumbnail_url        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GENERATED VIDEOS
CREATE TABLE IF NOT EXISTS public.generated_videos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url        TEXT,
  video_type       TEXT NOT NULL DEFAULT 'blog_long' CHECK (video_type IN ('blog_long','reel_9x16','short_1x1','youtube_16x9')),
  duration_seconds INTEGER,
  render_provider  TEXT NOT NULL DEFAULT 'creatomate' CHECK (render_provider IN ('creatomate','heygen')),
  render_job_id    TEXT,
  render_status    TEXT NOT NULL DEFAULT 'pending' CHECK (render_status IN ('pending','rendering','completed','failed')),
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOCIAL ACCOUNTS
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook','linkedin','x')),
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  platform_user_id  TEXT,
  platform_username TEXT,
  token_expires_at  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOCIAL POSTS
CREATE TABLE IF NOT EXISTS public.social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id            UUID NOT NULL REFERENCES public.generated_videos(id) ON DELETE CASCADE,
  social_account_id   UUID NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  post_status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (post_status IN ('scheduled','posting','posted','failed')),
  scheduled_at        TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,
  platform_post_id    TEXT,
  caption             TEXT,
  hashtags            TEXT[],
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API USAGE LOG
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_provider    TEXT NOT NULL,
  endpoint        TEXT,
  credits_used    INTEGER NOT NULL DEFAULT 1,
  response_status INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins update all profiles" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- VOICE RECORDINGS policies
CREATE POLICY "Users manage own recordings" ON public.voice_recordings FOR ALL USING (auth.uid() = user_id);

-- PROJECTS policies
CREATE POLICY "Users manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id);

-- GENERATED VIDEOS policies
CREATE POLICY "Users manage own videos" ON public.generated_videos FOR ALL USING (auth.uid() = user_id);

-- SOCIAL ACCOUNTS policies
CREATE POLICY "Users manage own social accounts" ON public.social_accounts FOR ALL USING (auth.uid() = user_id);

-- SOCIAL POSTS policies
CREATE POLICY "Users manage own posts" ON public.social_posts FOR ALL USING (auth.uid() = user_id);

-- API USAGE LOG policies
CREATE POLICY "Users read own usage" ON public.api_usage_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role insert usage" ON public.api_usage_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- STORAGE BUCKETS (run in Supabase Dashboard or via CLI)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('voice-recordings', 'voice-recordings', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('generated-videos', 'generated-videos', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true);
