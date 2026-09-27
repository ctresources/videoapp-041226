-- 046: actually remove handle_new_user's RPC endpoint
--
-- 045 revoked EXECUTE from anon and authenticated and changed nothing, because
-- Postgres grants EXECUTE on a new function to PUBLIC, and both roles inherit
-- it there. Revoking from named roles while PUBLIC still holds the grant is the
-- kind of fix that looks done and is not — checked after applying, which is the
-- only reason it was caught.
--
-- Nothing loses anything: a trigger function is executed by the trigger
-- mechanism as the table owner, which does not consult EXECUTE grants, and the
-- owner keeps its own rights regardless. No application code calls this.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
