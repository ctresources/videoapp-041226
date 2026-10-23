-- Staff (2026-10-23, the owner's ask): an assistant's own account with an
-- admin's in-app perks (videos never charged, every feature unlocked) but no
-- Admin panel, and a monthly video cap so costs can't run away.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin', 'staff'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_video_cap INTEGER NOT NULL DEFAULT 10;

-- The cap is a privilege too: same protection as role and credits (068).
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
    OR NEW.staff_video_cap IS DISTINCT FROM OLD.staff_video_cap
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
