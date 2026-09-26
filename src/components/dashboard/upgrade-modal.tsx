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
  LifeBuoy,
  CreditCard,
  Smartphone,
  Clock,
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
import { applyModalSafeArea } from '@/lib/modal-safe-area';
import { Input } from '@/components/ui/input';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePlanAvailability, isPlanCheckoutAvailable } from '@/hooks/use-plan-availability';
import SupportRequestDialog from '@/components/support/support-request-dialog';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Credit add-on packs — AcquisitionOS (final add-on pricing update, Sep 2026).
// These INR amounts are DISPLAY ONLY. The actual Stripe Price ID used at
// checkout is read server-side from STRIPE_PRICE_CREDITS_250_ID,
// STRIPE_PRICE_CREDITS_500_ID, STRIPE_PRICE_CREDITS_1000_ID,
// STRIPE_PRICE_CREDITS_2500_ID — NEVER hardcoded in the client.
const CREDIT_ADDONS = [
  { credits: 250, priceINR: 599, priceUSD: 7, label: 'Starter Pack', badge: null as string | null },
  { credits: 500, priceINR: 999, priceUSD: 12, label: 'Growth Pack', badge: null as string | null },
  { credits: 1000, priceINR: 1799, priceUSD: 22, label: 'Pro Pack', badge: null as string | null },
  { credits: 2500, priceINR: 3999, priceUSD: 48, label: 'Power Pack', badge: 'Best Value' as string | null },
];

// Yearly savings vs monthly (precomputed from PLAN_DETAILS — Starter
// monthly price update, Sep 2026). Starter's monthly × 12 (₹399 × 12 =
// ₹4,788) is now LESS than its yearly price (₹4,999), so the savings is
// negative — savings claims are hidden wherever the value is ≤ 0.
//   Starter: ₹399 * 12 - ₹4,999 = ₹-211 (yearly costs more — claim hidden)
//   Pro:     ₹1,599 * 12 - ₹14,999 = ₹4,189
//   Elite:   ₹5,199 * 12 - ₹44,999 = ₹17,389
const YEARLY_SAVINGS_INR: Record<'starter' | 'pro' | 'elite', number> = {
  starter: -211,
  pro: 4189,
  elite: 17389,
};

// Monthly equivalent for yearly plans (rounded down for display).
//   Starter: ₹4,999 / 12 ≈ ₹416.58 → ₹416
//   Pro:     ₹14,999 / 12 ≈ ₹1,249.92 → ₹1,249
//   Elite:   ₹44,999 / 12 ≈ ₹3,749.92 → ₹3,749
const YEARLY_MONTHLY_EQUIV_INR: Record<'starter' | 'pro' | 'elite', number> = {
  starter: 416,
  pro: 1249,
  elite: 3749,
};

// Downgrade CTAs open the REAL SupportRequestDialog (support ticket flow,
// preselected "Billing & Subscription → Downgrade Plan") — no mailto, no
// fake toast. See SupportRequestDialog / SupportTicketForm.

