-- Text consent prompt (2026-11-22, the owner's approved mockup): existing
-- users who signed up before the consent box are asked once, at their next
-- sign-in. This records that they were asked (Save or Not now), so it never
-- shows twice. New signups get it set when they see the box at signup.
alter table public.profiles
  add column if not exists sms_prompted_at timestamptz;
