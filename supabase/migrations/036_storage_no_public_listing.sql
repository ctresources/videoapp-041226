-- Stop anonymous clients enumerating every file in the public buckets.
--
-- "Assets are public" and friends granted SELECT on storage.objects to role
-- public, which includes anon. That is the list() permission, not the
-- read-a-file permission: a public bucket serves /object/public/... without
-- consulting RLS at all. So these policies never made playback work — they
-- only made the file list readable by anyone, signed in or not.
--
-- That mattered because camera recordings live in `assets` under
-- camera-recordings/<user id>/, so anyone could enumerate every user's
-- recordings and then fetch them by their public URL. Being hard to guess was
-- the only thing protecting them, and a listing endpoint removes the guessing.
--
-- Dropped, not narrowed: nothing in the app lists storage with the anon key.
-- Every client call is upload, uploadToSignedUrl or getPublicUrl; every read
-- is either a public URL (RLS is not involved) or the service role (which
-- bypasses RLS), including the object-exists check the upload recovery route
-- depends on.
--
-- "Public read avatars" was an exact duplicate of "Avatars are public".
-- "Thumbnails are publicly readable" named a bucket that holds nothing.
--
-- Left alone: "Users read own recordings" on voice-recordings. That bucket is
-- private, so that policy is the read path rather than a listing leak, and it
-- is already scoped to the owner's own folder.
--
-- This does not make the recordings private — their URLs are still public to
-- anyone holding one. It removes the directory, not the door.
--
-- Applied to production 2026-09-13 as migration "storage_no_public_listing".

DROP POLICY IF EXISTS "Assets are public" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are public" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Videos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Thumbnails are publicly readable" ON storage.objects;
