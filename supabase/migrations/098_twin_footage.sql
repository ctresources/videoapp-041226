-- Digital Twin in front of the video's own photos and footage (2026-10-31).
-- HeyGen returns the twin see-through and store-video lays them over the
-- b-roll. A third Wide videos choice, and where the twin stands by default.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_twin_wide_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_twin_wide_mode_check
    CHECK (twin_wide_mode IN ('background', 'circle', 'footage'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS twin_footage_layout TEXT NOT NULL DEFAULT 'side'
    CHECK (twin_footage_layout IN ('side', 'corner'));
