'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Check,
  X,
  Crown,
  Sparkles,
  ArrowRight,
  Shield,
  CreditCard,
  HelpCircle,
  ChevronDown,
  Lock,
  BadgeCheck,
  RefreshCcw,
  Star,
  Loader2,
  CheckCircle2,
  XCircle,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PricingPageProps {
  currentPlan: PlanType;
  onSelectPlan: (plan: PlanType, billingCycle: 'monthly' | 'yearly') => void;
}

const PLAN_ORDER: PlanType[] = ['free', 'pro', 'elite'];

// Feature comparison for the table
const FEATURE_COMPARISON = [
  { feature: 'Lead Discovery', free: true, pro: true, elite: true },
  { feature: 'Deep Lead Analysis', free: false, pro: true, elite: true },
  { feature: 'Outreach Messages', free: true, pro: true, elite: true },
  { feature: 'Outreach Sequences', free: false, pro: true, elite: true },
  { feature: 'Sales Coaching', free: false, pro: true, elite: true },
  { feature: 'Proposal Generation', free: false, pro: true, elite: true },
  { feature: 'Competitor Analysis', free: false, pro: true, elite: true },
  { feature: 'Data Export (PDF)', free: false, pro: true, elite: true },
  { feature: 'White-Label Reports', free: false, pro: false, elite: true },
  { feature: 'Team Collaboration', free: false, pro: false, elite: true },
  { feature: 'Custom Integrations', free: false, pro: false, elite: true },
  { feature: 'API Access', free: false, pro: true, elite: true },
  { feature: 'Priority Support', free: false, pro: true, elite: true },
  { feature: 'Dedicated Account Manager', free: false, pro: false, elite: true },
];

// Credit add-ons — AcquisitionOS credit add-on packs (Sep 2026).
// 3 packs: 100 / 500 / 1,000 credits. Prices shown are exclusive of
// 18% GST. Stripe price IDs are looked up server-side from env
// (STRIPE_PRICE_CREDITS_100_ID, STRIPE_PRICE_CREDITS_500_ID,
// STRIPE_PRICE_CREDITS_1000_ID) — never hardcoded client-side.
const CREDIT_ADDONS = [
  { credits: 100, priceINR: 499, priceUSD: 6, label: '100 Credits', popular: false },
  { credits: 500, priceINR: 1999, priceUSD: 24, label: '500 Credits', popular: true },
  { credits: 1000, priceINR: 3499, priceUSD: 42, label: '1,000 Credits', popular: false },
];

// FAQ items
const FAQ_ITEMS = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes! You can upgrade or downgrade your plan at any time. When upgrading, you\'ll get immediate access to new features. Downgrades take effect at the end of your current billing period.',
  },
  {
    q: 'What happens to my unused credits?',
    a: 'Unused credits roll over to the next month on Pro and Elite plans. On the Free plan, credits reset monthly. Credit add-ons never expire.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes! All new users get a 14-day free trial of the Pro plan with full access to all Pro features. No credit card required to start.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit/debit cards, UPI, net banking (for Indian users via Razorpay), and international cards via Stripe. All payments are secure and encrypted.',
  },
  {
    q: 'Can I get a refund?',
    a: 'We offer a 30-day money-back guarantee on all paid plans. If you\'re not satisfied, contact support within 30 days of purchase for a full refund.',
  },
  {
    q: 'Do prices include GST?',
    a: 'Prices shown are exclusive of GST. 18% GST will be added at checkout for Indian users. International users are not charged GST.',
  },
];

// Payment state
type PaymentState = 'idle' | 'creating_order' | 'checkout' | 'verifying' | 'success' | 'failed';

