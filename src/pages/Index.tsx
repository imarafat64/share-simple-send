import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Share, Download, ArrowRight } from 'lucide-react';

const Index = () => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">FileShare</h1>
          <Button onClick={handleGetStarted} variant="outline">
            {user ? 'Dashboard' : 'Sign In'}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-6 text-foreground">
            Share Files <span className="text-primary">Instantly</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Upload files securely and share them with anyone using a simple link. 
            No registration required for downloads.
          </p>
          <Button onClick={handleGetStarted} size="lg" className="text-lg px-8 py-4">
            Get Started <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <Upload className="w-12 h-12 text-primary mx-auto mb-4" />
              <CardTitle>Easy Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Drag and drop or click to upload any file type. 
                Secure storage with instant processing.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Share className="w-12 h-12 text-primary mx-auto mb-4" />
              <CardTitle>Share Instantly</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Get a shareable link immediately after upload. 
                Share with anyone, anywhere.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Download className="w-12 h-12 text-primary mx-auto mb-4" />
              <CardTitle>Download Freely</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Recipients can download files without creating an account. 
                Fast and hassle-free.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-16">
          <h2 className="text-3xl font-bold mb-4 text-foreground">Ready to start sharing?</h2>
          <p className="text-muted-foreground mb-8">
            Join thousands of users who trust our platform for secure file sharing.
          </p>
          <Button onClick={handleGetStarted} size="lg" variant="outline">
            {user ? 'Go to Dashboard' : 'Create Free Account'}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
