-- Spark Series: a folder above Sparks.
--
-- A Spark is one topic and its content; a Series is several related Sparks
-- that tell one story over time — a listing's coming soon, tour, open house,
-- price change and just sold. Additive only: nothing reads these until the
-- hidden Spark Calendar does.
--
-- The shared CTA and destination link are defaults a Spark inherits unless it
-- sets its own. When a Series is deleted, or a Spark leaves one, the API
-- copies the inherited values onto the Spark first, so nothing silently
-- disappears — the foreign keys below only clear the link.
--
-- Applied to production 2026-09-11 as migration "spark_series".

CREATE TABLE IF NOT EXISTS public.spark_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- Defaults for every Spark in the Series.
  cta_text        TEXT,
  destination_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spark_series_user ON public.spark_series(user_id);

ALTER TABLE public.spark_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own spark series" ON public.spark_series
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_spark_series_updated_at BEFORE UPDATE ON public.spark_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Which Series a Spark belongs to, and where it sits in the running order.
-- Deleting a Series leaves its Sparks in place, just unfiled.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS series_id       UUID REFERENCES public.spark_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_campaigns_series ON public.campaigns(series_id);
