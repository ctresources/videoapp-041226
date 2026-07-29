-- Make account deletion complete in one step.
--
-- profiles.id had NO foreign key to auth.users, so removing an account meant
-- deleting from both tables by hand. Miss one and you get a broken half-state:
-- an auth user with no profile can still sign in, and handle_new_user() only
-- fires on INSERT so nothing rebuilds the missing row.

-- 1. Deleting the auth user now removes the profile, and every table that
--    already cascades off profiles follows automatically.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- 2. affiliates.reviewed_by was NO ACTION, which would have BLOCKED deleting
--    any admin who had ever reviewed an application. The review record should
--    outlive the reviewer's account, so null the pointer instead.
ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_reviewed_by_fkey;

ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles (id) ON DELETE SET NULL;

-- 3. scheduled_posts.user_id had no foreign key at all, so scheduled posts
--    would have been left behind pointing at a deleted account.
ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_user_id_fkey;

ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
