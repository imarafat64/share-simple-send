-- Ensure the handle_new_user trigger function can insert into profiles under RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Create the trigger to populate profiles on new auth user creation (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;

-- Add an RLS policy to allow the auth admin role (used during signup) to insert profiles via the trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Allow auth admin to insert profiles'
  ) THEN
    CREATE POLICY "Allow auth admin to insert profiles"
    ON public.profiles
    FOR INSERT
    TO supabase_auth_admin
    WITH CHECK (true);
  END IF;
END $$;
