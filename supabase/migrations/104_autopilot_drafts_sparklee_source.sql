-- Sparklee drafts (2026-11-10): Make draft on Feature videos, Make it and
-- approved Home plans save drafts with source 'sparklee', which the check
-- never allowed, so every one of them failed to save.
ALTER TABLE public.autopilot_drafts DROP CONSTRAINT IF EXISTS autopilot_drafts_source_check;
ALTER TABLE public.autopilot_drafts ADD CONSTRAINT autopilot_drafts_source_check
  CHECK (source = ANY (ARRAY['autosparks'::text, 'halo'::text, 'halo_promo'::text, 'email'::text, 'sparklee'::text]));
