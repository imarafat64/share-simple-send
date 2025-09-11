-- Fix the search_path security issue for the generate_batch_id function
CREATE OR REPLACE FUNCTION generate_batch_id() RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  RETURN gen_random_uuid();
END;
$$;