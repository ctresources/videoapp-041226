-- 056: sending a seller update through BoldTrail (2026-10-15)
--
-- seller_listings.boldtrail_contacts   the sellers' BoldTrail contacts, added
--                                      once per listing by exact email:
--                                      [{ id, name, email }]
-- seller_listing_updates.sent_at/sent_to  when the update went out through
--                                      BoldTrail, and to whom (with whether a
--                                      text went too)

alter table public.seller_listings
  add column if not exists boldtrail_contacts jsonb not null default '[]'::jsonb;

alter table public.seller_listing_updates
  add column if not exists sent_at timestamptz,
  add column if not exists sent_to jsonb;
