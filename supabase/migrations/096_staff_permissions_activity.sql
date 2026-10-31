-- Staff activity (2026-10-30, the owner's ask; Admin only).
-- 1. Per-person access for staff: publishing (off / approved accounts only /
--    any), emails on/off, AutoSparks approvals on/off. Only admins (or the
--    server) may change it, like role and the video cap.
-- 2. A light activity log for what isn't already recorded elsewhere: each
--    Spark Tools use, for everyone. Screen recordings are marked on the video.

alter table public.profiles add column if not exists staff_permissions jsonb;

create table if not exists public.activity_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_log_user_time on public.activity_log (user_id, created_at desc);
alter table public.activity_log enable row level security;
grant select, insert, delete on public.activity_log to service_role;
grant usage, select on sequence public.activity_log_id_seq to service_role;

-- staff_permissions joins the columns a user may never set on themselves.
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
  ) then
    raise exception 'Not allowed to set account privileges' using errcode = '42501';
  end if;

  return new;
end;
$function$;
