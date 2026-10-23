-- The welcome email to a new paying customer goes out once, ever
-- (2026-10-23): stamped by the Stripe webhook when it is sent, so a plan
-- change, a renewal or a later resubscription never sends it again.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;