// ─── Plan button state matrix ────────────────────────────────────────
// Implements PART 2 of SUBSCRIPTION-PAYMENT-FIX-20260909. Downgrades are
// never self-serve — they open the real support ticket dialog instead.
// (force-recompile marker v2 — turbopack was serving a stale chunk that
//  crashed on the Free card in yearly mode.)
// FINAL PAYMENT ACTIVATION ARCHITECTURE: the 'coming-soon' kind was
// removed — Starter, Pro and Elite are all ACTIVE paid plans and always
// render a real purchase action. `configRequired` on an enabled action
// signals "provider configuration required" (shown as an honest notice,
// never as a product availability decision).
type PlanBtnKind = 'current' | 'switch-annual' | 'upgrade' | 'support';
interface PlanBtnState {
  kind: PlanBtnKind;
  label: string;
  disabled: boolean;
  /** True when the application-side checkout is fully implemented but the
   * provider configuration (Stripe Price ID env var / Razorpay keys) is
   * missing for this plan/cycle. The card keeps a REAL, ENABLED purchase
   * action and shows an honest "configuration required" notice — never a
   * product availability decision (final payment activation architecture). */
  configRequired?: boolean;
}
export function computePlanButtonState(
  currentPlan: PlanType,
  currentBillingCycle: 'monthly' | 'yearly',
  planType: PlanType,
  isYearly: boolean,
  checkoutAvailable: boolean | null = null,
): PlanBtnState {
  const currentIsYearly = currentBillingCycle === 'yearly';
  const planName =
    planType === 'free'
      ? 'Free'
      : planType === 'starter'
      ? 'Starter'
      : planType === 'pro'
      ? 'Pro'
      : 'Elite';

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
      // Monthly → Yearly switch on the same plan (Starter/Pro/Elite only —
      // the free plan returned above, so the lookup is always defined).
      // Missing provider configuration (no Stripe Price ID AND no
      // Razorpay keys) keeps the REAL switch action and surfaces the
      // provider-configuration notice via `configRequired`. The server
      // returns an honest configuration error if clicked.
      const savings = YEARLY_SAVINGS_INR[planType as 'starter' | 'pro' | 'elite'];
      return {
        kind: 'switch-annual',
        // Only claim savings when switching actually saves money. After
        // the Starter ₹399 monthly update, Starter yearly (₹4,999) costs
        // more than 12 × ₹399 — so no savings claim is shown there.
        label: savings > 0
          ? `Switch to Annual — Save ₹${savings.toLocaleString('en-IN')}`
          : 'Switch to Annual',
        disabled: false,
        configRequired: checkoutAvailable === false || undefined,
      };
    }
    // Yearly user viewing the monthly card on the same plan — per spec,
    // show "Current Plan" (no monthly downgrade is offered in the UI).
    return { kind: 'current', label: 'Current Plan', disabled: true };
  }

  // ─── HIGHER PLAN — upgrade ───
  // FINAL PAYMENT ACTIVATION ARCHITECTURE: there is no "Coming Soon"
  // state for paid plans. When the provider configuration is missing
  // (checkoutAvailable === false) the upgrade action stays ENABLED and
  // carries `configRequired` so the card renders the honest
  // "<Plan> checkout implemented — payment provider configuration
  // required" notice. Pro/Elite included — no special-casing.
  const currentLevel = PLAN_ORDER.indexOf(currentPlan);
  const thisLevel = PLAN_ORDER.indexOf(planType);
  if (thisLevel > currentLevel) {
    // Starter card uses "Get Started" for non-Starter users (spec).
    if (planType === 'starter') {
      return {
        kind: 'upgrade',
        label: 'Get Started',
        disabled: false,
        configRequired: checkoutAvailable === false || undefined,
      };
    }
    if (currentPlan === 'free') {
      // Free → Pro / Elite (any cycle): "Upgrade to Pro" / "Upgrade to Elite"
      return {
        kind: 'upgrade',
        label: `Upgrade to ${planName}`,
        disabled: false,
        configRequired: checkoutAvailable === false || undefined,
      };
    }
    if (currentPlan === 'pro' && planType === 'elite') {
      return {
        kind: 'upgrade',
        label: isYearly ? 'Upgrade to Elite Annual' : 'Upgrade to Elite',
        disabled: false,
        configRequired: checkoutAvailable === false || undefined,
      };
    }
    return {
      kind: 'upgrade',
      label: `Upgrade to ${planName}`,
      disabled: false,
      configRequired: checkoutAvailable === false || undefined,
    };
  }

  // ─── LOWER PLAN — Contact Support (no self-serve downgrade, ever) ───
  // Per spec, Pro Monthly → Free gets the explicit "Contact Support to
  // Downgrade" label; every other downgrade case says "Contact Support".
  if (currentPlan === 'pro' && !currentIsYearly && planType === 'free') {
    return { kind: 'support', label: 'Contact Support to Downgrade', disabled: false };
  }
  return { kind: 'support', label: 'Contact Support', disabled: false };
}

// Inline notice shown under a paid plan's CTA ONLY when the provider
// configuration for the selected cycle is actually missing (no Stripe
// Price ID env var AND no Razorpay keys). FINAL PAYMENT ACTIVATION
// ARCHITECTURE: distinguishes APPLICATION IMPLEMENTATION (complete for
// Starter/Pro/Elite) from PROVIDER CONFIGURATION (required) — never
// label the whole feature "Coming Soon". No raw env var names or
// secrets are exposed.
function planConfigNotice(planType: PlanType): string {
  const name = planType === 'starter' ? 'Starter' : planType === 'pro' ? 'Pro' : 'Elite';
  return `${name} checkout implemented — payment provider configuration required`;
}

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

const PLAN_ORDER: PlanType[] = ['free', 'starter', 'pro', 'elite'];

