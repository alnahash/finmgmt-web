-- Auto-create a profiles row when a new auth user is inserted.
--
-- Why: With email confirmation enabled, supabase.auth.signUp() returns a user
-- but no session. A client-side INSERT into profiles is then blocked by RLS
-- (auth.uid() is NULL), so verified users end up with no profile row and the
-- app signs them out on every page that queries profiles.
--
-- A SECURITY DEFINER trigger bypasses RLS and reliably creates the profile
-- regardless of confirmation flow.

-- 1. Trigger function: insert a profile row for every new auth.users row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, onboarded)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Drop existing trigger if present, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill: create a profile for any existing auth user that has none
--    (e.g. test user "Alex" who signed up before this fix).
INSERT INTO public.profiles (id, full_name, email, onboarded)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  u.email,
  FALSE
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
