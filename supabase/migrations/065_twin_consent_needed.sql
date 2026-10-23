-- Set when HeyGen refuses a render with avatar_consent_required for the
-- account's Digital Twin (2026-10-23). The twin's look reads "completed", so
-- Settings could not tell that approval was still owed; this flag makes it
-- show the Approve My Digital Twin card. Cleared when a twin render is accepted.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS twin_consent_needed BOOLEAN NOT NULL DEFAULT FALSE;
