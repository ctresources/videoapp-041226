-- Weekly Autopilot, step 1 (2026-10-21): SparkReels drafts 3 posts a week for
-- paid accounts; the agent approves, changes or skips each one. Drafts are
-- ordinary projects (script + blog + metadata); this table is the week's list.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.autopilot_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The Monday of the week it is for, in the agent's time zone.
  week_of     DATE NOT NULL,
  -- When it is meant to go out; scheduling itself is step 2.
  slot_at     TIMESTAMPTZ NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('video', 'blog')),
  topic       TEXT NOT NULL,
  reason      TEXT,
  -- True for drafts the agent asked for ("Ask for ideas"), not the Sunday run.
  requested   BOOLEAN NOT NULL DEFAULT FALSE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'writing'
              CHECK (status IN ('writing', 'draft', 'approved', 'skipped', 'failed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autopilot_drafts_user_week ON public.autopilot_drafts (user_id, week_of);

ALTER TABLE public.autopilot_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own drafts: read"   ON public.autopilot_drafts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own drafts: decide" ON public.autopilot_drafts FOR UPDATE USING (auth.uid() = user_id);

-- Supabase stops granting new tables automatically from 2026-10-30.
GRANT SELECT, UPDATE ON public.autopilot_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_drafts TO service_role;
