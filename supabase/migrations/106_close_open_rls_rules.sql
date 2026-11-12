-- Two rules that were open to anyone, logged in or not (2026-11-12 security check).
--
-- beta_invites: "Public can read unused invites" let anyone list every unused
-- invite code and its free videos. Codes are checked on the server
-- (/api/auth/apply-invite-code, admin access), so nothing needs to read them
-- from the browser.
drop policy if exists "Public can read unused invites" on public.beta_invites;

-- api_usage_log: "Service role insert usage" was written for the server but
-- applied to everyone (WITH CHECK true), so anyone could add fake cost rows.
-- Every write goes through the admin client, which ignores these rules.
drop policy if exists "Service role insert usage" on public.api_usage_log;
