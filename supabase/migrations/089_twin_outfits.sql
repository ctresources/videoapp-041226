-- Digital Twin outfits (2026-10-28).
-- The look ids of AI outfits made from the agent's Digital Twin. HeyGen puts
-- them in the twin's own group and animates them with the twin's motion, so
-- the app treats them as the twin (approval, paid Avatar video, horizontal
-- backgrounds). Written only by the server (/api/avatar/generate-look): a user
-- who could add ids here could have any look treated as their twin, so it is
-- added to protect_profile_privileges below.
alter table public.profiles
  add column if not exists twin_outfit_look_ids text[] not null default '{}';

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    OR NEW.plan_bundle IS DISTINCT FROM OLD.plan_bundle
    OR NEW.twin_outfit_look_ids IS DISTINCT FROM OLD.twin_outfit_look_ids
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
    OR NEW.plan_bundle IS NOT NULL
    OR COALESCE(array_length(NEW.twin_outfit_look_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Not allowed to set account privileges' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
