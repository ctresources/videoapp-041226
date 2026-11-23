-- Two plans (2026-11-22, the owner's approved pricing): Creator $99 and
-- Producer $149. Producer becomes 4 Full AI Avatar videos a month plus
-- unlimited AI Avatar in Circle videos (up to 1 a day), down from 7 videos.
--
-- Anyone already on Producer keeps their 7 for as long as they stay
-- subscribed: plan_videos_override is what a renewal refills instead of the
-- plan's number. Cleared when the subscription ends.
alter table public.profiles add column if not exists plan_videos_override int;

-- It sets how many videos a renewal gives, so the browser may never change it.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.get_my_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.role is distinct from old.role
    or new.suspended is distinct from old.suspended
    or new.subscription_tier is distinct from old.subscription_tier
    or new.subscription_status is distinct from old.subscription_status
    or new.credits_remaining is distinct from old.credits_remaining
    or new.long_credits_remaining is distinct from old.long_credits_remaining
    or new.purchased_short_videos is distinct from old.purchased_short_videos
    or new.purchased_long_videos is distinct from old.purchased_long_videos
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.current_period_end is distinct from old.current_period_end
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.first_video_generated_at is distinct from old.first_video_generated_at
    or new.look_gen_count is distinct from old.look_gen_count
    or new.look_gen_period is distinct from old.look_gen_period
    or new.staff_video_cap is distinct from old.staff_video_cap
    or new.plan_bundle is distinct from old.plan_bundle
    or new.twin_outfit_look_ids is distinct from old.twin_outfit_look_ids
    or new.staff_permissions is distinct from old.staff_permissions
    or new.plan_videos_override is distinct from old.plan_videos_override
  ) then
    raise exception 'Not allowed to change account privileges' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and (
       coalesce(new.role, 'user') <> 'user'
    or coalesce(new.suspended, false)
    or coalesce(new.subscription_tier, 'free') <> 'free'
    or coalesce(new.purchased_short_videos, 0) > 0
    or coalesce(new.purchased_long_videos, 0) > 0
    or new.stripe_customer_id is not null
    or new.stripe_subscription_id is not null
    or new.plan_bundle is not null
    or coalesce(array_length(new.twin_outfit_look_ids, 1), 0) > 0
    or new.staff_permissions is not null
    or new.plan_videos_override is not null
  ) then
    raise exception 'Not allowed to set account privileges' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- Current Producer subscribers keep 7.
update public.profiles
set plan_videos_override = 7
where subscription_tier = 'agent'
  and coalesce(role, 'user') = 'user'
  and stripe_subscription_id is not null;
