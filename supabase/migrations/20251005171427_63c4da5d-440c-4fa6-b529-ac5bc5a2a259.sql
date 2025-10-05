-- Create subscription status table
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_product_id TEXT,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro')),
  storage_used BIGINT NOT NULL DEFAULT 0,
  subscription_status TEXT,
  subscription_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view their own subscription"
ON public.user_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own subscription (for initial creation)
CREATE POLICY "Users can insert their own subscription"
ON public.user_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription
CREATE POLICY "Users can update their own subscription"
ON public.user_subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- Add password protection and expiration to files table
ALTER TABLE public.files
ADD COLUMN password_hash TEXT,
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster expiration queries
CREATE INDEX idx_files_expires_at ON public.files(expires_at) WHERE expires_at IS NOT NULL;

-- Create trigger to update user_subscriptions updated_at
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to initialize subscription for new users
CREATE OR REPLACE FUNCTION public.initialize_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_type)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger to initialize subscription when user signs up
CREATE TRIGGER on_user_created_init_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.initialize_user_subscription();

-- Function to calculate user's total storage
CREATE OR REPLACE FUNCTION public.calculate_user_storage(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(size), 0)
  FROM public.files
  WHERE user_id = p_user_id;
$$;

-- Function to get user's plan limits
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(p_user_id UUID)
RETURNS TABLE (
  plan_type TEXT,
  max_storage BIGINT,
  max_file_size BIGINT,
  retention_days INTEGER,
  has_password_protection BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_type TEXT;
BEGIN
  SELECT us.plan_type INTO v_plan_type
  FROM public.user_subscriptions us
  WHERE us.user_id = p_user_id;
  
  -- Default to free if no subscription found
  v_plan_type := COALESCE(v_plan_type, 'free');
  
  IF v_plan_type = 'pro' THEN
    RETURN QUERY SELECT
      'pro'::TEXT,
      107374182400::BIGINT, -- 100 GB
      2147483648::BIGINT, -- 2 GB
      30::INTEGER,
      TRUE::BOOLEAN;
  ELSE
    RETURN QUERY SELECT
      'free'::TEXT,
      5368709120::BIGINT, -- 5 GB
      524288000::BIGINT, -- 500 MB
      7::INTEGER,
      FALSE::BOOLEAN;
  END IF;
END;
$$;