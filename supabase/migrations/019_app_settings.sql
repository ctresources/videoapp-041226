-- Small key/value store for one-off operational flags. First use: remembering
-- that a beta-capacity warning has already been emailed, so the owner gets one
-- alert rather than one per signup.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Service-role only for writes; admins may read.
DROP POLICY IF EXISTS "admins read app_settings" ON public.app_settings;
CREATE POLICY "admins read app_settings" ON public.app_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
