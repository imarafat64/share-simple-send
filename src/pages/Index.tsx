import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Share, Download, ArrowRight, Shield, Lock, Zap, Server } from 'lucide-react';
import { motion } from 'framer-motion';

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

  const features = [
    {
      icon: Upload,
      title: "Easy Upload",
      description: "Drag and drop or click to upload any file type. Secure storage with instant processing."
    },
    {
      icon: Share,
      title: "Share Instantly",
      description: "Get a shareable link immediately after upload. Share with anyone, anywhere."
    },
    {
      icon: Download,
      title: "Download Freely",
      description: "Recipients can download files without creating an account. Fast and hassle-free."
    }
  ];

  const securityFeatures = [
    { icon: Shield, text: "SSL Encrypted" },
    { icon: Lock, text: "Password Protected" },
    { icon: Zap, text: "Lightning Fast" },
    { icon: Server, text: "Decentralized Storage" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-lg bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
          >
            Shyfto
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Button 
              onClick={handleGetStarted} 
              variant="outline"
              className="border-primary/20 hover:border-primary/40 hover:bg-primary/10"
            >
              {user ? 'Dashboard' : 'Sign In'}
            </Button>
          </motion.div>
        </div>
      </header>

      <main className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="py-20 lg:py-32">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6">
              Share Files{" "}
              <span className="bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent">
                Instantly
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Upload files securely and share them with anyone using a simple link. 
              No registration required for downloads.
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                onClick={handleGetStarted} 
                size="lg" 
                className="text-lg px-10 py-6 glow-button bg-gradient-to-r from-primary to-amber-400 hover:from-primary/90 hover:to-amber-400/90"
              >
                Get Started <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
            
            <p className="text-sm text-muted-foreground mt-4">
              Decentralized storage system
            </p>

            {/* Security Badges */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center gap-8 mt-12"
            >
              {securityFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-muted-foreground">
                  <feature.icon className="w-5 h-5 text-primary" />
                  <span className="text-sm">{feature.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-16 max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                whileHover={{ y: -8 }}
              >
                <Card className="glass border-primary/10 hover:border-primary/30 transition-all duration-300 h-full">
                  <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                      <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                        <feature.icon className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-center text-muted-foreground">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass max-w-3xl mx-auto p-12 rounded-3xl border-primary/10"
          >
            <h2 className="text-4xl font-bold mb-4">Ready to start sharing?</h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Join thousands of users who trust our platform for secure file sharing.
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                onClick={handleGetStarted} 
                size="lg" 
                variant="outline"
                className="border-primary/30 hover:border-primary hover:bg-primary/10 text-lg px-8 py-6"
              >
                {user ? 'Go to Dashboard' : 'Create Free Account'}
              </Button>
            </motion.div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/40 py-8 mt-20">
          <div className="flex justify-center gap-8 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Support</a>
          </div>
          <p className="text-center text-muted-foreground text-sm mt-4">
            © 2024 Shyfto. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
