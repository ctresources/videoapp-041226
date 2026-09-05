-- Blotato is out.
--
-- The integration was built but never configured by anyone — verified against
-- the live database on 2026-09-04, zero profiles held a key — and the owner
-- has settled on Upload-Post instead and confirmed Blotato will not be
-- connected. So every Blotato branch in the app was unreachable code sitting
-- in the path of the integration that IS being built.
--
-- Removed alongside this migration: lib/api/blotato.ts, the posting branch in
-- /api/social/post (also the source of the "Published to 3 platforms"
-- overcount, since it returned one result covering every target), the account
-- listing and key-management handlers in /api/social/accounts, and the
-- Blotato half of /api/social/schedule.

ALTER TABLE profiles DROP COLUMN IF EXISTS blotato_api_key;
