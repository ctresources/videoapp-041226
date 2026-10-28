-- What's New unread dot (2026-10-28).
-- The id of the newest What's New item this account has seen
-- (lib/data/whats-new.ts). The menu shows a NEW dot while it differs from
-- the newest item. Not privileged: a user may set their own, so it is not
-- added to protect_profile_privileges (068).
alter table public.profiles add column if not exists last_seen_whats_new text;
