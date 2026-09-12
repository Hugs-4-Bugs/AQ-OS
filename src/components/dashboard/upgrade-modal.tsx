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
  Loader2,
  BadgeCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Mail,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Credit add-on packs — AcquisitionOS (Sep 2026).
// These INR amounts are DISPLAY ONLY. The actual Stripe Price ID used at
// checkout is read server-side from STRIPE_PRICE_CREDITS_100_ID,
// STRIPE_PRICE_CREDITS_500_ID, STRIPE_PRICE_CREDITS_1000_ID — NEVER
// hardcoded in the client. See PART 4 of SUBSCRIPTION-PAYMENT-FIX-20260909.
const CREDIT_ADDONS = [
  { credits: 100, priceINR: 499, priceUSD: 6, label: '100 Credits' },
  { credits: 500, priceINR: 1999, priceUSD: 24, label: '500 Credits' },
  { credits: 1000, priceINR: 3499, priceUSD: 42, label: '1,000 Credits' },
];

// Yearly savings vs monthly (precomputed from PLAN_DETAILS).
//   Pro:   ₹1,599 * 12 - ₹11,999 = ₹7,189
//   Elite: ₹5,199 * 12 - ₹37,999 = ₹24,389
const YEARLY_SAVINGS_INR: Record<'pro' | 'elite', number> = {
  pro: 7189,
  elite: 24389,
};

// Monthly equivalent for yearly plans (rounded down for display).
//   Pro:   ₹11,999 / 12 ≈ ₹999.92 → ₹999
//   Elite: ₹37,999 / 12 ≈ ₹3,166.58 → ₹3,166
const YEARLY_MONTHLY_EQUIV_INR: Record<'pro' | 'elite', number> = {
  pro: 999,
  elite: 3166,
};

// Contact-support mailto — used by the "Contact Support" CTA on lower
// plan cards. No self-serve downgrade is ever exposed in the UI.
const SUPPORT_MAILTO =
  'mailto:support@acquisitionos.com?subject=Plan%20change%20request';

// ─── Plan button state matrix ────────────────────────────────────────
// Implements PART 2 of SUBSCRIPTION-PAYMENT-FIX-20260909. Downgrades are
// never self-serve — they show "Contact Support" (mailto) instead.
// (force-recompile marker v2 — turbopack was serving a stale chunk that
//  crashed on the Free card in yearly mode.)
type PlanBtnKind = 'current' | 'switch-annual' | 'upgrade' | 'support';
interface PlanBtnState {
  kind: PlanBtnKind;
  label: string;
  disabled: boolean;
}
function computePlanButtonState(
  currentPlan: PlanType,
  currentBillingCycle: 'monthly' | 'yearly',
  planType: PlanType,
  isYearly: boolean,
): PlanBtnState {
  const currentIsYearly = currentBillingCycle === 'yearly';
  const planName = planType === 'free' ? 'Free' : planType === 'pro' ? 'Pro' : 'Elite';

  // ─── SAME PLAN ───
  if (planType === currentPlan) {
    // FIX (2026-09-09): the Free plan has no billing cycle and no yearly
    // variant — it is always just "Current Plan". Previously the free card
    // fell into the switch-annual branch below and
    // YEARLY_SAVINGS_INR['free'] was undefined →
    // "Cannot read properties of undefined (reading 'toLocaleString')"
    // crash the moment the user toggled the Yearly switch.
    if (planType === 'free') {
      return { kind: 'current', label: 'Current Plan', disabled: true };
    }
    if (isYearly === currentIsYearly) {
      return { kind: 'current', label: 'Current Plan', disabled: true };
    }
    if (isYearly && !currentIsYearly) {
      // Monthly → Yearly switch on the same plan (Pro/Elite only — the
      // free plan returned above, so the lookup is always defined).
      const savings = YEARLY_SAVINGS_INR[planType as 'pro' | 'elite'];
      return {
        kind: 'switch-annual',
        label: `Switch to Annual — Save ₹${savings.toLocaleString('en-IN')}`,
        disabled: false,
      };
    }
    // Yearly user viewing the monthly card on the same plan — per spec,
    // show "Current Plan" (no monthly downgrade is offered in the UI).
    return { kind: 'current', label: 'Current Plan', disabled: true };
  }

  // ─── HIGHER PLAN — upgrade ───
  const currentLevel = PLAN_ORDER.indexOf(currentPlan);
  const thisLevel = PLAN_ORDER.indexOf(planType);
  if (thisLevel > currentLevel) {
    if (currentPlan === 'free') {
      // Free → Pro / Elite (any cycle): "Upgrade to Pro" / "Upgrade to Elite"
      return { kind: 'upgrade', label: `Upgrade to ${planName}`, disabled: false };
    }
    if (currentPlan === 'pro' && planType === 'elite') {
      return {
        kind: 'upgrade',
        label: isYearly ? 'Upgrade to Elite Annual' : 'Upgrade to Elite',
        disabled: false,
      };
    }
    return { kind: 'upgrade', label: `Upgrade to ${planName}`, disabled: false };
  }

  // ─── LOWER PLAN — Contact Support (no self-serve downgrade, ever) ───
  // Per spec, Pro Monthly → Free gets the explicit "Contact Support to
  // Downgrade" label; every other downgrade case says "Contact Support".
  if (currentPlan === 'pro' && !currentIsYearly && planType === 'free') {
    return { kind: 'support', label: 'Contact Support to Downgrade', disabled: false };
  }
  return { kind: 'support', label: 'Contact Support', disabled: false };
}

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

