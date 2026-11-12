-- Halo leads (2026-11-11, the owner's approved mockup): "Saved video" sends
-- one of the agent's finished videos instead of making a new one.
alter table public.halo_leads drop constraint if exists halo_leads_mode_check;
alter table public.halo_leads add constraint halo_leads_mode_check
  check (mode in ('video', 'camera', 'email', 'saved'));
