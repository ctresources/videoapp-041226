-- Halo leads (2026-11-09, the owner's change): nothing is made on its own.
-- "Write it" writes the email and script ('written'); the agent edits the
-- script, then picks Avatar video, Me on camera or Email only.
alter table public.halo_leads drop constraint if exists halo_leads_status_check;
alter table public.halo_leads add constraint halo_leads_status_check
  check (status in ('new', 'writing', 'written', 'making', 'camera', 'ready', 'sending', 'sent', 'skipped', 'failed'));