const PLAN_ORDER: PlanType[] = ['free', 'pro', 'elite'];

// Payment state type
type PaymentState = 'idle' | 'creating_order' | 'checkout' | 'verifying' | 'success' | 'failed';

// Coupon type
interface CouponInfo {
  code: string;
  discountPercent: number;
  valid: boolean;
}

function PlanCard({
  planType,
  isYearly,
  isPopular,
  coupon,
  onSelect,
  isProcessing,
  currentPlan,
  currentBillingCycle,
}: {
  planType: PlanType;
  isYearly: boolean;
  isPopular: boolean;
  coupon: CouponInfo | null;
  onSelect: () => void;
  isProcessing: boolean;
  currentPlan: PlanType;
  currentBillingCycle: 'monthly' | 'yearly';
}) {
  const details = PLAN_DETAILS[planType];
  // Defensive: if a planType isn't in PLAN_DETAILS, fall back to free-shaped
  // zeros so none of the .toLocaleString() calls below crash on undefined.
  const basePriceINR = isYearly ? (details?.yearlyINR ?? 0) : (details?.priceINR ?? 0);
  const basePriceUSD = isYearly ? (details?.yearlyUSD ?? 0) : (details?.priceUSD ?? 0);
  const period = isYearly ? '/year' : '/month';

  // Apply coupon discount
  const discountPercent = coupon?.valid ? coupon.discountPercent : 0;
  const priceINR = basePriceINR > 0 ? Math.round(basePriceINR * (1 - discountPercent / 100)) : 0;
  const priceUSD = basePriceUSD > 0 ? Math.round(basePriceUSD * (1 - discountPercent / 100)) : 0;

  // GST calculation (18% for Indian users)
  const gstINR = priceINR > 0 ? Math.round(priceINR * 0.18) : 0;
  const totalINR = priceINR + gstINR;

  // PART 2 — button state matrix (no self-serve downgrade).
  const buttonState = computePlanButtonState(currentPlan, currentBillingCycle, planType, isYearly);
  const isCurrent = buttonState.kind === 'current';

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
        'relative flex flex-col rounded-2xl border-2 p-5 transition-all duration-300',
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

      {/* Header — plan name (font-bold, text-foreground) per PART 6 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          {planType === 'elite' ? (
            <Crown className={cn('h-5 w-5', iconColors[planType])} />
          ) : (
            <Zap className={cn('h-5 w-5', iconColors[planType])} fill="currentColor" />
          )}
          <h3 className="text-lg font-bold text-foreground">{details.name}</h3>
        </div>

        {/* Price — font-extrabold text-foreground per PART 6 */}
        <div className="flex items-baseline gap-1">
          {priceINR === 0 ? (
            <span className="text-3xl font-extrabold text-foreground">Free</span>
          ) : (
            <>
              {coupon?.valid && discountPercent > 0 && (
                <span className="text-lg text-muted-foreground line-through mr-1">
                  ₹{basePriceINR.toLocaleString('en-IN')}
                </span>
              )}
              <span className="text-2xl font-extrabold text-foreground">
                ₹{priceINR.toLocaleString('en-IN')}
              </span>
              <span className="text-sm text-muted-foreground">{period}</span>
            </>
          )}
        </div>
        {/* "₹X/month billed annually" sub-line for yearly plans (PART 1) */}
        {isYearly && priceINR > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            ₹{YEARLY_MONTHLY_EQUIV_INR[planType as 'pro' | 'elite']?.toLocaleString('en-IN')}/month billed annually
          </p>
        )}
        {priceUSD > 0 && (
          <span className="text-xs text-muted-foreground block">
            ${priceUSD}{period}
          </span>
        )}
        {/* Yearly savings badge — exact text per PART 1 */}
        {isYearly && priceINR > 0 && (
          <Badge variant="secondary" className="mt-1.5 text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Save ₹{YEARLY_SAVINGS_INR[planType as 'pro' | 'elite']?.toLocaleString('en-IN')}/year vs monthly
          </Badge>
        )}
        {coupon?.valid && discountPercent > 0 && priceINR > 0 && (
          <Badge variant="secondary" className="mt-1.5 text-[10px] bg-primary/10 text-primary border-primary/20 gap-0.5">
            <BadgeCheck className="h-2.5 w-2.5" />
            {discountPercent}% off applied
          </Badge>
        )}
        {/* GST breakdown — 12px muted-foreground, total line font-bold text-foreground per PART 6 */}
        {priceINR > 0 && (
          <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between">
              <span>Base price</span>
              <span>₹{priceINR.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (18%)</span>
              <span>₹{gstINR.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between font-bold text-foreground border-t border-border pt-0.5">
              <span>Total</span>
              <span>₹{totalINR.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Credits */}
      <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {details.creditsMonthly.toLocaleString()} credits/month
        </span>
      </div>

      {/* Features list — themed foreground / muted-foreground per PART 6.
          Crossed-out features use opacity-50 (not opacity-40) for AA contrast. */}
      <div className="flex-1 space-y-2 mb-5">
        {details.features.map((feature) => (
          <div key={feature} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-sm text-foreground/80">{feature}</span>
          </div>
        ))}
        {details.disabledFeatures.slice(0, 3).map((feature) => (
          <div key={feature} className="flex items-start gap-2 opacity-50">
            <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground line-through">{feature}</span>
          </div>
        ))}
      </div>

      {/* CTA Button — driven by the PART 2 state matrix.
          'support' renders as an anchor (mailto:) so the user can click
          through to their mail client. Other kinds render as a Button. */}
      {buttonState.kind === 'support' ? (
        <Button
          asChild
          variant="outline"
          className={cn(
            'w-full gap-2 font-semibold',
            'bg-muted/40 text-muted-foreground border-muted hover:bg-muted hover:text-foreground',
          )}
        >
          <a href={SUPPORT_MAILTO}>
            <Mail className="h-4 w-4" />
            {buttonState.label}
          </a>
        </Button>
      ) : (
        <Button
          variant={buttonState.kind === 'current' ? 'outline' : 'default'}
          className={cn(
            'w-full gap-2 font-semibold',
            // Teal accent for "Switch to Annual — Save ₹X"
            buttonState.kind === 'switch-annual' && 'bg-teal-600 hover:bg-teal-700 text-white',
            // PART 2 — all upgrade buttons are blue/primary (the previous
            // amber override for Elite was removed per spec).
            // Current plan: emerald disabled
            buttonState.kind === 'current' && 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-default',
          )}
          disabled={buttonState.disabled || isProcessing}
          onClick={onSelect}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : buttonState.kind === 'current' ? (
            <>
              <Shield className="h-4 w-4" />
              {buttonState.label}
            </>
          ) : (
            <>
              {buttonState.label}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </motion.div>
  );
}

export default function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const [isYearly, setIsYearly] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponInfo | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [processingPlan, setProcessingPlan] = useState<PlanType | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState('');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  // Locks the modal while a real Stripe redirect is in flight. While true,
  // outside-click / Escape / the X close button are all disabled so the
  // user can't accidentally abandon a checkout session. Outside-click is
  // ALSO blocked when no payment is in progress (the modal only closes via
  // the X button). See PART 3 of SUBSCRIPTION-PAYMENT-FIX-20260909.
  const [paymentInProgress, setPaymentInProgress] = useState(false);

  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const currentBillingCycle = useSubscriptionStore((s) => s.billingCycle);
  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);

  // Reset state when modal closes
  useEffect(() => {
    if (!open && !paymentInProgress) {
      setProcessingPlan(null);
      setPaymentState('idle');
      setPaymentError('');
      setLastOrderId(null);
      setCoupon(null);
      setCouponCode('');
      setCouponError('');
    }
  }, [open, paymentInProgress]);

  // Handle URL params for payment callback (Stripe redirect back).
  //   ?payment=success       → subscription upgrade success
  //   ?credits_added=true    → credit add-on success
  //   ?payment=cancelled     → user cancelled on Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const creditsAdded = params.get('credits_added');
    if (paymentStatus === 'success' && open) {
      setPaymentState('verifying');
      verifyPaymentAndSync();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (creditsAdded === 'true' && open) {
      // Credit add-on success — re-sync to pick up the new balance.
      setPaymentState('verifying');
      verifyPaymentAndSync();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'cancelled' && open) {
      setPaymentInProgress(false);
      setPaymentState('idle');
      setProcessingPlan(null);
      toast.info('Payment cancelled');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [open]);

  // Verify payment and sync subscription data from backend. The only
  // legitimate way to activate a subscription or add credits is the
  // Stripe webhook. This function just re-syncs the local subscription
  // store so the UI reflects the change the webhook has already made.
  const verifyPaymentAndSync = useCallback(async () => {
    try {
      const subRes = await fetch('/api/subscriptions/current', {
        credentials: 'include',
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        syncFromBackend(subData);
        setPaymentState('success');
        setPaymentInProgress(false);
      } else {
        setPaymentState('failed');
        setPaymentError('Could not verify payment status. Please refresh the page.');
        setPaymentInProgress(false);
      }
    } catch {
      setPaymentState('failed');
      setPaymentError('Network error while verifying payment. Please check your subscription status.');
      setPaymentInProgress(false);
    }
  }, [syncFromBackend]);

  // Coupon validation — calls the correct API endpoint
  const handleApplyCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');

    try {
      const res = await fetch('/api/payments/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim(), plan: 'pro' }),
      });

      if (res.ok) {
        const data = await res.json();
        setCoupon({
          code: couponCode.trim().toUpperCase(),
          discountPercent: data.discountPercent || data.discountValue || 0,
          valid: true,
        });
        toast.success(`Coupon "${couponCode.trim().toUpperCase()}" applied!`);
      } else {
        const data = await res.json().catch(() => ({}));
        setCouponError(data.error || 'Invalid coupon code');
        setCoupon(null);
      }
    } catch {
      // Network error — show a clear error instead of silently simulating
      // a known coupon. There is NO offline fallback for coupon validation.
      setCouponError('Network error. Could not validate coupon code. Please try again.');
      setCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode]);

  // Handle plan selection — the main payment flow.
  // Routes to REAL Stripe checkout via POST /api/payments/create-checkout-session.
  // No mock payment, no fake success, no dev-mode simulation. The server
  // creates a real Stripe Checkout Session and returns { url } — the client
  // just redirects. The Stripe webhook is the only path that activates the
  // subscription and updates credits in the DB.
  const handleSelectPlan = useCallback(async (plan: PlanType) => {
    // "Contact Support" / "Current Plan" should never reach this handler
    // (the UI prevents it). Guard anyway: if same plan + same billing cycle,
    // it's a no-op.
    if (plan === currentPlan) {
      const currentIsYearly = currentBillingCycle === 'yearly';
      if (isYearly === currentIsYearly) return;
    }
    setProcessingPlan(plan);
    setPaymentState('creating_order');
    setPaymentError('');
    setPaymentInProgress(true);

    try {
      const res = await fetch('/api/payments/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          billingCycle: isYearly ? 'yearly' : 'monthly',
          couponCode: coupon?.valid ? coupon.code : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create Stripe checkout session');
      }

      const data = await res.json();
      setLastOrderId(data.orderId);

      // Stripe: redirect to checkout page. The server returns a real
      // Stripe Checkout URL — no mock fallback exists.
      if (data.url) {
        setPaymentState('checkout');
        // paymentInProgress stays true during the browser navigation;
        // the success/cancel callback after Stripe redirects back will
        // reset it.
        window.location.href = data.url;
        return;
      }

      throw new Error('No Stripe checkout URL returned');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process upgrade';
      setPaymentState('failed');
      setPaymentError(message);
      toast.error(message);
      setProcessingPlan(null);
      setPaymentInProgress(false);
    }
  }, [currentPlan, currentBillingCycle, isYearly, coupon]);

  // Handle credit add-on purchase — uses POST /api/payments/create-checkout-session
  // with `type: 'credits'` and a one-time Stripe Price ID (mode='payment').
  // The priceId is looked up server-side from STRIPE_PRICE_CREDITS_<amount>_ID
  // — never trusted from the client. The Stripe webhook's
  // `checkout.session.completed` handler routes the resulting event through
  // `fulfillCreditAddon` which adds the credits atomically + sends an
  // in-app notification + a confirmation email. See PART 4.
  const handleBuyAddon = useCallback(async (addon: typeof CREDIT_ADDONS[number]) => {
    setPaymentState('creating_order');
    setPaymentError('');
    setPaymentInProgress(true);

    try {
      const res = await fetch('/api/payments/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'credits',
          creditAmount: addon.credits,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // The user-facing error from the server is honest:
        //   "Stripe is not configured. Set STRIPE_SECRET_KEY." (500) when
        //   STRIPE_SECRET_KEY is missing.
        //   "Stripe price ID for credit add-on (X credits) is not
        //    configured. Set STRIPE_PRICE_CREDITS_X_ID." (500) when the
        //   specific credit-price env var is missing.
        // The previous generic "Failed to create add-on order" is gone.
        throw new Error(data.error || 'Failed to create credit add-on checkout session');
      }

      const data = await res.json();

      if (data.url) {
        setPaymentState('checkout');
        window.location.href = data.url;
        return;
      }

      throw new Error('No Stripe checkout URL returned');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to purchase add-on';
      setPaymentState('failed');
      setPaymentError(message);
      toast.error(message);
      setPaymentInProgress(false);
    }
  }, []);

  // Handle retry after failure
  const handleRetry = useCallback(() => {
    setPaymentState('idle');
    setPaymentError('');
    setProcessingPlan(null);
  }, []);

  // Render payment success state — shows a plan-specific welcome message
  // per PART 5 ("Welcome to [Plan Name]! Your plan is now active.").
  const renderSuccessState = () => {
    const planName =
      currentPlan === 'free' ? 'Free' :
      currentPlan === 'pro' ? 'Pro' : 'Elite';
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        </motion.div>
        <h3 className="text-xl font-bold text-foreground">Welcome to {planName}!</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Your plan is now active. You can close this dialog and continue
          using AcquisitionOS.
        </p>
        <Button onClick={() => onOpenChange(false)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Continue
        </Button>
      </div>
    );
  }

  // Render payment failed state
  const renderFailedState = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <XCircle className="h-16 w-16 text-red-500" />
      </motion.div>
      <h3 className="text-xl font-bold text-foreground">Payment Failed</h3>
      <p className="text-muted-foreground text-center max-w-md">
        {paymentError || 'Your payment could not be processed. Please try again.'}
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleRetry} className="gap-2">
          Try Again
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  // Render verifying state
  const renderVerifyingState = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Loader2 className="h-12 w-12 text-primary animate-spin" />
      <h3 className="text-lg font-semibold text-foreground">Verifying Payment...</h3>
      <p className="text-sm text-muted-foreground">
        Please wait while we confirm your payment and activate your subscription.
      </p>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (paymentInProgress) return;
        onOpenChange(v);
      }}
    >
      <DialogContent
        // PART 6 — modal background uses bg-card (NOT hardcoded
        // white/black) and border border-border so it adapts to the active
        // theme (light or dark) automatically.
        className="max-w-5xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden bg-card border border-border"
        // PART 3 — X button stays VISIBLE but is DISABLED while a payment
        // is in flight ("Disable the X button too"), with the notice
        // "Complete or cancel payment to close" rendered below the header.
        showCloseButton
        closeButtonDisabled={paymentInProgress}
        // PART 3 — modal must NOT close when user clicks outside it. Only
        // the X button (and Escape when no payment is in progress) closes
        // the modal. Always preventDefault on outside interaction — not
        // just during payment.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (paymentInProgress) e.preventDefault();
        }}
      >
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold gradient-text">
            Choose Your Plan
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Unlock the full power of AI-driven client acquisition
          </DialogDescription>
          {paymentInProgress && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Shield className="h-3 w-3 shrink-0" />
              Complete or cancel payment to close
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="p-6 space-y-8">
            {/* Payment state overlays */}
            <AnimatePresence mode="wait">
              {paymentState === 'success' ? (
                renderSuccessState()
              ) : paymentState === 'failed' ? (
                renderFailedState()
              ) : paymentState === 'verifying' ? (
                renderVerifyingState()
              ) : (
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
                  {/* Billing toggle savings badge */}
                    {isYearly && (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {PLAN_ORDER.map((planType) => (
                      <PlanCard
                        key={planType}
                        planType={planType}
                        isYearly={isYearly}
                        isPopular={planType === 'pro'}
                        coupon={coupon}
                        onSelect={() => handleSelectPlan(planType)}
                        isProcessing={processingPlan === planType || paymentState === 'creating_order'}
                        currentPlan={currentPlan}
                        currentBillingCycle={currentBillingCycle}
                      />
                    ))}
                  </div>

                  {/* Coupon Code Input */}
                  <div className="max-w-sm mx-auto">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Have a coupon code?"
                          value={couponCode}
                          onChange={(e) => {
                            setCouponCode(e.target.value.toUpperCase());
                            setCouponError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleApplyCoupon();
                          }}
                          className={cn(
                            'pr-10',
                            coupon?.valid && 'border-emerald-500/50',
                            couponError && 'border-red-500/50'
                          )}
                          disabled={couponLoading || !!coupon?.valid}
                          aria-label="Coupon code"
                        />
                        {coupon?.valid && (
                          <BadgeCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                        )}
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleApplyCoupon}
                        disabled={!couponCode.trim() || couponLoading || !!coupon?.valid}
                        className="shrink-0 gap-1.5"
                      >
                        {couponLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : coupon?.valid ? (
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          'Apply'
                        )}
                      </Button>
                    </div>
                    {coupon?.valid && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1"
                      >
                        <BadgeCheck className="h-3 w-3" />
                        Coupon &quot;{coupon.code}&quot; applied — {coupon.discountPercent}% off all plans!
                      </motion.p>
                    )}
                    {couponError && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-red-500 mt-1.5 flex items-center gap-1"
                      >
                        <AlertCircle className="h-3 w-3" />
                        {couponError}
                      </motion.p>
                    )}
                  </div>

                  {/* Feature Comparison Table */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Feature Comparison
                    </h3>
                    <div className="rounded-xl border overflow-hidden overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left p-3 font-medium">Feature</th>
                            <th className="text-center p-3 font-medium">Free</th>
                            <th className="text-center p-3 font-medium text-primary">Pro</th>
                            <th className="text-center p-3 font-medium text-amber-500">Elite</th>
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
                              <td className="p-3 text-foreground/80">{row.feature}</td>
                              <td className="p-3 text-center">
                                {row.free ? (
                                  <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : (
                                  <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {row.pro ? (
                                  <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : (
                                  <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                )}
                              </td>
                              <td className="p-3 text-center">
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

                  {/* Credit Add-Ons */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground">
                      <Zap className="h-5 w-5 text-primary" />
                      Credit Add-Ons
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Need more credits? Purchase additional credit packs anytime. Credits never expire.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {CREDIT_ADDONS.map((addon) => {
                        const addonGst = Math.round(addon.priceINR * 0.18);
                        const addonTotal = addon.priceINR + addonGst;
                        return (
                          <div
                            key={addon.credits}
                            className={cn(
                              'flex flex-col items-center gap-3 rounded-xl border p-4',
                              'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10',
                              'transition-all duration-200 cursor-pointer'
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              <Zap className="h-4 w-4 text-primary" />
                              <span className="text-lg font-bold text-foreground">{addon.label}</span>
                            </div>
                            <div className="text-center">
                              <span className="text-sm font-semibold text-foreground">
                                ₹{addon.priceINR.toLocaleString('en-IN')}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                ${addon.priceUSD}
                              </span>
                              {/* GST breakdown for the add-on */}
                              <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                                <div>+₹{addonGst.toLocaleString('en-IN')} GST</div>
                                <div className="font-semibold text-foreground">
                                  ₹{addonTotal.toLocaleString('en-IN')} total
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-primary/30 hover:bg-primary/10"
                              disabled={paymentState === 'creating_order' || paymentInProgress}
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
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  {/* GST Note + Trust */}
                  <div className="text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      18% GST applicable for Indian users. Prices shown are exclusive of GST.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      All plans include a 14-day free trial. No credit card required to start.
                    </p>
                    <div className="flex items-center justify-center gap-1 text-xs text-primary">
                      <Shield className="h-3 w-3" />
                      <span>Secure payments powered by Stripe</span>
                    </div>
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
