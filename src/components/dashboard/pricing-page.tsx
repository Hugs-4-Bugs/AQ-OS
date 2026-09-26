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
  Clock,
  Lock,
  BadgeCheck,
  RefreshCcw,
  Star,
  Loader2,
  CheckCircle2,
  XCircle,
  LifeBuoy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import SupportRequestDialog from '@/components/support/support-request-dialog';
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
import { usePlanAvailability, isPlanCheckoutAvailable } from '@/hooks/use-plan-availability';

interface PricingPageProps {
  currentPlan: PlanType;
  onSelectPlan: (plan: PlanType, billingCycle: 'monthly' | 'yearly') => void;
}

const PLAN_ORDER: PlanType[] = ['free', 'starter', 'pro', 'elite'];

// Yearly savings vs monthly (from PLAN_DETAILS — Starter monthly price
// update, Sep 2026). Starter's monthly × 12 (₹399 × 12 = ₹4,788) is now
// LESS than its yearly price (₹4,999), so the "savings" is negative —
// the savings badge is hidden for any plan whose savings ≤ 0.
//   Starter: ₹399 * 12 - ₹4,999 = ₹-211 (yearly costs more — badge hidden)
//   Pro:     ₹1,599 * 12 - ₹14,999 = ₹4,189 · Elite: ₹17,389
const YEARLY_SAVINGS_INR: Record<'starter' | 'pro' | 'elite', number> = {
  starter: -211,
  pro: 4189,
  elite: 17389,
};

// Monthly equivalent for yearly plans (rounded down for display):
//   Starter ₹416 · Pro ₹1,249 · Elite ₹3,749
const YEARLY_MONTHLY_EQUIV_INR: Record<'starter' | 'pro' | 'elite', number> = {
  starter: 416,
  pro: 1249,
  elite: 3749,
};

// Feature comparison for the table
const FEATURE_COMPARISON = [
  { feature: 'Lead Discovery', free: true, starter: true, pro: true, elite: true },
  { feature: 'Deep Lead Analysis', free: false, starter: false, pro: true, elite: true },
  { feature: 'Outreach Messages', free: true, starter: true, pro: true, elite: true },
  { feature: 'Outreach Sequences', free: false, starter: false, pro: true, elite: true },
  { feature: 'Sales Coaching', free: false, starter: false, pro: true, elite: true },
  { feature: 'Proposal Generation', free: false, starter: false, pro: true, elite: true },
  { feature: 'Competitor Analysis', free: false, starter: false, pro: true, elite: true },
  { feature: 'Data Export (PDF)', free: false, starter: false, pro: true, elite: true },
  { feature: 'White-Label Reports', free: false, starter: false, pro: false, elite: true },
  { feature: 'Team Collaboration', free: false, starter: false, pro: false, elite: true },
  { feature: 'Custom Integrations', free: false, starter: false, pro: false, elite: true },
  { feature: 'API Access', free: false, starter: false, pro: true, elite: true },
  { feature: 'Priority Support', free: false, starter: false, pro: true, elite: true },
  { feature: 'Dedicated Account Manager', free: false, starter: false, pro: false, elite: true },
];

