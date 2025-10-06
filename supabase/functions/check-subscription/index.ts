import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, updating to free plan");
      
      // Update user subscription to free
      await supabaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: user.id,
          plan_type: 'free',
          subscription_status: null,
          subscription_end: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          stripe_product_id: null,
        });
      
      return new Response(JSON.stringify({ 
        subscribed: false,
        plan_type: 'free',
        product_id: null,
        subscription_end: null 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;
    let subscriptionId = null;
    let subscriptionStatus = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionId = subscription.id;
      subscriptionStatus = subscription.status;
      
      // Convert Unix timestamp to ISO string with error handling
      try {
        const periodEnd = subscription.current_period_end;
        if (periodEnd && typeof periodEnd === 'number') {
          subscriptionEnd = new Date(periodEnd * 1000).toISOString();
        } else if (periodEnd) {
          subscriptionEnd = new Date(Number(periodEnd) * 1000).toISOString();
        }
        logStep("Active subscription found", { subscriptionId, endDate: subscriptionEnd, rawPeriodEnd: periodEnd });
      } catch (dateError) {
        logStep("Error converting date, using null", { error: String(dateError), periodEnd: subscription.current_period_end });
        subscriptionEnd = null;
      }
      
      productId = subscription.items.data[0]?.price?.product as string || null;
      logStep("Determined subscription product", { productId });
      
      // Update user subscription to pro
      await supabaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: user.id,
          plan_type: 'pro',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_product_id: productId,
          subscription_status: subscriptionStatus,
          subscription_end: subscriptionEnd,
        });
    } else {
      logStep("No active subscription found, checking for canceled/past_due");
      
      // Check for canceled or past_due subscriptions
      const allSubs = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
      });
      
      // Update to free plan
      await supabaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: user.id,
          plan_type: 'free',
          stripe_customer_id: customerId,
          subscription_status: allSubs.data[0]?.status || null,
          subscription_end: null,
          stripe_subscription_id: null,
          stripe_product_id: null,
        });
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      plan_type: hasActiveSub ? 'pro' : 'free',
      product_id: productId,
      subscription_end: subscriptionEnd
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
