-- Halo sites (2026-10-24, the owner's plan and mockup): SparkReels reads the
-- agent's Halo websites every morning, turns new posts into video drafts on
-- the AutoSparks page (up to 4 a month, one a week), and on Approve makes the
-- video and posts it on its day. Nothing is made or posted without Approve.

-- The agent's choices for Halo videos: page types, how many a month, the day
-- and time, look, avatar, size, accounts, captions and music. Read and written
-- only through /api/halo/settings, which checks every field.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS halo_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- One row per website the agent added.
CREATE TABLE IF NOT EXISTS public.halo_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The site's origin, e.g. https://carmellathompson.com
  url             TEXT NOT NULL,
  -- A Halo referral page (halo-<name>.huzi.site): promo videos only, never
  -- drafted from on a schedule.
  is_affiliate    BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS idx_halo_sites_user ON public.halo_sites (user_id);

-- Every page seen on those sites. The first look records what is already
-- there as "seen", so connecting never turns old posts into videos; only new
-- pages, and the watched pages that change (market report, events), become
-- "new" and can be drafted.
CREATE TABLE IF NOT EXISTS public.halo_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES public.halo_sites(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  -- blog, guides, events, market, neighborhoods, communities, relocation,
  -- dining, just_sold, other
  kind          TEXT NOT NULL,
  title         TEXT,
  published_on  DATE,
  image_url     TEXT,
  -- For the watched pages: what changed is judged by this.
  content_hash  TEXT,
  status        TEXT NOT NULL DEFAULT 'seen'
                CHECK (status IN ('seen', 'new', 'drafted', 'passed')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_at    TIMESTAMPTZ,
  UNIQUE (site_id, url)
);
CREATE INDEX IF NOT EXISTS idx_halo_pages_user_status ON public.halo_pages (user_id, status);

ALTER TABLE public.halo_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halo_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own Halo sites: read" ON public.halo_sites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own Halo pages: read" ON public.halo_pages FOR SELECT USING (auth.uid() = user_id);

-- Supabase stops granting new tables automatically from 2026-10-30.
-- Writes go through the API routes (service role); the page only reads.
GRANT SELECT ON public.halo_sites TO authenticated;
GRANT SELECT ON public.halo_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halo_sites TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halo_pages TO service_role;

-- Halo drafts live in the AutoSparks list, marked by where they came from.
ALTER TABLE public.autopilot_drafts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'autosparks'
    CHECK (source IN ('autosparks', 'halo', 'halo_promo')),
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT,
  ADD COLUMN IF NOT EXISTS halo_page_id UUID REFERENCES public.halo_pages(id) ON DELETE SET NULL,
  -- This video's own setup: look, avatar, size, picture, on screen, accounts,
  -- captions and music. Starts as the agent's Halo settings.
  ADD COLUMN IF NOT EXISTS setup JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES public.generated_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS post_error TEXT;

-- After Approve a Halo draft is made, then handed to the accounts:
-- "scheduled" until its time, "posted" once it is out.
ALTER TABLE public.autopilot_drafts DROP CONSTRAINT IF EXISTS autopilot_drafts_status_check;
ALTER TABLE public.autopilot_drafts ADD CONSTRAINT autopilot_drafts_status_check
  CHECK (status IN ('writing', 'draft', 'approved', 'scheduled', 'posted', 'skipped', 'failed'));

CREATE INDEX IF NOT EXISTS idx_autopilot_drafts_source ON public.autopilot_drafts (user_id, source, slot_at);

-- One live Halo draft per day slot, so the morning run and a fill after Skip
-- can never both take the same Wednesday.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_halo_draft_slot ON public.autopilot_drafts (user_id, slot_at)
  WHERE source = 'halo' AND status NOT IN ('skipped', 'failed');
