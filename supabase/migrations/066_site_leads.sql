-- Leads from the home page's "What buyers in your area ask AI" box
-- (2026-10-23, the owner's ask). Server-only: written and read with the
-- service role; nothing here is readable from the browser.
CREATE TABLE IF NOT EXISTS public.site_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  city        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'home_ai_questions',
  -- The questions and answers they were shown.
  questions   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- A one-way hash of the visitor's IP, only to slow down abuse.
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_leads_email_time ON public.site_leads (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_leads_ip_time ON public.site_leads (ip_hash, created_at DESC);

ALTER TABLE public.site_leads ENABLE ROW LEVEL SECURITY;
-- No policies: the browser can neither read nor write it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_leads TO service_role;
