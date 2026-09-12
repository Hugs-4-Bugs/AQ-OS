'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  CreditCard,
  Sparkles,
  Mail,
  AlertTriangle,
  PartyPopper,
  Zap,
  Calendar,
  FileText,
  Download,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface PaymentResult {
  paid: boolean;
  success?: boolean;
  plan?: string;
  billingCycle?: string;
  amount?: number;
  currency?: string;
  status?: string;
  credits?: number;
  invoiceNumber?: string | null;
  subscriptionStatus?: string;
  subscriptionId?: string | null;
  provider?: string;
  message?: string;
  error?: string;
  orderStatus?: string;
  activated?: boolean;
}

type VerificationState = 'loading' | 'confirming' | 'success' | 'failed' | 'error';

// Confetti-like particle component
function ConfettiEffect() {
  const particles = useMemo(
    () => {
      const colors = [
        'bg-emerald-400',
        'bg-teal-400',
        'bg-cyan-400',
        'bg-yellow-400',
        'bg-orange-400',
        'bg-pink-400',
        'bg-violet-400',
        'bg-primary',
      ];
      return Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 1.5,
        size: 4 + Math.random() * 8,
        rotation: Math.random() * 360,
      }));
    },
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute ${p.color} rounded-sm`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall 3s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  const hasConfirmedRef = useRef(false);

  const [state, setState] = useState<VerificationState>('loading');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [confirmRetries, setConfirmRetries] = useState(0);

  // Redirect if no session_id
  useEffect(() => {
    if (!sessionId) {
      router.replace('/');
    }
  }, [sessionId, router]);

  // Verify payment and activate via confirm-payment endpoint
  useEffect(() => {
    const sid = sessionId;
    if (!sid || hasConfirmedRef.current) return;

    hasConfirmedRef.current = true;
    let cancelled = false;

    async function doVerify() {
      try {
        // Phase 1: Quick verification
        setState('loading');

        const verifyResponse = await fetch(
          `/api/payments/verify-session?session_id=${encodeURIComponent(sid)}`
        );
        const verifyData: PaymentResult = await verifyResponse.json();

        if (cancelled) return;

        // If already completed, skip confirm-payment and go to success
        if (verifyResponse.ok && verifyData.paid && verifyData.orderStatus === 'completed') {
          setResult(verifyData);
          setState('success');
          setRedirectCountdown(10);
          return;
        }

        // If not paid yet, show pending state
        if (verifyResponse.ok && !verifyData.paid) {
          setResult(verifyData);
          setState('failed');
          return;
        }

        // Phase 2: Call confirm-payment to activate (the CRITICAL fallback)
        setState('confirming');

        const confirmResponse = await fetch('/api/payments/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        const confirmData: PaymentResult = await confirmResponse.json();

        if (cancelled) return;

        if (confirmResponse.ok && confirmData.success && confirmData.paid) {
          setResult(confirmData);
          setState('success');
          setRedirectCountdown(10);
        } else if (confirmResponse.ok && !confirmData.paid) {
          setResult(confirmData);
          setState('failed');
        } else if (confirmResponse.ok && confirmData.error) {
          setResult(confirmData);
          setState('error');
        } else {
          setResult({
            paid: false,
            error: confirmData.error || 'Payment confirmation failed',
          });
          setState('error');
        }
      } catch {
        if (cancelled) return;
        setResult({ paid: false, error: 'Network error. Please check your connection and try again.' });
        setState('error');
      }
    }

    doVerify();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Animate in on success
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => setAnimateIn(true), 100);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Auto-redirect countdown
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      router.push('/');
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  const formatAmount = useCallback((amount: number, currency: string) => {
    const cur = currency?.toUpperCase() || 'INR';
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 0,
    }).format(amount / 100);
  }, []);

  const getPlanDisplayName = (plan?: string) => {
    switch (plan) {
      case 'pro':
        return 'Pro';
      case 'elite':
        return 'Elite';
      case 'enterprise':
        return 'Enterprise';
      default:
        return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Unknown';
    }
  };

  const getBillingCycleDisplay = (cycle?: string) => {
    switch (cycle) {
      case 'monthly':
        return 'Monthly';
      case 'yearly':
        return 'Yearly';
      default:
        return cycle || 'N/A';
    }
  };

  const getSubscriptionStatusDisplay = (status?: string) => {
    switch (status) {
      case 'active':
        return { label: 'Active', variant: 'default' as const };
      case 'trialing':
        return { label: 'Trialing', variant: 'secondary' as const };
      case 'past_due':
        return { label: 'Past Due', variant: 'destructive' as const };
      case 'canceled':
        return { label: 'Canceled', variant: 'outline' as const };
      default:
        return { label: status || 'Active', variant: 'default' as const };
    }
  };

  const handleRetry = async () => {
    if (!sessionId) {
      router.push('/');
      return;
    }
    setState('confirming');
    setResult(null);
    setRedirectCountdown(null);

    try {
      const confirmResponse = await fetch('/api/payments/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const confirmData: PaymentResult = await confirmResponse.json();

      if (confirmResponse.ok && confirmData.success && confirmData.paid) {
        setResult(confirmData);
        setState('success');
        setRedirectCountdown(10);
      } else if (confirmResponse.ok && !confirmData.paid) {
        setResult(confirmData);
        setState('failed');
        setConfirmRetries((prev) => prev + 1);
      } else {
        setResult({
          paid: false,
          error: confirmData.error || 'Payment confirmation failed',
        });
        setState('error');
        setConfirmRetries((prev) => prev + 1);
      }
    } catch {
      setResult({ paid: false, error: 'Network error. Please check your connection and try again.' });
      setState('error');
      setConfirmRetries((prev) => prev + 1);
    }
  };

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16 px-6">
            <div className="relative mb-6">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <CreditCard className="h-10 w-10 text-primary" />
              </div>
              <Loader2 className="absolute -bottom-1 -right-1 h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Verifying Payment</h2>
            <p className="text-sm text-muted-foreground text-center">
              We&apos;re confirming your payment with our payment provider. This may take a few
              moments...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirming state (calling the fallback endpoint)
  if (state === 'confirming') {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16 px-6">
            <div className="relative mb-6">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-primary animate-pulse" />
              </div>
              <Loader2 className="absolute -bottom-1 -right-1 h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Activating Your Subscription</h2>
            <p className="text-sm text-muted-foreground text-center">
              Your payment was received! We&apos;re now activating your subscription and generating
              your invoice...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    const subStatus = getSubscriptionStatusDisplay(result?.subscriptionStatus);

    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <ConfettiEffect />

        <Card
          className={`w-full max-w-md shadow-lg transition-all duration-700 ${
            animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <PartyPopper className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-2xl">Payment Successful!</CardTitle>
              <Sparkles className="h-5 w-5 text-yellow-500" />
            </div>
            <CardDescription>
              {result?.activated
                ? 'Your subscription has been activated. Welcome aboard!'
                : 'Your subscription is active and ready to use!'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge variant="default" className="text-sm">
                  {getPlanDisplayName(result?.plan)}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Billing Cycle
                </span>
                <span className="text-sm font-medium">
                  {getBillingCycleDisplay(result?.billingCycle)}
                </span>
              </div>

              {result?.amount != null && result?.currency && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Amount Paid
                  </span>
                  <span className="text-sm font-semibold">
                    {formatAmount(result.amount, result.currency)}
                  </span>
                </div>
              )}

              {result?.credits != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    Credits Granted
                  </span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {result.credits.toLocaleString()} credits
                  </span>
                </div>
              )}

              {result?.subscriptionStatus && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subscription</span>
                  <Badge variant={subStatus.variant} className="text-xs">
                    {subStatus.label}
                  </Badge>
                </div>
              )}

              {result?.invoiceNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Invoice
                  </span>
                  <span className="text-sm font-medium font-mono">
                    {result.invoiceNumber}
                  </span>
                </div>
              )}

              <Separator />

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      Credits Granted
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your account has been credited with {result?.credits?.toLocaleString() || 'the plan&apos;s'} monthly credits. Start
                      discovering leads and automating your outreach now!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full gap-2 mt-4"
              size="lg"
              onClick={() => router.push('/')}
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>

            {redirectCountdown !== null && redirectCountdown > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                Redirecting to dashboard in {redirectCountdown} seconds...
              </p>
            )}

            <p className="text-xs text-center text-muted-foreground pt-2">
              A confirmation email with your invoice has been sent to your registered email address.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Failed state (payment not completed)
  if (state === 'failed') {
    return (
      <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/10">
              <AlertTriangle className="h-12 w-12 text-yellow-500" />
            </div>
            <CardTitle className="text-2xl">Payment Not Completed</CardTitle>
            <CardDescription>
              {result?.message
                ? result.message
                : result?.status
                ? `Your payment status is: ${result.status}. Please try again or contact support.`
                : 'We could not confirm your payment. Please try again.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Separator />

            <div className="flex flex-col gap-3">
              <Button
                className="w-full gap-2"
                onClick={handleRetry}
              >
                <RefreshCw className="h-4 w-4" />
                Retry Verification
              </Button>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => router.push('/')}
              >
                Try Again
                <ArrowRight className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                className="w-full gap-2"
                onClick={() => {
                  window.location.href = 'mailto:support@acquisitionos.com';
                }}
              >
                <Mail className="h-4 w-4" />
                Contact Support
              </Button>
            </div>

            {confirmRetries >= 2 && (
              <p className="text-xs text-center text-muted-foreground">
                If payment was successful on Stripe&apos;s side, your subscription will be activated
                automatically once the webhook reaches our server.
              </p>
            )}

            <p className="text-xs text-center text-muted-foreground pt-2">
              If you believe this is an error, please reach out to{' '}
              <a
                href="mailto:support@acquisitionos.com"
                className="text-primary hover:text-primary/80 underline"
              >
                support@acquisitionos.com
              </a>{' '}
              with your session details.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-muted/40 dark:bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Verification Error</CardTitle>
          <CardDescription>
            {result?.error || 'An unexpected error occurred while verifying your payment.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Separator />

          <div className="flex flex-col gap-3">
            <Button
              className="w-full gap-2"
              onClick={handleRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Retry Verification
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => router.push('/')}
            >
              <ArrowRight className="h-4 w-4" />
              Go to Dashboard
            </Button>

            <Button
              variant="ghost"
              className="w-full gap-2"
              onClick={() => {
                window.location.href = 'mailto:support@acquisitionos.com';
              }}
            >
              <Mail className="h-4 w-4" />
              Contact Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