// Credit add-ons — AcquisitionOS credit add-on packs (final add-on
// pricing update, Sep 2026). 4 packs: 250 / 500 / 1,000 / 2,500 credits.
// Prices shown are exclusive of 18% GST. Stripe one-time Price IDs are
// looked up server-side from env (STRIPE_PRICE_CREDITS_250_ID,
// STRIPE_PRICE_CREDITS_500_ID, STRIPE_PRICE_CREDITS_1000_ID,
// STRIPE_PRICE_CREDITS_2500_ID) — never hardcoded client-side.
const CREDIT_ADDONS = [
  { credits: 250, priceINR: 599, priceUSD: 7, label: 'Starter Pack', badge: null as string | null },
  { credits: 500, priceINR: 999, priceUSD: 12, label: 'Growth Pack', badge: null as string | null },
  { credits: 1000, priceINR: 1799, priceUSD: 22, label: 'Pro Pack', badge: null as string | null },
  { credits: 2500, priceINR: 3999, priceUSD: 48, label: 'Power Pack', badge: 'Best Value' as string | null },
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

// Inline notice shown under a paid plan's CTA ONLY when the plan/cycle's
// provider configuration (Stripe Price ID env var + Razorpay keys) is
// actually missing. FINAL PAYMENT ACTIVATION ARCHITECTURE: distinguishes
// APPLICATION IMPLEMENTATION (complete for Starter/Pro/Elite) from
// PROVIDER CONFIGURATION (required). Every paid plan keeps a real,
// ENABLED purchase action — the generic "Coming Soon" state no longer
// exists for paid plans. No raw env var names or secrets are exposed.
function planConfigNotice(planType: PlanType): string {
  const name = planType === 'starter' ? 'Starter' : planType === 'pro' ? 'Pro' : 'Elite';
  return `${name} checkout implemented — payment provider configuration required`;
}

function PricingPlanCard({
  planType,
  isYearly,
  isCurrent,
  isPopular,
  onSelect,
  isProcessing,
  currentPlan,
  checkoutAvailable,
  onContactSupport,
}: {
  planType: PlanType;
  isYearly: boolean;
  isCurrent: boolean;
  isPopular: boolean;
  onSelect: () => void;
  isProcessing: boolean;
  currentPlan: PlanType;
  /** null = unknown; false = provider configuration missing for this
   * plan/cycle (shows the config-required notice — the CTA stays enabled). */
  checkoutAvailable: boolean | null;
  /** Opens the REAL support request dialog ("Contact Support" CTA on
   * lower plan cards). */
  onContactSupport: () => void;
}) {
  const details = PLAN_DETAILS[planType];
  const priceINR = isYearly ? details.yearlyINR : details.priceINR;
  const priceUSD = isYearly ? details.yearlyUSD : details.priceUSD;
  const period = isYearly ? '/year' : '/month';

  const cardGradients: Record<PlanType, string> = {
    free: 'from-slate-500/10 via-card to-card',
    starter: 'from-teal-400/10 via-card to-card',
    pro: 'from-primary/10 via-card to-card',
    elite: 'from-amber-500/10 via-card to-card',
  };

  const borderColors: Record<PlanType, string> = {
    free: 'border-border',
    starter: 'border-teal-400/40',
    pro: 'border-primary/40',
    elite: 'border-amber-500/40',
  };

  const iconColors: Record<PlanType, string> = {
    free: 'text-muted-foreground',
    starter: 'text-teal-500',
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

        {/* Price — flex-wrap keeps price + period inside narrow cards. */}
        <div className="flex flex-wrap items-baseline gap-1">
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
            ₹{YEARLY_MONTHLY_EQUIV_INR[planType as 'starter' | 'pro' | 'elite']?.toLocaleString('en-IN')}/month billed annually
          </p>
        )}
        {priceUSD > 0 && (
          <span className="text-xs text-muted-foreground block">
            ${priceUSD}{period}
          </span>
        )}
        {/* Yearly savings badge — whitespace-normal so the text wraps
            inside the card instead of overflowing (Badge defaults to
            whitespace-nowrap). Hidden when the yearly price no longer
            saves money vs monthly (e.g. Starter after the ₹399 update). */}
        {isYearly && priceINR > 0 && (YEARLY_SAVINGS_INR[planType as 'starter' | 'pro' | 'elite'] ?? 0) > 0 && (
          <Badge variant="secondary" className="mt-2 max-w-full whitespace-normal leading-snug text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Save ₹{YEARLY_SAVINGS_INR[planType as 'starter' | 'pro' | 'elite']?.toLocaleString('en-IN')}/year vs monthly
          </Badge>
        )}
      </div>

      {/* Credits */}
      <div className="mb-5 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
        <Zap className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold min-w-0">
          {details.creditsMonthly.toLocaleString()} credits/month
        </span>
      </div>

      {/* Features list — min-w-0 + break-words keeps long feature names
          wrapped inside the card. */}
      <div className="flex-1 space-y-2.5 mb-6">
        {details.features.map((feature) => (
          <div key={feature} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-sm text-foreground/80 min-w-0 break-words [overflow-wrap:anywhere]">{feature}</span>
          </div>
        ))}
        {details.disabledFeatures.slice(0, 3).map((feature) => (
          <div key={feature} className="flex items-start gap-2 opacity-40">
            <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground line-through min-w-0 break-words [overflow-wrap:anywhere]">{feature}</span>
          </div>
        ))}
      </div>

      {/* CTA Button — PART 2: no self-serve downgrade. Lower plans open
          the REAL support request dialog (ticket flow) instead of a
          mailto. whitespace-normal lets the label wrap inside the card.
          FINAL PAYMENT ACTIVATION ARCHITECTURE: Starter, Pro and Elite
          are all ACTIVE paid plans — there is no "Coming Soon" state.
          When the provider configuration is missing the card keeps its
          real, enabled purchase action and shows the provider-
          configuration notice; the server reports the missing
          configuration honestly if checkout is attempted. */}
      {PLAN_ORDER.indexOf(planType) < PLAN_ORDER.indexOf(currentPlan) && !isCurrent ? (
        <Button
          variant="outline"
          className={cn(
            'w-full gap-2 font-semibold whitespace-normal leading-snug min-h-[44px]',
            'bg-muted/40 text-muted-foreground border-muted hover:bg-muted hover:text-foreground',
          )}
          onClick={onContactSupport}
        >
          <LifeBuoy className="h-4 w-4 shrink-0" />
          Contact Support
        </Button>
      ) : (
        <Button
          variant={planType === 'free' ? 'outline' : 'default'}
          className={cn(
            'w-full gap-2 font-semibold whitespace-normal leading-snug min-h-[44px]',
            planType === 'elite' && 'bg-amber-600 hover:bg-amber-700 text-white',
            planType === 'starter' && 'bg-teal-600 hover:bg-teal-700 text-white',
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
              {planType === 'starter'
                ? 'Get Started'
                : planType === 'pro'
                ? 'Upgrade to Pro'
                : isYearly
                ? 'Upgrade to Elite Annual'
                : 'Upgrade to Elite'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      )}

      {/* Provider-configuration notice — all paid plans. The CTA above stays
          enabled; clicking it reaches the server which reports the missing
          provider configuration honestly. No fake payment path. Not shown
          when the plan is the user's current plan. */}
      {planType !== 'free' && !isCurrent && checkoutAvailable === false && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground flex items-start gap-1.5" role="note">
          <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{planConfigNotice(planType)}</span>
        </p>
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
  // ─── "Contact Support" support-request dialog state ────────────────
  const [supportRequestOpen, setSupportRequestOpen] = useState(false);

  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);

  // Per-plan/cycle provider configuration status — when false, the paid
  // plan card shows the "checkout implemented — payment provider
  // configuration required" notice under an ENABLED CTA. Paid plans are
  // always ACTIVE; there is no "Coming Soon" state. Server-side checkout
  // routes remain the real enforcement point.
  const planAvailability = usePlanAvailability();

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

  // Handle credit add-on purchase — canonical credit add-on checkout
  // (Branch B of POST /api/payments/create-checkout-session, the same
  // flow the upgrade modal uses). Stripe returns a hosted-checkout URL
  // to redirect to; Razorpay returns a server-created one-time order
  // opened via the existing Razorpay Checkout.js helper. The credit
  // amount is validated server-side; no second payment flow exists here.
  const handleBuyAddon = useCallback(async (addon: typeof CREDIT_ADDONS[number]) => {
    setPaymentState('creating_order');
    setPaymentError('');

    try {
      const res = await fetch('/api/payments/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'credits', creditAmount: addon.credits }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create add-on checkout');
      }

      const data = await res.json();

      // Stripe (default): hosted checkout redirect
      if (data.url) {
        setPaymentState('checkout');
        window.location.href = data.url;
        return;
      }

      // Razorpay: open Checkout.js with the server-created order
      if (data.gateway === 'razorpay' && data.razorpayOrderId) {
        openRazorpayCheckout({
          razorpayOrderId: data.razorpayOrderId,
          razorpayKeyId: data.razorpayKeyId,
          razorpayAmount: data.razorpayAmount,
          razorpayCurrency: data.razorpayCurrency || 'INR',
          userName: data.prefill?.name || '',
          userEmail: data.prefill?.email || '',
          orderId: data.orderId,
        });
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
                    Save up to ₹17,389/year
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))] gap-6 lg:gap-8">
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
                    checkoutAvailable={isPlanCheckoutAvailable(planAvailability, planType, isYearly ? 'yearly' : 'monthly')}
                    onContactSupport={() => setSupportRequestOpen(true)}
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
                        <th className="text-center p-3 sm:p-4 font-medium text-teal-500 w-[100px]">Starter</th>
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
                            {row.starter ? (
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
                  Need more credits? Top up anytime. Credits never expire and work across all features.
                </p>
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
                  {CREDIT_ADDONS.map((addon) => {
                    const addonGst = Math.round(addon.priceINR * 0.18);
                    const addonTotal = addon.priceINR + addonGst;
                    return (
                      <motion.div
                        key={addon.credits}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.03 }}
                        className={cn(
                          'relative flex flex-col items-center gap-2.5 rounded-xl border p-4 sm:p-5 min-w-0',
                          addon.badge
                            ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/25'
                            : 'border-primary/20 bg-primary/5',
                          'hover:border-primary/40 hover:bg-primary/10',
                          'transition-all duration-200'
                        )}
                      >
                        {addon.badge && (
                          <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] px-2 py-0 h-4 whitespace-nowrap max-w-full">
                            {addon.badge}
                          </Badge>
                        )}
                        {/* 1. Pack label */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Zap className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm sm:text-base font-bold text-center leading-tight">{addon.label}</span>
                        </div>
                        {/* 2. Credit amount — large and prominent */}
                        <div className="text-2xl font-extrabold text-primary leading-none text-center">
                          {addon.credits.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-muted-foreground -mt-1">Credits</div>
                        {/* 3-6. Base price / GST / total / USD equivalent */}
                        <div className="text-center">
                          <span className="text-base font-semibold">
                            ₹{addon.priceINR.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            +₹{addonGst.toLocaleString('en-IN')} GST
                          </span>
                          <span className="text-sm font-bold text-foreground block">
                            ₹{addonTotal.toLocaleString('en-IN')} total
                          </span>
                          <span className="text-[11px] text-muted-foreground block">
                            ~${addon.priceUSD}
                          </span>
                        </div>
                        {/* 7. Buy Now — canonical credit add-on checkout */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/30 hover:bg-primary/10 text-xs w-full"
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
                        {/* 8. Expiration message */}
                        <p className="text-[11px] text-muted-foreground text-center leading-tight">
                          Credits never expire
                        </p>
                      </motion.div>
                    );
                  })}
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

      {/* REAL support request flow — "Contact Support" on lower plan cards
          opens this ticket dialog. Creates a real persisted ticket. */}
      <SupportRequestDialog
        open={supportRequestOpen}
        onOpenChange={setSupportRequestOpen}
        category="billing"
        subcategory="downgrade_plan"
        currentPlan={currentPlan}
        billingCycle={isYearly ? 'yearly' : 'monthly'}
        source="pricing_modal"
        subject="Plan change request"
        priority="NORMAL"
      />
    </div>
  );
}
