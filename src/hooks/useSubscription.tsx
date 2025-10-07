import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SubscriptionStatus {
  subscribed: boolean;
  planType: 'free' | 'pro';
  productId: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
}

export interface PlanLimits {
  maxStorage: number;
  maxFileSize: number;
  retentionDays: number;
  hasPasswordProtection: boolean;
}

export const PLAN_LIMITS: Record<'free' | 'pro', PlanLimits> = {
  free: {
    maxStorage: 5 * 1024 * 1024 * 1024, // 5 GB
    maxFileSize: 500 * 1024 * 1024, // 500 MB
    retentionDays: 7,
    hasPasswordProtection: false,
  },
  pro: {
    maxStorage: 100 * 1024 * 1024 * 1024, // 100 GB
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2 GB
    retentionDays: 30,
    hasPasswordProtection: true,
  },
};

export const useSubscription = () => {
  const [status, setStatus] = useState<SubscriptionStatus>({
    subscribed: false,
    planType: 'free',
    productId: null,
    subscriptionEnd: null,
    loading: true,
  });
  const { toast } = useToast();

  const checkSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ subscribed: false, planType: 'free', productId: null, subscriptionEnd: null, loading: false });
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setStatus({
        subscribed: data.subscribed,
        planType: data.plan_type || 'free',
        productId: data.product_id,
        subscriptionEnd: data.subscription_end,
        loading: false,
      });
    } catch (error) {
      console.error('Error checking subscription:', error);
      setStatus({ subscribed: false, planType: 'free', productId: null, subscriptionEnd: null, loading: false });
    }
  };

  const createCheckout = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Error',
          description: 'You must be logged in to subscribe',
          variant: 'destructive',
        });
        return;
      }

      console.log('[CHECKOUT] Starting checkout process...');

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('[CHECKOUT] Response:', { data, error });

      if (error) {
        console.error('[CHECKOUT] Error:', error);
        throw error;
      }
      
      if (data?.error) {
        console.error('[CHECKOUT] Data error:', data.error);
        throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }
      
      if (data?.url) {
        console.log('[CHECKOUT] Redirecting to:', data.url);
        // Use window.location.href for immediate redirect
        window.location.href = data.url;
      } else {
        console.error('[CHECKOUT] No URL in response:', data);
        throw new Error('No checkout URL returned. Please try again.');
      }
    } catch (error) {
      console.error('[CHECKOUT] Caught error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout process',
        variant: 'destructive',
      });
    }
  };

  const manageSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: 'Error',
        description: 'Failed to open subscription management',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    checkSubscription();

    // Check subscription every minute
    const interval = setInterval(checkSubscription, 60000);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkSubscription();
    });

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  return {
    ...status,
    limits: PLAN_LIMITS[status.planType],
    checkSubscription,
    createCheckout,
    manageSubscription,
  };
};
