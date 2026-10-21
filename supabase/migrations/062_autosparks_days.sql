-- AutoSparks: each agent picks the days and time the week's drafts are set
-- for (2026-10-21, the owner's ask). Days are 0 = Sunday … 6 = Saturday, as
-- JavaScript counts them; the starting choice is Tuesday, Thursday, Saturday.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS autopilot_days SMALLINT[] NOT NULL DEFAULT '{2,4,6}',
  ADD COLUMN IF NOT EXISTS autopilot_time TEXT NOT NULL DEFAULT '09:00'
    CHECK (autopilot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
