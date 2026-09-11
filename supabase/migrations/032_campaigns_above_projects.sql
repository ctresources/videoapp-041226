-- Campaigns: the folder above projects.
--
-- A campaign groups everything one piece of marketing produces: its blog
-- article, one or more projects and their videos, the social posts and their
-- schedule, and the CTA and its results. Additive only: nothing that exists
-- today reads any of this, so live pages are unaffected until the new calendar
-- (gated by feature_access) starts using it.
--
-- No status column on campaigns: a campaign's status is worked out from its
-- items, so it can never disagree with them.
--
-- Applied to production 2026-09-11 as migration "campaigns_above_projects".

-- ── campaigns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  -- The call to action and where it sends people.
  cta_text          TEXT,
  destination_url   TEXT,
  -- The blog article's publication record. The words stay on the source
  -- project's ai_script (blog_intro / blog_body / blog_conclusion), where the
  -- blog route already writes them. Publishing is manual for now: the user
  -- pastes the HTML into their site and records the URL here.
  blog_project_id   UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  blog_title        TEXT,
  blog_status       TEXT NOT NULL DEFAULT 'draft'
                    CHECK (blog_status IN ('draft', 'ready', 'scheduled_externally', 'published')),
  blog_planned_at   TIMESTAMPTZ,
  blog_published_at TIMESTAMPTZ,
  blog_platform     TEXT,
  blog_url          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.campaigns(user_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON public.campaigns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── projects: which campaign, and what role in it ────────────────────────────
-- Deleting a campaign leaves its projects in place, just unfiled.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS campaign_id   UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_role TEXT
    CHECK (campaign_role IN ('primary', 'short_variation', 'faq', 'teaser', 'follow_up'));

CREATE INDEX IF NOT EXISTS idx_projects_campaign ON public.projects(campaign_id);

-- ── social_posts: which campaign a post belongs to ───────────────────────────
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_campaign ON public.social_posts(campaign_id);

-- ── profiles: the user's time zone (IANA name, e.g. America/New_York) ───────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS time_zone TEXT;

-- ── feature_access: who can see a feature still being built ─────────────────
-- Its own table rather than a profiles column: users can update their own
-- profile row, so a flag there would be a switch anyone could flip. Users may
-- read their own grants; only the service role can write them.
CREATE TABLE IF NOT EXISTS public.feature_access (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);

ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own feature access" ON public.feature_access
  FOR SELECT USING (auth.uid() = user_id);

-- ── publish_jobs: the scheduling queue ───────────────────────────────────────
-- A scheduled post waits here, inside SparkReels, and is uploaded when due —
-- so rescheduling, editing and cancelling never touch a video already on the
-- platform, and need no broader platform permissions. "Publish now" is a job
-- due immediately.
CREATE TABLE IF NOT EXISTS public.publish_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  video_id          UUID REFERENCES public.generated_videos(id) ON DELETE SET NULL,
  platform          TEXT NOT NULL,
  -- What gets posted. Editable until the job starts uploading.
  title             TEXT,
  caption           TEXT,
  hashtags          TEXT[],
  options           JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at      TIMESTAMPTZ NOT NULL,          -- always stored as UTC
  time_zone         TEXT NOT NULL,                 -- the user's zone when scheduled, for display
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'uploading', 'processing', 'published', 'failed', 'cancelled')),
  attempts          INTEGER NOT NULL DEFAULT 0,    -- retry count
  last_error        TEXT,
  platform_response JSONB,
  -- One key per intended post: a worker that crashes mid-upload and retries
  -- cannot create a second copy of the same post.
  idempotency_key   TEXT NOT NULL UNIQUE,
  platform_post_id  TEXT,
  platform_url      TEXT,
  locked_at         TIMESTAMPTZ,                   -- claimed by a worker run
  started_at        TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_user ON public.publish_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_campaign ON public.publish_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_due ON public.publish_jobs(scheduled_at) WHERE status = 'scheduled';

-- Users may read their own jobs; creating and running them goes through the
-- server, which checks the video belongs to them before anything is uploaded.
ALTER TABLE public.publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own publish jobs" ON public.publish_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER set_publish_jobs_updated_at BEFORE UPDATE ON public.publish_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Backfill: every existing project becomes its own campaign ────────────────
-- The projects updated_at trigger is paused for this one statement. Filing a
-- project into a campaign is not an edit, and letting the trigger fire would
-- stamp all of them with today's date and reorder every My Videos list.
ALTER TABLE public.projects DISABLE TRIGGER set_projects_updated_at;

WITH made AS (
  INSERT INTO public.campaigns (user_id, name, blog_project_id, blog_title, blog_status, created_at, updated_at)
  SELECT p.user_id,
         p.title,
         p.id,
         COALESCE(NULLIF(p.ai_script->>'title', ''), p.title),
         CASE WHEN COALESCE(p.ai_script->>'blog_body', '') <> '' THEN 'ready' ELSE 'draft' END,
         p.created_at,
         p.updated_at
  FROM public.projects p
  WHERE p.campaign_id IS NULL
  RETURNING id, blog_project_id
)
UPDATE public.projects p
SET campaign_id = made.id, campaign_role = 'primary'
FROM made
WHERE p.id = made.blog_project_id;

ALTER TABLE public.projects ENABLE TRIGGER set_projects_updated_at;

-- Existing posts follow their video's project into its campaign.
UPDATE public.social_posts sp
SET campaign_id = p.campaign_id
FROM public.generated_videos gv
JOIN public.projects p ON p.id = gv.project_id
WHERE sp.video_id = gv.id
  AND sp.campaign_id IS NULL;