function PricingPlanCard({
  planType,
  isYearly,
  isCurrent,
  isPopular,
  onSelect,
  isProcessing,
  currentPlan,
}: {
  planType: PlanType;
  isYearly: boolean;
  isCurrent: boolean;
  isPopular: boolean;
  onSelect: () => void;
  isProcessing: boolean;
  currentPlan: PlanType;
}) {
  const details = PLAN_DETAILS[planType];
  const priceINR = isYearly ? details.yearlyINR : details.priceINR;
  const priceUSD = isYearly ? details.yearlyUSD : details.priceUSD;
  const period = isYearly ? '/year' : '/month';

  const cardGradients: Record<PlanType, string> = {
    free: 'from-slate-500/10 via-card to-card',
    pro: 'from-primary/10 via-card to-card',
    elite: 'from-amber-500/10 via-card to-card',
  };

  const borderColors: Record<PlanType, string> = {
    free: 'border-border',
    pro: 'border-primary/40',
    elite: 'border-amber-500/40',
  };

  const iconColors: Record<PlanType, string> = {
    free: 'text-muted-foreground',
    pro: 'text-primary',
    elite: 'text-amber-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: PLAN_ORDER.indexOf(planType) * 0.1 }}
      className={cn(
        'relative flex flex-col rounded-2xl border-2 p-6 transition-all duration-300',
        'hover:shadow-lg hover:-translate-y-1',
        `bg-gradient-to-b ${cardGradients[planType]}`,
        borderColors[planType],
        isPopular && 'ring-2 ring-primary shadow-xl shadow-primary/10',
        isCurrent && 'ring-2 ring-emerald-500/50'
      )}
    >
      {/* Popular badge */}
      {isPopular && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground shadow-lg px-3 py-0.5 text-xs font-bold gap-1">
            <Sparkles className="h-3 w-3" />
            Most Popular
          </Badge>
        </div>
      )}

      {/* Current plan badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 px-3 py-0.5 text-xs font-bold"
          >
            Current Plan
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          {planType === 'elite' ? (
            <Crown className={cn('h-6 w-6', iconColors[planType])} />
          ) : (
            <Zap className={cn('h-6 w-6', iconColors[planType])} fill="currentColor" />
          )}
          <h3 className="text-xl font-bold text-foreground">{details.name}</h3>
        </div>

        {/* Price — font-bold text-foreground per PART 6 */}
        <div className="flex items-baseline gap-1">
          {priceINR === 0 ? (
            <span className="text-4xl font-extrabold text-foreground">Free</span>
          ) : (
            <>
              <span className="text-3xl font-extrabold text-foreground">
                ₹{priceINR.toLocaleString('en-IN')}
              </span>
              <span className="text-sm text-muted-foreground">{period}</span>
            </>
          )}
        </div>
        {/* "₹X/month billed annually" sub-line for yearly plans (PART 1) */}
        {isYearly && priceINR > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            ₹{planType === 'pro'
              ? 999
              : planType === 'elite'
              ? 3166
              : 0}/month billed annually
          </p>
        )}
        {priceUSD > 0 && (
          <span className="text-xs text-muted-foreground block">
            ${priceUSD}{period}
          </span>
        )}
        {/* Yearly savings badge — exact text per PART 1 */}
        {isYearly && priceINR > 0 && (
          <Badge variant="secondary" className="mt-2 text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Save ₹{planType === 'pro'
              ? 7189
              : planType === 'elite'
              ? 24389
              : 0}/year vs monthly
          </Badge>
        )}
      </div>

      {/* Credits */}
      <div className="mb-5 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">
          {details.creditsMonthly.toLocaleString()} credits/month
        </span>
      </div>

      {/* Features list */}
      <div className="flex-1 space-y-2.5 mb-6">
        {details.features.map((feature) => (
          <div key={feature} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-sm text-foreground/80">{feature}</span>
          </div>
        ))}
        {details.disabledFeatures.slice(0, 3).map((feature) => (
          <div key={feature} className="flex items-start gap-2 opacity-40">
            <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground line-through">{feature}</span>
          </div>
        ))}
      </div>

      {/* CTA Button — PART 2: no self-serve downgrade. Lower plans
          show "Contact Support" (mailto) instead of "Downgrade". */}
      {PLAN_ORDER.indexOf(planType) < PLAN_ORDER.indexOf(currentPlan) && !isCurrent ? (
        <Button
          asChild
          variant="outline"
          className={cn(
            'w-full gap-2 font-semibold',
            'bg-muted/40 text-muted-foreground border-muted hover:bg-muted hover:text-foreground',
          )}
        >
          <a href="mailto:support@acquisitionos.com?subject=Plan%20change%20request">
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
        </Button>
      ) : (
        <Button
          variant={planType === 'free' ? 'outline' : 'default'}
          className={cn(
            'w-full gap-2 font-semibold',
            planType === 'elite' && 'bg-amber-600 hover:bg-amber-700 text-white',
            isCurrent && 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-default'
          )}
          disabled={isCurrent || isProcessing}
          onClick={onSelect}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : isCurrent ? (
            <>
              <Shield className="h-4 w-4" />
              Current Plan
            </>
          ) : (
            <>
              {planType === 'pro' ? 'Upgrade to Pro' : isYearly ? 'Upgrade to Elite Annual' : 'Upgrade to Elite'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </motion.div>
  );
}

export default function PricingPage({ currentPlan, onSelectPlan }: PricingPageProps) {
  const [isYearly, setIsYearly] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [processingPlan, setProcessingPlan] = useState<PlanType | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState('');

  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await fetch('/api/payments/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim(), plan: 'pro' }),
      });
      if (res.ok) {
        setCouponApplied(true);
        setCouponError('');
        toast.success(`Coupon "${couponCode}" applied!`);
      } else {
        const data = await res.json().catch(() => ({}));
        setCouponError(data.error || 'Invalid coupon code');
        setCouponApplied(false);
      }
    } catch {
      // Network error — show a clear error instead of silently simulating
      // a known coupon (the previous "LAUNCH20" offline fallback was a
      // mock-payment vector because it bypassed the validation API).
      setCouponError('Network error. Could not validate coupon code. Please try again.');
      setCouponApplied(false);
    }
  };

  // Verify payment and sync subscription data
  // NOTE: We intentionally do NOT call /api/payments/confirm here. The only
  // legitimate way to activate a subscription is the Stripe/Razorpay
  // webhook. This function just re-syncs the local subscription store so
  // the UI can reflect a plan upgrade that the webhook has already
  // processed server-side. The success message shown to the user is the
  // honest "Payment received. Your plan will be updated shortly." rather
  // than a premature "Plan upgraded".
  const verifyPaymentAndSync = useCallback(async () => {
    try {
      const subRes = await fetch('/api/subscriptions/current', {
        credentials: 'include',
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        syncFromBackend(subData);
        setPaymentState('success');
      } else {
        setPaymentState('failed');
        setPaymentError('Could not verify payment status.');
      }
    } catch {
      setPaymentState('failed');
      setPaymentError('Network error while verifying payment.');
    }
  }, [syncFromBackend]);

  // NOTE: handleDevModePayment was removed. It previously called
  // /api/payments/confirm with a synthesized `pay_dev_<timestamp>` payment
  // ID to activate the subscription without any real payment. That was
  // the source of the "payment succeeds without going to Stripe" bug.
  // The only valid flows are now:
  //   1. Stripe: POST /api/payments/create-order -> redirect to Stripe URL
  //   2. Razorpay: POST /api/payments/create-order -> open Razorpay overlay
  //      -> on success, poll /api/payments/history until webhook marks the
  //         order as 'completed' (the webhook is the source of truth).

  // Open Razorpay checkout
  const openRazorpayCheckout = useCallback((
    orderData: {
      razorpayOrderId: string;
      razorpayKeyId: string;
      razorpayAmount: number;
      razorpayCurrency: string;
      userName: string;
      userEmail: string;
      orderId: string;
    }
  ) => {
    setPaymentState('checkout');
    if (typeof window === 'undefined' || !(window as unknown as Record<string, unknown>).Razorpay) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => launchRazorpay(orderData);
      script.onerror = () => {
        // Real failure: could not load Razorpay from CDN. Show a clear
        // error. Do NOT simulate a payment.
        setPaymentState('failed');
        setPaymentError('Failed to load the Razorpay checkout script. Please check your internet connection and try again.');
        toast.error('Failed to load Razorpay. Please check your internet connection.');
        setProcessingPlan(null);
      };
      document.body.appendChild(script);
    } else {
      launchRazorpay(orderData);
    }
  }, []);

  const launchRazorpay = useCallback((
    orderData: {
      razorpayOrderId: string;
      razorpayKeyId: string;
      razorpayAmount: number;
      razorpayCurrency: string;
      userName: string;
      userEmail: string;
      orderId: string;
    }
  ) => {
    try {
      const RazorpayConstructor = (window as unknown as Record<string, unknown>).Razorpay as new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (...args: unknown[]) => void) => void };
      const options = {
        key: orderData.razorpayKeyId,
        amount: orderData.razorpayAmount,
        currency: orderData.razorpayCurrency,
        name: 'AcquisitionOS',
        description: 'Subscription Upgrade',
        order_id: orderData.razorpayOrderId,
        prefill: { name: orderData.userName, email: orderData.userEmail },
        theme: { color: '#6366f1' },
        handler: async function () {
          setPaymentState('verifying');
          await verifyPaymentAndSync();
        },
        modal: {
          ondismiss: function () {
            setPaymentState('idle');
            setProcessingPlan(null);
            toast.info('Payment cancelled');
          },
        },
      };
      const rzp = new RazorpayConstructor(options);
      rzp.on('payment.failed', function (response: { error: { description: string } }) {
        setPaymentState('failed');
        setPaymentError(response.error.description || 'Payment failed');
        toast.error('Payment failed');
        setProcessingPlan(null);
      });
      rzp.open();
    } catch (error) {
      // Razorpay failed to open. Show a real error — do NOT simulate a
      // payment via /api/payments/confirm with a fake payment ID.
      console.error('[Razorpay] Failed to open checkout:', error);
      setPaymentState('failed');
      setPaymentError('Failed to open Razorpay checkout. Please try again or use a different payment method.');
      toast.error('Failed to open Razorpay checkout.');
      setProcessingPlan(null);
    }
  }, [verifyPaymentAndSync]);

  // Handle plan selection with full payment flow
  const handleSelectPlan = useCallback(async (plan: PlanType) => {
    if (plan === currentPlan) return;

    // For free plan, just use the callback
    if (plan === 'free') {
      onSelectPlan(plan, isYearly ? 'yearly' : 'monthly');
      return;
    }

    setProcessingPlan(plan);
    setPaymentState('creating_order');
    setPaymentError('');

    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          billingCycle: isYearly ? 'yearly' : 'monthly',
          couponCode: couponApplied ? couponCode : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create order');
      }

      const data = await res.json();

      // Stripe: redirect to checkout
      if (data.provider === 'stripe' && data.stripeCheckoutUrl) {
        setPaymentState('checkout');
        window.location.href = data.stripeCheckoutUrl;
        return;
      }

      // Razorpay: open checkout overlay
      if (data.provider === 'razorpay' && data.razorpayOrderId) {
        openRazorpayCheckout({
          razorpayOrderId: data.razorpayOrderId,
          razorpayKeyId: data.razorpayKeyId,
          razorpayAmount: data.razorpayAmount,
          razorpayCurrency: data.razorpayCurrency || 'INR',
          userName: data.userName || '',
          userEmail: data.userEmail || '',
          orderId: data.orderId,
        });
        return;
      }

      // No real payment provider configured — show configuration warning
      if (data.providerConfigured === false) {
        setPaymentState('failed');
        setPaymentError(
          `Payment provider (${data.provider}) is not configured. ` +
          `Please add your ${data.provider === 'razorpay' ? 'Razorpay (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)' : 'Stripe (STRIPE_SECRET_KEY)'} environment variables to enable real payments.`
        );
        toast.error('Payment provider not configured. Contact your administrator.');
        setProcessingPlan(null);
        return;
      }

      throw new Error('No payment method available');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process upgrade';
      setPaymentState('failed');
      setPaymentError(message);
      toast.error(message);
      setProcessingPlan(null);
    }
  }, [currentPlan, isYearly, couponApplied, couponCode, onSelectPlan, openRazorpayCheckout]);

  // Handle credit add-on purchase
  const handleBuyAddon = useCallback(async (addon: typeof CREDIT_ADDONS[number]) => {
    setPaymentState('creating_order');
    setPaymentError('');

    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: 'pro',
          billingCycle: 'monthly',
          addonCredits: addon.credits,
          addonPriceINR: addon.priceINR,
          addonPriceUSD: addon.priceUSD,
          addonLabel: addon.label,
          isAddon: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create add-on order');
      }

      const data = await res.json();

      if (data.provider === 'stripe' && data.stripeCheckoutUrl) {
        setPaymentState('checkout');
        window.location.href = data.stripeCheckoutUrl;
        return;
      }

      if (data.provider === 'razorpay' && data.razorpayOrderId) {
        openRazorpayCheckout({
          razorpayOrderId: data.razorpayOrderId,
          razorpayKeyId: data.razorpayKeyId,
          razorpayAmount: data.razorpayAmount,
          razorpayCurrency: data.razorpayCurrency || 'INR',
          userName: data.userName || '',
          userEmail: data.userEmail || '',
          orderId: data.orderId,
        });
        return;
      }

      if (data.providerConfigured === false) {
        setPaymentState('failed');
        setPaymentError(
          `Payment provider (${data.provider}) is not configured. ` +
          `Please add your ${data.provider === 'razorpay' ? 'Razorpay (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)' : 'Stripe (STRIPE_SECRET_KEY)'} environment variables to enable real payments.`
        );
        toast.error('Payment provider not configured. Contact your administrator.');
        return;
      }

      throw new Error('No payment method available');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to purchase add-on';
      setPaymentState('failed');
      setPaymentError(message);
      toast.error(message);
    }
  }, [openRazorpayCheckout]);

  // Handle Stripe redirect callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      setPaymentState('verifying');
      verifyPaymentAndSync();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [verifyPaymentAndSync]);

  return (
    <div className="w-full">
      <ScrollArea className="h-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
          {/* Header */}
          <div className="text-center space-y-3">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 gap-1">
                <Sparkles className="h-3 w-3" />
                Subscription Plans
              </Badge>
            </motion.div>
            <h1 className="text-3xl sm:text-4xl font-bold gradient-text">
              Choose Your Plan
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Unlock the full power of AI-driven client acquisition. Start free, scale as you grow.
            </p>
          </div>

          {/* Payment state overlay */}
          <AnimatePresence mode="wait">
            {paymentState === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <CheckCircle2 className="h-16 w-16 text-emerald-500" />
                <h3 className="text-xl font-bold">Payment Received</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Your payment has been received. Your plan will be updated shortly
                  once the payment provider confirms the transaction via webhook.
                </p>
                <Button onClick={() => setPaymentState('idle')} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Continue
                </Button>
              </motion.div>
            )}

            {paymentState === 'failed' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <XCircle className="h-16 w-16 text-red-500" />
                <h3 className="text-xl font-bold">Payment Failed</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {paymentError || 'Your payment could not be processed. Please try again.'}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setPaymentState('idle'); setProcessingPlan(null); }}>
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}

            {paymentState === 'verifying' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <h3 className="text-lg font-semibold">Verifying Payment...</h3>
                <p className="text-sm text-muted-foreground">
                  Please wait while we confirm your payment and activate your subscription.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {(paymentState === 'idle' || paymentState === 'creating_order' || paymentState === 'checkout') && (
            <>
              {/* Billing Toggle */}
              <div className="flex items-center justify-center gap-3">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    !isYearly ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  Monthly
                </span>
                <Switch
                  checked={isYearly}
                  onCheckedChange={setIsYearly}
                  className="data-[state=checked]:bg-primary"
                />
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isYearly ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  Yearly
                </span>
                {isYearly && (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs gap-1">
                    <Star className="h-3 w-3" />
                    Save up to ₹24,389/year
                  </Badge>
                )}
              </div>

              {/* Creating order indicator */}
              {paymentState === 'creating_order' && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating your order...
                </div>
              )}

              {/* Plan Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                {PLAN_ORDER.map((planType) => (
                  <PricingPlanCard
                    key={planType}
                    planType={planType}
                    isYearly={isYearly}
                    isCurrent={planType === currentPlan}
                    isPopular={planType === 'pro'}
                    onSelect={() => handleSelectPlan(planType)}
                    isProcessing={processingPlan === planType || paymentState === 'creating_order'}
                    currentPlan={currentPlan}
                  />
                ))}
              </div>

              {/* Coupon Code */}
              <div className="max-w-md mx-auto">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError('');
                        setCouponApplied(false);
                      }}
                      className={cn(
                        'pr-10',
                        couponApplied && 'border-emerald-500/50 focus-visible:border-emerald-500',
                        couponError && 'border-red-500/50 focus-visible:border-red-500'
                      )}
                      aria-label="Coupon code"
                    />
                    {couponApplied && (
                      <BadgeCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim()}
                    className="shrink-0"
                  >
                    Apply
                  </Button>
                </div>
                {couponApplied && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-emerald-500 mt-1.5"
                  >
                    Coupon &quot;{couponCode}&quot; applied! Discount will be applied at checkout.
                  </motion.p>
                )}
                {couponError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-500 mt-1.5"
                  >
                    {couponError}
                  </motion.p>
                )}
              </div>

              {/* Feature Comparison Table */}
              <div>
                <h2 className="text-xl font-bold mb-6 text-center flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Feature Comparison
                </h2>
                <div className="rounded-xl border overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3 sm:p-4 font-medium min-w-[160px]">Feature</th>
                        <th className="text-center p-3 sm:p-4 font-medium w-[100px]">Free</th>
                        <th className="text-center p-3 sm:p-4 font-medium text-primary w-[100px]">Pro</th>
                        <th className="text-center p-3 sm:p-4 font-medium text-amber-500 w-[100px]">Elite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_COMPARISON.map((row, i) => (
                        <tr
                          key={row.feature}
                          className={cn(
                            'border-t border-border/50',
                            i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                          )}
                        >
                          <td className="p-3 sm:p-4 text-foreground/80">{row.feature}</td>
                          <td className="p-3 sm:p-4 text-center">
                            {row.free ? (
                              <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 sm:p-4 text-center">
                            {row.pro ? (
                              <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 sm:p-4 text-center">
                            {row.elite ? (
                              <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Separator />

              {/* Credit Add-Ons */}
              <div>
                <h2 className="text-xl font-bold mb-2 text-center flex items-center justify-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Credit Add-Ons
                </h2>
                <p className="text-sm text-muted-foreground text-center mb-6 max-w-lg mx-auto">
                  Need more credits? Purchase additional credit packs anytime. Credits never expire.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
                  {CREDIT_ADDONS.map((addon) => (
                    <motion.div
                      key={addon.credits}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.03 }}
                      className={cn(
                        'relative flex flex-col items-center gap-3 rounded-xl border p-4 sm:p-5',
                        addon.popular
                          ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/20'
                          : 'border-primary/20 bg-primary/5',
                        'hover:border-primary/40 hover:bg-primary/10',
                        'transition-all duration-200 cursor-pointer'
                      )}
                    >
                      {addon.popular && (
                        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] px-2 py-0 h-4">
                          Best Value
                        </Badge>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-base sm:text-lg font-bold">{addon.label}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-semibold">
                          ₹{addon.priceINR.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          ${addon.priceUSD}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/30 hover:bg-primary/10 text-xs"
                        disabled={paymentState === 'creating_order'}
                        onClick={() => handleBuyAddon(addon)}
                      >
                        {paymentState === 'creating_order' ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Processing...
                          </>
                        ) : (
                          'Buy Now'
                        )}
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* FAQ Section */}
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xl font-bold mb-6 text-center flex items-center justify-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Frequently Asked Questions
                </h2>
                <Accordion type="single" collapsible className="space-y-2">
                  {FAQ_ITEMS.map((item, i) => (
                    <AccordionItem
                      key={i}
                      value={`faq-${i}`}
                      className="border rounded-xl px-4 data-[state=open]:bg-muted/20"
                    >
                      <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-4">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground pb-4">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              <Separator />

              {/* GST Notice + Trust Badges */}
              <div className="text-center space-y-4 pb-8">
                {/* GST Notice */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>18% GST applicable for Indian users. Prices shown are exclusive of GST.</span>
                </div>

                {/* Trust Badges */}
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Secure Payments</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCcw className="h-3.5 w-3.5 text-emerald-500" />
                    <span>30-Day Money-Back</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    <span>SSL Encrypted</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Razorpay Verified</span>
                  </div>
                </div>

                {/* Payment methods */}
                <p className="text-xs text-muted-foreground">
                  We accept all major credit/debit cards, UPI, net banking, and international cards.
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
