-- Account privileges are the server's to change, not the browser's
-- (2026-10-23). "Users update own profile" lets a signed-in user edit their
-- own row so the app can save a name or a city, but nothing stopped the same
-- call from setting role = 'admin', a paid plan or 999 videos. This trigger
-- refuses those columns unless the change comes from the server (service
-- role), the database itself, or an admin.
--
-- SECURITY INVOKER on purpose: current_user must be the real caller
-- ('authenticated' from a browser, 'service_role' from the server).
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.role IS DISTINCT FROM OLD.role
    OR NEW.suspended IS DISTINCT FROM OLD.suspended
    OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
    OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
    OR NEW.credits_remaining IS DISTINCT FROM OLD.credits_remaining
    OR NEW.long_credits_remaining IS DISTINCT FROM OLD.long_credits_remaining
    OR NEW.purchased_short_videos IS DISTINCT FROM OLD.purchased_short_videos
    OR NEW.purchased_long_videos IS DISTINCT FROM OLD.purchased_long_videos
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
    OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
    OR NEW.first_video_generated_at IS DISTINCT FROM OLD.first_video_generated_at
    OR NEW.look_gen_count IS DISTINCT FROM OLD.look_gen_count
    OR NEW.look_gen_period IS DISTINCT FROM OLD.look_gen_period
  ) THEN
    RAISE EXCEPTION 'Not allowed to change account privileges' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND (
       COALESCE(NEW.role, 'user') <> 'user'
    OR COALESCE(NEW.suspended, FALSE)
    OR COALESCE(NEW.subscription_tier, 'free') <> 'free'
    OR COALESCE(NEW.purchased_short_videos, 0) > 0
    OR COALESCE(NEW.purchased_long_videos, 0) > 0
    OR NEW.stripe_customer_id IS NOT NULL
    OR NEW.stripe_subscription_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Not allowed to set account privileges' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
