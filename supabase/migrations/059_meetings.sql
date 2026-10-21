-- Google Meet calls an agent schedules from SparkReels (2026-10-20).
--
-- SparkReels can't read the agent's Google Calendar (that would need a new
-- Google permission and another verification), so the details are entered in
-- SparkReels first: saved here for Spark Calendar, then handed to a prefilled
-- Google Calendar event that the agent saves and sends from Google.
CREATE TABLE IF NOT EXISTS public.meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_name   TEXT NOT NULL,
  client_email  TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  minutes       INTEGER NOT NULL DEFAULT 30 CHECK (minutes BETWEEN 5 AND 480),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_user_starts ON public.meetings (user_id, starts_at);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own meetings: read"   ON public.meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own meetings: add"    ON public.meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own meetings: remove" ON public.meetings FOR DELETE USING (auth.uid() = user_id);