// Payment state type. 'select_gateway' is the intermediate step where the
// user picks between the available payment gateways (Stripe / Razorpay).
type PaymentState = 'idle' | 'select_gateway' | 'creating_order' | 'checkout' | 'verifying' | 'success' | 'failed';

// ─── Payment gateway types ───────────────────────────────────────
// NOTE: intentionally declared locally (NOT imported from '@/lib/payments')
// so this client component never pulls the server-side provider registry
// (Razorpay/Stripe SDKs) into the browser bundle.
type PaymentGateway = 'stripe' | 'razorpay';

// Public-safe availability snapshot from GET /api/payments/provider-status.
interface ProviderStatus {
  stripe: { available: boolean; mode: 'test' | 'live' | null; publishableKey: string | null };
  razorpay: { available: boolean; mode: 'test' | 'live' | null; keyId: string | null };
  anyAvailable: boolean;
}

// What the user is about to pay for while the gateway step is showing.
interface PendingPurchase {
  kind: 'subscription' | 'credits';
  plan?: PlanType;
  addon?: typeof CREDIT_ADDONS[number];
}

// Response payload for a Razorpay checkout order (server-computed amounts).
interface RazorpayCheckoutPayload {
  gateway: 'razorpay';
  orderId: string;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayKeyId?: string;
  razorpayAmount?: number;
  razorpayCurrency?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  recurring?: boolean;
  mode?: 'test' | 'live';
}

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
  checkoutAvailable,
  onContactSupport,
}: {
  planType: PlanType;
  isYearly: boolean;
  isPopular: boolean;
  coupon: CouponInfo | null;
  onSelect: () => void;
  isProcessing: boolean;
  currentPlan: PlanType;
  currentBillingCycle: 'monthly' | 'yearly';
  /** null = unknown (availability endpoint pending/failed); false = provider
   * configuration missing for this plan/cycle (config-required notice — the
   * CTA stays enabled). */
  checkoutAvailable: boolean | null;
  /** Opens the REAL support request dialog for this plan card
   * ("Contact Support to Downgrade" / "Contact Support"). */
  onContactSupport: () => void;
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
  // checkoutAvailable === false → the plan's provider configuration is
  // missing: the button STAYS ENABLED and the card shows the honest
  // config-required notice (final payment activation architecture).
  const buttonState = computePlanButtonState(
    currentPlan,
    currentBillingCycle,
    planType,
    isYearly,
    checkoutAvailable
  );
  const isCurrent = buttonState.kind === 'current';

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

        {/* Price — font-extrabold text-foreground per PART 6. flex-wrap
            keeps strikethrough + price + period inside narrow cards. */}
        <div className="flex flex-wrap items-baseline gap-1">
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
            ₹{YEARLY_MONTHLY_EQUIV_INR[planType as 'starter' | 'pro' | 'elite']?.toLocaleString('en-IN')}/month billed annually
          </p>
        )}
        {priceUSD > 0 && (
          <span className="text-xs text-muted-foreground block">
            ${priceUSD}{period}
          </span>
        )}
        {/* Yearly savings badge — exact text per PART 1. whitespace-normal
            overrides the shadcn Badge default (whitespace-nowrap) so the
            text wraps inside the card instead of overflowing it.
            Hidden when the yearly price no longer saves money vs monthly
            (e.g. Starter after the ₹399 monthly update). */}
        {isYearly && priceINR > 0 && (YEARLY_SAVINGS_INR[planType as 'starter' | 'pro' | 'elite'] ?? 0) > 0 && (
          <Badge variant="secondary" className="mt-1.5 max-w-full whitespace-normal leading-snug text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Save ₹{YEARLY_SAVINGS_INR[planType as 'starter' | 'pro' | 'elite']?.toLocaleString('en-IN')}/year vs monthly
          </Badge>
        )}
        {coupon?.valid && discountPercent > 0 && priceINR > 0 && (
          <Badge variant="secondary" className="mt-1.5 max-w-full whitespace-normal text-[10px] bg-primary/10 text-primary border-primary/20 gap-0.5">
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
        <Zap className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold text-foreground min-w-0">
          {details.creditsMonthly.toLocaleString()} credits/month
        </span>
      </div>

      {/* Features list — themed foreground / muted-foreground per PART 6.
          min-w-0 + break-words keeps long feature names ("Team
          collaboration (up to 10)") wrapped INSIDE the card. */}
      <div className="flex-1 space-y-2 mb-5">
        {details.features.map((feature) => (
          <div key={feature} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-sm text-foreground/80 min-w-0 break-words [overflow-wrap:anywhere]">{feature}</span>
          </div>
        ))}
        {details.disabledFeatures.slice(0, 3).map((feature) => (
          <div key={feature} className="flex items-start gap-2 opacity-50">
            <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground line-through min-w-0 break-words [overflow-wrap:anywhere]">{feature}</span>
          </div>
        ))}
      </div>

      {/* CTA Button — driven by the PART 2 state matrix.
          'support' opens the REAL support request dialog (ticket flow with
          the category preselected) — never a mailto or a fake toast.
          whitespace-normal lets long labels like
          "Contact Support to Downgrade" wrap INSIDE the card instead of
          overflowing (shadcn Button defaults to whitespace-nowrap).
          Other kinds render as a Button — every paid plan kind is a
          real, enabled purchase action (no "Coming Soon" state exists). */}
      {buttonState.kind === 'support' ? (
        <Button
          variant="outline"
          className={cn(
            'w-full gap-2 font-semibold whitespace-normal leading-snug min-h-[44px]',
            'bg-muted/40 text-muted-foreground border-muted hover:bg-muted hover:text-foreground',
          )}
          onClick={onContactSupport}
        >
          <LifeBuoy className="h-4 w-4 shrink-0" />
          {buttonState.label}
        </Button>
      ) : (
        <Button
          variant={buttonState.kind === 'current' ? 'outline' : 'default'}
          className={cn(
            'w-full gap-2 font-semibold whitespace-normal leading-snug min-h-[44px]',
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

      {/* Provider-configuration notice — all paid plans. Shown ONLY when the
          plan/cycle's provider configuration (Stripe Price ID + Razorpay
          keys) is actually missing. The CTA above stays a real, enabled
          purchase action; clicking it reaches the server, which reports the
          missing configuration honestly. No fake payment is possible. */}
      {buttonState.configRequired && (
        <p
          className="mt-2 text-[11px] leading-snug text-muted-foreground flex items-start gap-1.5"
          role="note"
        >
          <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{planConfigNotice(planType)}</span>
        </p>
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
  // ─── Contact Support / Downgrade support-request dialog ─────────
  // Opens the REAL support ticket flow (SupportRequestDialog) with the
  // category preselected (Billing & Subscription → Downgrade Plan) and
  // the plan context from the card the user clicked.
  const [supportRequest, setSupportRequest] = useState<{
    open: boolean;
    requestedPlan: PlanType | null;
  }>({ open: false, requestedPlan: null });
  // Locks the modal while a real Stripe redirect is in flight. While true,
  // outside-click / Escape / the X close button are all disabled so the
  // user can't accidentally abandon a checkout session. Outside-click is
  // ALSO blocked when no payment is in progress (the modal only closes via
  // the X button). See PART 3 of SUBSCRIPTION-PAYMENT-FIX-20260909.
  const [paymentInProgress, setPaymentInProgress] = useState(false);

  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const currentBillingCycle = useSubscriptionStore((s) => s.billingCycle);
  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);

  // Per-plan/cycle provider configuration status. A paid plan whose
  // Stripe Price ID env var is missing (and Razorpay not configured)
  // keeps an ENABLED purchase button and shows the config-required
  // notice — paid plans are always ACTIVE (no "Coming Soon").
  const planAvailability = usePlanAvailability();

  // ─── Payment gateway selection state ─────────────────────────────
  // Availability is fetched from the PUBLIC /api/payments/provider-status
  // endpoint when the modal opens (reveals availability + mode only —
  // never secrets). If only one gateway is configured, checkout starts
  // with it directly; if both are configured the user chooses.
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);

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
      setPendingPurchase(null);
      setActiveGateway(null);
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
        body: JSON.stringify({ code: couponCode.trim(), plan: pendingPurchase?.plan || 'pro' }),
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
  }, [couponCode, pendingPurchase?.plan]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/payments/provider-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProviderStatus | null) => {
        if (!cancelled && data) setProviderStatus(data);
      })
      .catch(() => {
        /* provider status is advisory — checkout errors surface later */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load the Razorpay Checkout.js script once (idempotent).
  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(false);
      if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  // ─── Step 1 entry points ─────────────────────────────────────────
  // Selecting a plan (or add-on) now routes through the gateway step:
  //   • 0 gateways configured  → honest error
  //   • exactly 1 configured   → checkout starts immediately
  //   • both configured        → 'select_gateway' step is shown
  const beginPurchase = useCallback(
    (purchase: PendingPurchase) => {
      const stripeOk = providerStatus?.stripe.available ?? !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      const razorpayOk = providerStatus?.razorpay.available ?? false;

      if (!stripeOk && !razorpayOk) {
        toast.error(
          'No payment method is available right now. The site administrator needs to configure a payment gateway (Stripe or Razorpay).'
        );
        return;
      }
      if (stripeOk && !razorpayOk) {
        void startCheckout('stripe', purchase);
        return;
      }
      if (!stripeOk && razorpayOk) {
        void startCheckout('razorpay', purchase);
        return;
      }
      setPendingPurchase(purchase);
      setPaymentError('');
      setPaymentState('select_gateway');
    },
    // startCheckout is declared below with useCallback — stable deps.
    [providerStatus]
  );

  const handleSelectPlan = useCallback(
    (plan: PlanType) => {
      // "Contact Support" / "Current Plan" should never reach this handler
      // (the UI prevents it). Guard anyway: if same plan + same billing
      // cycle, it's a no-op.
      if (plan === currentPlan) {
        const currentIsYearly = currentBillingCycle === 'yearly';
        if (isYearly === currentIsYearly) return;
      }
      setProcessingPlan(plan);
      beginPurchase({ kind: 'subscription', plan });
    },
    [currentPlan, currentBillingCycle, isYearly, beginPurchase]
  );

  const handleBuyAddon = useCallback(
    (addon: typeof CREDIT_ADDONS[number]) => {
      beginPurchase({ kind: 'credits', addon });
    },
    [beginPurchase]
  );

  // ─── "Contact Support to Downgrade" / "Contact Support" handler ──
  // Opens the support request dialog with full plan context prefilled.
  // Never mutates the subscription — only creates a support ticket.
  const handleContactSupport = useCallback(
    (targetPlan: PlanType) => {
      setSupportRequest({ open: true, requestedPlan: targetPlan });
    },
    []
  );

  // ─── Step 2: the actual checkout, per gateway ────────────────────
  const startCheckout = useCallback(
    async (gateway: PaymentGateway, purchase: PendingPurchase) => {
      setActiveGateway(gateway);
      setPaymentState('creating_order');
      setPaymentError('');
      setPaymentInProgress(true);

      const billingCycle = isYearly ? ('yearly' as const) : ('monthly' as const);
      const appliedCoupon = coupon?.valid ? coupon.code : undefined;

      try {
        // ═══ STRIPE — hosted checkout redirect (existing canonical flow) ═══
        if (gateway === 'stripe') {
          const body =
            purchase.kind === 'credits'
              ? { type: 'credits', creditAmount: purchase.addon?.credits }
              : { plan: purchase.plan, billingCycle, couponCode: appliedCoupon };

          const res = await fetch('/api/payments/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to create Stripe checkout session');
          }

          const data = await res.json();
          setLastOrderId(data.orderId);

          if (data.url) {
            setPaymentState('checkout');
            // paymentInProgress stays true during navigation; the
            // success/cancel callback after the redirect resets it.
            window.location.href = data.url;
            return;
          }
          throw new Error('No Stripe checkout URL returned');
        }

        // ═══ RAZORPAY — server-created order/subscription + Checkout.js ═══
        const body =
          purchase.kind === 'credits'
            ? { gateway: 'razorpay', type: 'credits', creditAmount: purchase.addon?.credits }
            : { gateway: 'razorpay', plan: purchase.plan, billingCycle, couponCode: appliedCoupon };

        const res = await fetch('/api/payments/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to create Razorpay order');
        }

        const data = (await res.json()) as RazorpayCheckoutPayload;
        setLastOrderId(data.orderId);

        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          throw new Error('Could not load Razorpay Checkout. Please check your connection and try again.');
        }

        setPaymentState('checkout');

        const RazorpayCtor = (window as unknown as { Razorpay?: new (options: unknown) => { on: (event: string, cb: (response: unknown) => void) => void; open: () => void } }).Razorpay;
        if (!RazorpayCtor) {
          throw new Error('Razorpay Checkout is unavailable.');
        }

        // Amounts and identifiers come from the SERVER (the browser never
        // tells the backend what was purchased or for how much).
        const checkoutOptions: Record<string, unknown> = {
          key: data.razorpayKeyId,
          name: 'AcquisitionOS',
          description:
            purchase.kind === 'credits'
              ? `${purchase.addon?.label ?? 'Credits'} add-on`
              : `${PLAN_DETAILS[purchase.plan ?? 'free']?.name ?? purchase.plan} Plan — ${billingCycle}`,
          prefill: data.prefill ?? {},
          theme: { color: '#6C63FF' },
          modal: {
            ondismiss: () => {
              // User closed the Razorpay modal — the order stays pending
              // server-side; nothing was activated. Safe to close/retry.
              setPaymentInProgress(false);
              setPaymentState('idle');
              setProcessingPlan(null);
              toast.info('Payment cancelled');
            },
          },
          handler: async (response: {
            razorpay_order_id?: string;
            razorpay_payment_id?: string;
            razorpay_signature?: string;
            razorpay_subscription_id?: string;
          }) => {
            // Frontend success is NEVER trusted — the server verifies the
            // signature + payment, then activates via the shared services.
            setPaymentState('verifying');
            try {
              const verifyRes = await fetch('/api/payments/razorpay/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  orderId: data.orderId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                }),
              });

              const verifyData = await verifyRes.json().catch(() => ({}));
              if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.error || 'Payment verification failed.');
              }

              await verifyPaymentAndSync();
            } catch (verifyError) {
              const message =
                verifyError instanceof Error ? verifyError.message : 'Payment verification failed.';
              setPaymentState('failed');
              setPaymentError(message);
              setPaymentInProgress(false);
              toast.error(message);
            }
          },
        };

        if (data.razorpaySubscriptionId) {
          // Recurring subscription checkout — Razorpay derives the amount
          // from the dashboard-configured plan.
          checkoutOptions.subscription_id = data.razorpaySubscriptionId;
        } else if (data.razorpayOrderId) {
          // One-time order checkout — the server-computed amount/currency.
          checkoutOptions.order_id = data.razorpayOrderId;
          checkoutOptions.amount = data.razorpayAmount;
          checkoutOptions.currency = data.razorpayCurrency;
        } else {
          throw new Error('Razorpay checkout is missing order identifiers.');
        }

        const rzp = new RazorpayCtor(checkoutOptions);
        rzp.on('payment.failed', () => {
          setPaymentState('failed');
          setPaymentError('Your payment attempt failed. No amount was activated — you can try again.');
          setPaymentInProgress(false);
          toast.error('Payment failed. You can try again.');
        });
        rzp.open();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process checkout';
        setPaymentState('failed');
        setPaymentError(message);
        toast.error(message);
        setProcessingPlan(null);
        setPaymentInProgress(false);
      }
    },
    // verifyPaymentAndSync is a stable useCallback declared above.
    [isYearly, coupon, loadRazorpayScript]
  );

  // Handle retry after failure. If both gateways are configured, return to
  // the gateway selection step for the pending purchase; otherwise idle.
  const handleRetry = useCallback(() => {
    const bothGateways = !!(providerStatus?.stripe.available && providerStatus?.razorpay.available);
    if (pendingPurchase && bothGateways) {
      setPaymentState('select_gateway');
    } else {
      setPaymentState('idle');
    }
    setPaymentError('');
    setProcessingPlan(null);
  }, [providerStatus, pendingPurchase]);

  // Render payment success state — shows a plan-specific welcome message
  // per PART 5 ("Welcome to [Plan Name]! Your plan is now active.").
  const renderSuccessState = () => {
    const planName = PLAN_DETAILS[currentPlan]?.name ?? 'Pro';
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

  // Render the gateway selection step: shown when BOTH gateways are
  // configured and the user picked a plan/add-on. One configured gateway
  // skips straight to checkout (beginPurchase handles that).
  const renderGatewaySelection = () => {
    const purchase = pendingPurchase;
    const isCredits = purchase?.kind === 'credits';
    const planName = isCredits
      ? ''
      : PLAN_DETAILS[purchase?.plan ?? 'free']?.name ?? '';
    const cycleLabel = isYearly ? 'yearly' : 'monthly';

    const stripeMode = providerStatus?.stripe.mode;
    const razorpayMode = providerStatus?.razorpay.mode;
    const modeBadge = (mode: 'test' | 'live' | null | undefined) =>
      mode === 'test' ? (
        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
          TEST MODE
        </Badge>
      ) : null;

    // Display amounts: Stripe charges in USD via the configured Price,
    // Razorpay charges in INR (server-computed, GST added at checkout).
    // Amounts come from PLAN_DETAILS (central plan display config).
    const purchasedPlan = purchase?.plan && purchase.plan !== 'free' ? purchase.plan : 'pro';
    const usdPrice = isCredits
      ? (purchase?.addon?.priceUSD ?? 0)
      : isYearly
        ? PLAN_DETAILS[purchasedPlan].yearlyUSD
        : PLAN_DETAILS[purchasedPlan].priceUSD;
    const inrPrice = isCredits
      ? (purchase?.addon?.priceINR ?? 0)
      : isYearly
        ? PLAN_DETAILS[purchasedPlan].yearlyINR
        : PLAN_DETAILS[purchasedPlan].priceINR;

    return (
      <div className="space-y-6">
        <div className="text-center space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">Choose Payment Method</h3>
          <p className="text-sm text-muted-foreground">
            {isCredits
              ? `${purchase?.addon?.label ?? ''} add-on`
              : `${planName} Plan (${cycleLabel})`}
            {' '}— select how you&apos;d like to pay
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Stripe option */}
          <button
            type="button"
            onClick={() => {
              if (purchase) void startCheckout('stripe', purchase);
            }}
            disabled={paymentState === 'creating_order'}
            className={cn(
              'group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-200',
              'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#635BFF]/10">
                  <CreditCard className="h-5 w-5 text-[#635BFF]" />
                </div>
                <span className="font-semibold text-foreground">Stripe</span>
              </div>
              {modeBadge(stripeMode)}
            </div>
            <p className="text-xs text-muted-foreground">
              International cards. Billed in USD (${usdPrice}
              {isCredits ? '' : `/${cycleLabel === 'yearly' ? 'year' : 'month'}`})
              {coupon?.valid ? ' — coupon applied at checkout' : ''}.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
              Pay with Stripe
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          {/* Razorpay option */}
          <button
            type="button"
            onClick={() => {
              if (purchase) void startCheckout('razorpay', purchase);
            }}
            disabled={paymentState === 'creating_order'}
            className={cn(
              'group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-200',
              'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0C2451]/10 dark:bg-[#3395FF]/10">
                  <Smartphone className="h-5 w-5 text-[#0C2451] dark:text-[#3395FF]" />
                </div>
                <span className="font-semibold text-foreground">Razorpay</span>
              </div>
              {modeBadge(razorpayMode)}
            </div>
            <p className="text-xs text-muted-foreground">
              UPI, cards, net banking &amp; wallets. Billed in INR (₹{inrPrice.toLocaleString('en-IN')}
              {isCredits ? '' : `/${cycleLabel === 'yearly' ? 'year' : 'month'}`} + GST as applicable)
              {coupon?.valid ? ' — coupon applied where supported' : ''}.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
              Pay with Razorpay
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        {paymentState === 'creating_order' && (
          <div className="flex items-center justify-center gap-2 text-sm text-primary py-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing your checkout...
          </div>
        )}

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={paymentState === 'creating_order'}
            onClick={() => {
              setPaymentState('idle');
              setPendingPurchase(null);
              setProcessingPlan(null);
            }}
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Back to plans
          </Button>
        </div>
      </div>
    );
  };

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
        // RESPONSIVE FIX: grid-rows bounds the ScrollArea to the space left
        // by the header (minmax(0,1fr)) instead of the old hardcoded
        // max-h calc that spilled past the dialog edge; the arbitrary
        // variant forces Radix ScrollArea's viewport child (inline
        // `display: table`) to display:block so body content is constrained
        // to the dialog width — without it, plan cards expand to max-content
        // and get horizontally clipped on mobile.
        // NAVBAR-SAFE POSITIONING: the shared DialogContent vertically
        // centers dialogs (top-50% + -translate-y-1/2), which made this
        // dialog start BEHIND the sticky navbar (z-[100] above this z-50
        // dialog) whenever it was taller than the viewport, clipping its
        // top edge + close button. Instead of a hardcoded offset, the
        // applyModalSafeArea ref (see src/lib/modal-safe-area.ts)
        // measures the real chrome at open time - the header (pushed down
        // by any banner above it) and the bottom nav / footer - and sets
        // --aos-modal-top (header bottom + 12px gap) and
        // --aos-modal-maxh (down to 12px above the bottom chrome), so the
        // modal never overlaps the navbar and never extends past the
        // viewport bottom. Header stays fixed; only the body scrolls.
        ref={(node) => (node ? applyModalSafeArea(node) : undefined)}
        className="w-full max-w-[calc(100%-2rem)] sm:w-[95vw] sm:max-w-5xl top-[var(--aos-modal-top,60px)]! translate-y-0! max-h-[var(--aos-modal-maxh,calc(100dvh-145px))] p-0 gap-0 overflow-hidden bg-card border border-border grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] [&_[data-slot=scroll-area-viewport]>div]:block!"
        // WIDTH NOTE (responsive fix, Starter finalization Sep 2026): the
        // shared DialogContent base includes `sm:max-w-lg`. The previous
        // `max-w-5xl` (no variant) did NOT override it — tailwind-merge keeps
        // both because their variant prefixes differ, and Tailwind emits
        // variant utilities after base ones, so `sm:max-w-lg` (512px) won at
        // >=640px viewports. The plan-card grid then switched to
        // md:2/lg:4 columns based on the VIEWPORT while the modal stayed
        // 512px wide → 4 squeezed/clipped cards (the reported bug). Declaring
        // `sm:max-w-5xl` (same variant as the base rule) lets tailwind-merge
        // dedupe it properly, restoring the intended 1024px desktop modal.
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

        {/* RESPONSIVE FIX: min-h-0 lets this grid row shrink so the Radix
            viewport (not the dialog edge) is the exact scroll boundary —
            the old max-h-[calc(90vh-80px)] assumed a fixed 80px header and
            spilled ~9px past the dialog bottom. */}
        <ScrollArea className="min-h-0">
          <div className="p-6 space-y-8">
            {/* Payment state overlays */}
            <AnimatePresence mode="wait">
              {paymentState === 'success' ? (
                renderSuccessState()
              ) : paymentState === 'failed' ? (
                renderFailedState()
              ) : paymentState === 'verifying' ? (
                renderVerifyingState()
              ) : paymentState === 'select_gateway' ? (
                renderGatewaySelection()
              ) : (
                <>
                  {/* Billing Toggle */}
                  <div className="flex flex-wrap items-center justify-center gap-3">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))] gap-6">
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
                        checkoutAvailable={isPlanCheckoutAvailable(planAvailability, planType, isYearly ? 'yearly' : 'monthly')}
                        onContactSupport={() => handleContactSupport(planType)}
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
                            <th className="text-center p-3 font-medium text-teal-500">Starter</th>
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
                                {row.starter ? (
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
                      Need more credits? Top up anytime. Credits never expire and work across all features.
                    </p>
                    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
                      {CREDIT_ADDONS.map((addon) => {
                        const addonGst = Math.round(addon.priceINR * 0.18);
                        const addonTotal = addon.priceINR + addonGst;
                        return (
                          <div
                            key={addon.credits}
                            className={cn(
                              'relative flex flex-col items-center gap-2.5 rounded-xl border p-4 min-w-0',
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
                              <span className="text-sm sm:text-base font-bold text-foreground text-center leading-tight">{addon.label}</span>
                            </div>
                            {/* 2. Credit amount — large and prominent */}
                            <div className="text-2xl font-extrabold text-primary leading-none text-center">
                              {addon.credits.toLocaleString('en-IN')}
                            </div>
                            <div className="text-xs text-muted-foreground -mt-1">Credits</div>
                            {/* 3-6. Base price / GST / total / USD equivalent */}
                            <div className="text-center">
                              <span className="text-base font-semibold text-foreground">
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
                              className="border-primary/30 hover:bg-primary/10 w-full"
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
                            {/* 8. Expiration message */}
                            <p className="text-[11px] text-muted-foreground text-center leading-tight">
                              Credits never expire
                            </p>
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
                      <span>Secure payments powered by Stripe &amp; Razorpay</span>
                    </div>
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* REAL support request flow — "Contact Support to Downgrade" /
          "Contact Support" opens this ticket dialog on top of the
          pricing modal. Category "Billing & Subscription → Downgrade
          Plan" + plan context prefilled. Submission creates a real
          persisted ticket (POST /api/support/tickets). */}
      <SupportRequestDialog
        open={supportRequest.open}
        onOpenChange={(open) =>
          setSupportRequest((prev) => ({ ...prev, open }))
        }
        category="billing"
        subcategory="downgrade_plan"
        currentPlan={currentPlan}
        requestedPlan={supportRequest.requestedPlan}
        billingCycle={isYearly ? 'yearly' : 'monthly'}
        source="pricing_modal"
        subject={
          supportRequest.requestedPlan
            ? `Downgrade request: ${currentPlan} to ${supportRequest.requestedPlan}`
            : 'Plan change request'
        }
        priority="NORMAL"
      />
    </Dialog>
  );
}
