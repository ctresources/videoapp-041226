-- The agent's brand colours (2026-10-25): up to three hex colours, set in
-- Settings. Offered first in the thumbnail editor and used as the palette
-- for AI backgrounds, so each agent's images look like their own.
alter table public.profiles
  add column if not exists brand_colors text[] not null default '{}'::text[];
