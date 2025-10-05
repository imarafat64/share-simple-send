import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSubscription } from '@/hooks/useSubscription';
import { useNavigate } from 'react-router-dom';

const Pricing = () => {
  const { planType, subscribed, createCheckout, manageSubscription, loading } = useSubscription();
  const navigate = useNavigate();

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
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl text-muted-foreground">
            Start free, upgrade when you need more
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const isCurrentPlan = planType === plan.type;
            const isFreePlan = plan.type === 'free';
            
            return (
              <Card
                key={plan.name}
                className={`p-8 relative ${
                  plan.popular
                    ? 'border-primary shadow-lg scale-105'
                    : 'border-border'
                } ${isCurrentPlan ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                
                {isCurrentPlan && (
                  <div className="absolute -top-4 right-4 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Your Plan
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
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

        <div className="text-center mt-12">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
