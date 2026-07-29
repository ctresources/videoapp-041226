-- Waitlist for people who arrive after the 100 beta spots are gone.
CREATE TABLE IF NOT EXISTS public.beta_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  full_name   TEXT,
  source      TEXT,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One entry per person; a repeat submit updates rather than duplicates.
-- A plain constraint (not a lower(email) functional index) because the API
-- lowercases before writing, and PostgREST's upsert can only name a real
-- constraint as its ON CONFLICT target.
ALTER TABLE public.beta_waitlist
  DROP CONSTRAINT IF EXISTS beta_waitlist_email_unique;
ALTER TABLE public.beta_waitlist
  ADD CONSTRAINT beta_waitlist_email_unique UNIQUE (email);

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all writes go through the service-role
-- client in the API route, and only admins may read.
DROP POLICY IF EXISTS "admins read waitlist" ON public.beta_waitlist;
CREATE POLICY "admins read waitlist" ON public.beta_waitlist
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
