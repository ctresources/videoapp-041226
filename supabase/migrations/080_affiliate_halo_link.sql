-- An affiliate's own Halo affiliate link (2026-10-24, the owner's ask).
-- Agents they referred to SparkReels get it on their "Get Halo" button;
-- everyone else gets the owner's. Either a Halo page address
-- (https://halo-name.huzi.site/) or just a code (texted to Halo as "CODE PRO").
-- Saved through /api/affiliate/halo-link (service role); affiliates can
-- already read their own row.
alter table public.affiliates
  add column if not exists halo_link text
    check (halo_link is null or char_length(halo_link) between 3 and 200);
