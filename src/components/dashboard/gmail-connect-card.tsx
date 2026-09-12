'use client';

import React, { useState } from 'react';
import { Mail, Shield, Zap, Link2, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectGmail } from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const BENEFITS = [
  { icon: Mail, label: 'Sync your inbox', desc: 'Read and manage emails directly in AcquisitionOS' },
  { icon: Zap, label: 'Auto-link leads', desc: 'Automatically match emails to your leads' },
  { icon: Link2, label: 'Send outreach', desc: 'Compose and send emails from your Gmail account' },
  { icon: Shield, label: 'Secure access', desc: 'Read-only permissions, we never modify your data' },
];

export default function GmailConnectCard() {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { authUrl } = await connectGmail();
      window.location.href = authUrl;
    } catch {
      toast.error('Failed to connect Gmail. Please try again.');
      setConnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-primary/20 overflow-hidden">
          {/* Gmail Header */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 px-6 py-8 text-center border-b border-primary/10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg dark:bg-card">
              <svg viewBox="0 0 24 24" className="h-10 w-10" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-foreground">Connect Your Gmail</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your Gmail account to manage emails from AcquisitionOS
            </p>
          </div>

          <CardContent className="p-6 space-y-4">
            {/* Benefits List */}
            <div className="space-y-3">
              {BENEFITS.map((benefit, i) => {
                const Icon = benefit.icon;
                return (
                  <motion.div
                    key={benefit.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i, duration: 0.3 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{benefit.label}</p>
                      <p className="text-xs text-muted-foreground">{benefit.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Connect Button */}
            <Button
              className="w-full h-12 text-base gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Redirecting to Google...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Connect with Google
                </>
              )}
            </Button>

            {/* Privacy Notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
              <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Your data is safe</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We only request read and send permissions. Your emails are never stored on our servers or shared with third parties.
                </p>
              </div>
            </div>

            {/* What you get */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Free to connect — no credit card required</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
