-- Clarity failures (2026-11-22, the owner's ask: "how will I know if Clarity
-- fails?"). The daily job saved nothing for 10 days and only the server log
-- knew why. A failed morning is now saved as a row with no data and the
-- reason, and the Monday watch email counts them.
alter table public.clarity_snapshots
  alter column data drop not null,
  add column if not exists error text;
