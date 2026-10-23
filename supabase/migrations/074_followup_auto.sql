-- Automatic free-video follow-ups for accounts created from now on
-- (2026-10-23, the owner's ask). Accounts that existed before this stay
-- manual (she sends theirs from the Admin panel); new ones get emails 1-3
-- on days 2, 5 and 10 from the daily free-followups cron.
-- Added as false so every existing row is manual, then the default flips.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS followup_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN followup_auto SET DEFAULT true;
