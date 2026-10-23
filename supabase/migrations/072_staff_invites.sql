-- Pre-approved Staff (2026-10-23, the owner's ask): an email set up as Staff
-- before its owner has signed up. The account becomes Staff the moment it is
-- created, but ONLY through Google sign-in, which proves the address belongs
-- to them; email/password accounts are confirmed automatically, so anyone who
-- knew the address could otherwise claim the role. Those stay ordinary
-- accounts for the owner to promote with Make Staff.
CREATE TABLE IF NOT EXISTS public.staff_invites (
  email       TEXT PRIMARY KEY,           -- lower-case
  video_cap   INTEGER NOT NULL DEFAULT 10,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at     TIMESTAMPTZ
);
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites TO service_role;

CREATE OR REPLACE FUNCTION public.apply_staff_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  provider TEXT;
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO inv FROM public.staff_invites WHERE email = lower(NEW.email) AND used_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT raw_app_meta_data->>'provider' INTO provider FROM auth.users WHERE id = NEW.id;
  IF provider = 'google' THEN
    NEW.role := 'staff';
    NEW.staff_video_cap := inv.video_cap;
    UPDATE public.staff_invites SET used_at = now() WHERE email = inv.email;
  END IF;
  RETURN NEW;
END;
$$;

-- Named to run before protect_profile_privileges (triggers fire by name).
DROP TRIGGER IF EXISTS apply_staff_invite ON public.profiles;
CREATE TRIGGER apply_staff_invite
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.apply_staff_invite();

INSERT INTO public.staff_invites (email, video_cap)
VALUES ('belizon.neilbryan13@gmail.com', 10)
ON CONFLICT (email) DO NOTHING;
