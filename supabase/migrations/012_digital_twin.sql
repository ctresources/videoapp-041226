-- Add Digital Twin avatar columns to profiles.
-- heygen_digital_twin_group_id: the avatar group returned by POST /v3/avatars (type:digital_twin)
-- heygen_digital_twin_look_id:  the specific look (avatar_item.id) within that group

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS heygen_digital_twin_group_id TEXT,
  ADD COLUMN IF NOT EXISTS heygen_digital_twin_look_id  TEXT;
