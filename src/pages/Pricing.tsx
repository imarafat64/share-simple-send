import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSubscription } from '@/hooks/useSubscription';
import { useNavigate } from 'react-router-dom';

const Pricing = () => {
  const { planType, subscribed, createCheckout, manageSubscription, loading } = useSubscription();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading subscription status...</p>
        </div>
      </div>
    );
  }

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: [
        '5 GB storage',
        '500 MB max file size',
        '7 days file retention',
        'Basic sharing links',
        'Ads on download pages',
      ],
      cta: 'Current Plan',
      type: 'free' as const,
    },
    {
      name: 'Pro',
      price: '$5',
      period: 'per month',
      features: [
        '100 GB storage',
        '2 GB max file size',
        '30 days file retention',
        'Password-protected links',
        'Ad-free experience',
        'Faster speeds',
      ],
      cta: 'Subscribe Now',
      type: 'pro' as const,
      popular: true,
    },
  ];

  const handlePlanAction = async (type: 'free' | 'pro') => {
    if (type === 'free') {
      navigate('/dashboard');
      return;
    }

    if (subscribed && planType === 'pro') {
      await manageSubscription();
    } else {
      await createCheckout();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 sm:py-12 md:py-16">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 px-4">Choose Your Plan</h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-4">
            Start free, upgrade when you need more
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = planType === plan.type;
            const isFreePlan = plan.type === 'free';
            
            return (
              <Card
                key={plan.name}
                className={`p-6 sm:p-8 relative ${
                  plan.popular
                    ? 'border-primary shadow-lg md:scale-105'
                    : 'border-border'
                } ${isCurrentPlan ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                
                {isCurrentPlan && (
                  <div className="absolute -top-3 sm:-top-4 right-4 bg-green-500 text-white px-3 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-semibold">
                    Your Plan
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm sm:text-base text-muted-foreground">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 sm:gap-3">
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm sm:text-base">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => handlePlanAction(plan.type)}
                  disabled={loading || (isCurrentPlan && isFreePlan)}
                >
                  {loading ? 'Loading...' : 
                   isCurrentPlan && !isFreePlan ? 'Manage Subscription' :
                   isCurrentPlan ? plan.cta : 
                   plan.cta}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-8 sm:mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="w-full sm:w-auto">
            Back to Home
          </Button>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="w-full sm:w-auto">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
