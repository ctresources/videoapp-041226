-- Two photos and two Digital Twins (2026-10-29, the owner's mockup).
--
-- photo_tall_url / photo_wide_url: the agent's vertical and horizontal photos.
-- The 9:16 look is built from the vertical one and the 16:9 look from the
-- horizontal one; an empty slot falls back to the other photo, filled to
-- shape as before. avatar_url stays the main photo (vertical if there is one)
-- for everything else that shows the agent's face.
--
-- heygen_twin2_*: a second Digital Twin, for the other shape (paid plans).
-- twin2_upright is measured from its training clip like twin_upright;
-- twin2_consent_needed is its own one-time approval.
--
-- Free plan: one photo and one twin, in the shape the agent picks (enforced
-- in /api/profile/photo and /api/avatar/digital-twin).
alter table public.profiles
  add column if not exists photo_tall_url text,
  add column if not exists photo_wide_url text,
  add column if not exists heygen_twin2_group_id text,
  add column if not exists heygen_twin2_look_id text,
  add column if not exists twin2_upright boolean,
  add column if not exists twin2_consent_needed boolean not null default false;

-- Existing headshots become the vertical photo (headshots are taken upright).
update public.profiles set photo_tall_url = avatar_url
where photo_tall_url is null and avatar_url is not null and heygen_photo_id is not null;
