-- Digital Twin backgrounds (2026-10-24, the owner's mockup).
--
-- A Digital Twin is filmed upright, so a horizontal twin video was made as
-- Avatar in circle. HeyGen can remove the twin's own background and place
-- them on another (tested 2026-10-24), so a horizontal twin video can now be
-- the agent full size on a background: one they described (an AI picture),
-- their town, a listing's front photo, or a color.

-- The agent's saved backgrounds. Each is kept in both shapes.
CREATE TABLE IF NOT EXISTS public.twin_backgrounds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('described', 'town', 'listing')),
  prompt      TEXT,
  wide_url    TEXT NOT NULL,
  tall_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_twin_backgrounds_user ON public.twin_backgrounds (user_id, created_at DESC);

ALTER TABLE public.twin_backgrounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own twin backgrounds: read" ON public.twin_backgrounds FOR SELECT USING (auth.uid() = user_id);
-- Supabase stops granting new tables automatically from 2026-10-30.
-- Writes go through /api/avatar/twin-backgrounds (service role).
GRANT SELECT ON public.twin_backgrounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.twin_backgrounds TO service_role;

-- What a horizontal twin video does when "Avatar video" is chosen:
-- 'background' (full size on a background, new) or 'circle' (as before).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS twin_wide_mode TEXT NOT NULL DEFAULT 'background'
    CHECK (twin_wide_mode IN ('background', 'circle')),
  -- The default background: {"type":"saved","id":…} or {"type":"color","value":"#E9E3D6"}.
  -- Null means the studio color #E9E3D6.
  ADD COLUMN IF NOT EXISTS twin_default_bg JSONB;
