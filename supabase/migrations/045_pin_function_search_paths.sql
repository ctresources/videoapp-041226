-- 045: pin every function's search_path, and stop handle_new_user being callable
--
-- A function without an explicit search_path resolves unqualified names against
-- whatever the caller's search_path happens to be. For the four plain trigger
-- functions below that is hardening rather than a hole — they are SECURITY
-- INVOKER, so they carry no privilege of their own.
--
-- handle_new_user is the one that matters. It is SECURITY DEFINER and writes to
-- public.profiles with the definer's rights, and it was reachable by anon and
-- authenticated through PostgREST's RPC endpoint. Its body is schema-qualified,
-- so it is not exploitable as written; the point is that it should not depend on
-- staying that way.
--
-- pg_temp last, per Postgres' own guidance: a temporary schema a caller controls
-- must never be searched before the schemas the function means.

ALTER FUNCTION public.handle_new_user()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()                    SET search_path = public, pg_temp;
ALTER FUNCTION public.stamp_render_finished_at()          SET search_path = public, pg_temp;
ALTER FUNCTION public.update_social_accounts_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.canonical_email(text)               SET search_path = public, pg_temp;

-- The trigger keeps working: a trigger function is executed by the trigger
-- mechanism as the table owner, not through the calling role's EXECUTE grant.
-- Nothing in the app calls this over RPC, and calling a trigger function
-- directly errors anyway — this removes the endpoint rather than the ability.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- get_my_role is deliberately untouched. It already pins its search_path, it
-- returns only the caller's own role, and it is used inside the profiles admin
-- policies — policy expressions are evaluated as the querying role, so revoking
-- EXECUTE here would break admin access to profiles rather than tighten it.
