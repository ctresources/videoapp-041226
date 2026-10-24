-- Forwarded emails become drafts (2026-10-24, the owner's ask): an email
-- forwarded to the agent's import address is written as a video draft in the
-- same AutoSparks list as Halo drafts, with the same setup row and
-- Approve-and-post. Not one of the month's Halo videos.
ALTER TABLE public.autopilot_drafts DROP CONSTRAINT IF EXISTS autopilot_drafts_source_check;
ALTER TABLE public.autopilot_drafts ADD CONSTRAINT autopilot_drafts_source_check
  CHECK (source IN ('autosparks', 'halo', 'halo_promo', 'email'));

ALTER TABLE public.autopilot_drafts
  ADD COLUMN IF NOT EXISTS email_import_id UUID REFERENCES public.email_imports(id) ON DELETE SET NULL;
