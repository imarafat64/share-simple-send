import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

const Success = () => {
  const navigate = useNavigate();
  const { checkSubscription, loading, subscribed, planType } = useSubscription();

  useEffect(() => {
    // Force check subscription when landing on success page
    const refreshAndRedirect = async () => {
      await checkSubscription();
      
      // Wait a bit for the subscription to be updated
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    };

    refreshAndRedirect();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center">
        {loading ? (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />
            <h1 className="text-2xl font-bold mb-2">Processing Your Subscription</h1>
            <p className="text-muted-foreground">
              Please wait while we activate your Pro plan...
            </p>
          </>
        ) : subscribed && planType === 'pro' ? (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h1 className="text-2xl font-bold mb-2">Welcome to Pro!</h1>
            <p className="text-muted-foreground mb-4">
              Your subscription is now active. Redirecting to dashboard...
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✓ 100 GB storage</p>
              <p>✓ 2 GB max file size</p>
              <p>✓ 30-day retention</p>
              <p>✓ Password-protected links</p>
              <p>✓ Ad-free experience</p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground">
              Redirecting you to the dashboard...
            </p>
          </>
        )}
      </Card>
    </div>
  );
};

export default Success;
