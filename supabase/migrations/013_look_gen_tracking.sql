-- Track per-user look generation per calendar month.
-- look_gen_period stores "YYYY-MM"; resets automatically when a new month begins.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS look_gen_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS look_gen_period TEXT    NOT NULL DEFAULT '';
