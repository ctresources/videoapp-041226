-- Follow-up emails to free accounts that haven't made their free video yet
-- (2026-10-23, the owner's ask). The owner sends each one herself from the
-- Admin panel; these stamp when each went out. The unsubscribe link in the
-- email carries followup_token and sets followup_opt_out_at.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followup1_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup2_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup3_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_token      UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_followup_token_idx ON public.profiles (followup_token);
