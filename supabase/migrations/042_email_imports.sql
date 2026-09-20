-- 042: import an article by forwarding it to a private address
--
-- Each account gets its own address, import-<token>@in.sparkreels.ai. The
-- token, not the sender, decides whose account an email lands in: a forward
-- often arrives from a different address than the one the agent signs in
-- with (a work inbox, a team member), and a From header is trivially forged.
-- Minted lazily by /api/email/imports the first time the address is shown.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS import_token TEXT UNIQUE;

-- What was forwarded, already cleaned to article text. Kept 30 days — the
-- inbound webhook sweeps older rows on each delivery, so no cron is needed.
CREATE TABLE IF NOT EXISTS public.email_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Resend's id for the received email. Unique so a retried webhook is a no-op.
  provider_email_id TEXT NOT NULL UNIQUE,
  from_address TEXT,
  subject TEXT,
  body_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  -- Images from the email, already copied into our own storage.
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_imports_user ON public.email_imports(user_id, received_at DESC);

ALTER TABLE public.email_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own email imports" ON public.email_imports
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own email imports" ON public.email_imports
  FOR DELETE USING (auth.uid() = user_id);
