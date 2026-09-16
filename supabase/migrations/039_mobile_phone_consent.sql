-- 039: the agent's own mobile number, and dated consent to be texted on it
--
-- profiles.phone already exists and is NOT this: it is the number printed on
-- the closing card of every video, so it is often an office or team line and
-- is chosen to be published. Overwriting it with a personal mobile would
-- silently change what appears on an agent's finished videos.
--
-- Consent is stored as a TIMESTAMP, not a boolean, because US telemarketing
-- rules ask for proof of when express written consent was given, and a boolean
-- cannot answer that. NULL means no consent: the number may be used to reach
-- the agent about their own account, never for promotional texts.
--
-- sms_consent_source records which screen collected it (register, onboarding,
-- settings), so a later dispute can be traced to the wording actually shown.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT;

COMMENT ON COLUMN public.profiles.mobile_phone IS
  'The agent''s own mobile. Separate from phone, which is published on video closing cards.';
COMMENT ON COLUMN public.profiles.sms_consent_at IS
  'When the agent agreed to receive texts. NULL means no consent — account-related contact only.';
COMMENT ON COLUMN public.profiles.sms_consent_source IS
  'Which screen captured the consent: register, onboarding or settings.';
