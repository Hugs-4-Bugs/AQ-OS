// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Billing Page
// Phase 5: Payments System
//
// Comprehensive billing/subscription management page that includes:
// - Current plan card with plan details
// - Credit usage card
// - Upgrade/downgrade buttons
// - Payment method info
// - Invoice history section
// - Payment history section
// - Cancel subscription button
// - Billing preview for plan changes
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Zap,
  Crown,
  Sparkles,
  ArrowUpRight,
  Shield,
  Loader2,
  Check,
  X,
  Clock,
  AlertTriangle,
  RefreshCcw,
  Plus,
  Calendar,
  IndianRupee,
  Globe,
  Settings,
  ChevronRight,
  SwitchCamera,
  Ban,
  BadgeCheck,
  TrendingUp,
  Hash,
  Receipt,
  History,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { usePayment } from '@/hooks/use-payment';
import CheckoutModal from '@/components/dashboard/checkout-modal';
import PaymentSuccessModal from '@/components/dashboard/payment-success-modal';
import PaymentFailedModal from '@/components/dashboard/payment-failed-modal';
import InvoiceHistory from '@/components/dashboard/invoice-history';
import PaymentHistory from '@/components/dashboard/payment-history';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Constants ──────────────────────────────────────────────────────────────────

const PLAN_ORDER: PlanType[] = ['free', 'pro', 'elite'];

// ─── Plan card colors ───────────────────────────────────────────────────────────

const PLAN_COLORS: Record<PlanType, { bg: string; border: string; icon: string; text: string }> = {
  free: {
    bg: 'bg-slate-500/5',
    border: 'border-slate-500/20',
    icon: 'text-slate-400',
    text: 'text-slate-500',
  },
  pro: {
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    icon: 'text-primary',
    text: 'text-primary',
  },
  elite: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    icon: 'text-amber-500',
    text: 'text-amber-500',
  },
};

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [failedOpen, setFailedOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('pro');
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);

  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const subscriptionStatus = useSubscriptionStore((s) => s.subscriptionStatus);
  const credits = useSubscriptionStore((s) => s.credits);
  const creditsMonthly = useSubscriptionStore((s) => s.creditsMonthly);
  const rolloverCredits = useSubscriptionStore((s) => s.rolloverCredits);
  const addonCredits = useSubscriptionStore((s) => s.addonCredits);
  const isTrial = useSubscriptionStore((s) => s.isTrial);
  const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
  const billingCycle = useSubscriptionStore((s) => s.billingCycle);
  const cancelAtPeriodEnd = useSubscriptionStore((s) => s.cancelAtPeriodEnd);

  const { cancelSubscription, paymentStatus } = usePayment();

  const planDetails = PLAN_DETAILS[currentPlan];
  const planColors = PLAN_COLORS[currentPlan];

  // ── Handle plan selection ───────────────────────────────────────────
  const handleSelectPlan = useCallback((plan: PlanType) => {
    if (plan === currentPlan) return;
    setSelectedPlan(plan);
    setSelectedBillingCycle(isYearly ? 'yearly' : 'monthly');
    setCheckoutOpen(true);
  }, [currentPlan, isYearly]);

  // ── Handle payment success ──────────────────────────────────────────
  const handlePaymentSuccess = useCallback(() => {
    setCheckoutOpen(false);
    setSuccessOpen(true);
  }, []);

  // ── Handle payment failure ──────────────────────────────────────────
  const handlePaymentFailure = useCallback(() => {
    setCheckoutOpen(false);
    setFailedOpen(true);
  }, []);

  // ── Watch for payment status changes ────────────────────────────────
  React.useEffect(() => {
    if (paymentStatus === 'success') {
      handlePaymentSuccess();
    } else if (paymentStatus === 'failed') {
      handlePaymentFailure();
    }
  }, [paymentStatus, handlePaymentSuccess, handlePaymentFailure]);

  // ── Handle subscription cancel ──────────────────────────────────────
  const handleCancelSubscription = useCallback(async () => {
    setCancelLoading(true);
    const success = await cancelSubscription('User requested cancellation');
    setCancelLoading(false);
    if (success) {
      toast.success('Subscription cancelled successfully');
    }
  }, [cancelSubscription]);

  // ── Format currency ─────────────────────────────────────────────────
  const formatINR = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
  const formatUSD = (amount: number) => `$${amount.toLocaleString('en-US')}`;

  // ── Credit usage percentage ─────────────────────────────────────────
  const creditUsed = Math.max(0, creditsMonthly - credits);
  const creditPercentage = creditsMonthly > 0
    ? Math.min(100, Math.round((creditUsed / creditsMonthly) * 100))
    : 0;

  const creditBarColor = creditPercentage >= 90
    ? 'bg-red-500'
    : creditPercentage >= 70
    ? 'bg-amber-500'
    : 'bg-emerald-500';

  return (
    <div className="w-full">
      <ScrollArea className="h-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ═══════════════ HEADER ═══════════════ */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 gap-1">
                <CreditCard className="h-3 w-3" />
                Billing & Subscription
              </Badge>
            </motion.div>
            <h1 className="text-2xl sm:text-3xl font-bold gradient-text">
              Manage Your Plan
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              View your subscription, manage payment methods, and access invoices.
            </p>
          </div>

          {/* ═══════════════ PAYMENT WARNING BANNER ═══════════════ */}
          {subscriptionStatus === 'past_due' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-red-500">Payment Overdue</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your subscription payment is overdue. Please retry payment to restore full access.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 bg-red-500 hover:bg-red-600 text-white shrink-0 sm:ml-auto"
                  onClick={() => {
                    setSelectedPlan(currentPlan === 'free' ? 'pro' : (currentPlan as PlanType));
                    setCheckoutOpen(true);
                  }}
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Retry Payment
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══════════════ CANCEL AT PERIOD END BANNER ═══════════════ */}
          {cancelAtPeriodEnd && subscriptionStatus === 'active' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-500">Cancellation Scheduled</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your subscription will be cancelled at the end of the current billing period. You can reactivate anytime.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════ CURRENT PLAN + CREDITS ═══════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Plan Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2"
            >
              <Card className={cn('border-2', planColors.border)}>
                <CardHeader className="pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-12 w-12 rounded-xl flex items-center justify-center',
                        planColors.bg
                      )}>
                        {currentPlan === 'elite' ? (
                          <Crown className={cn('h-6 w-6', planColors.icon)} />
                        ) : (
                          <Zap className={cn('h-6 w-6', planColors.icon)} fill="currentColor" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{planDetails.name} Plan</CardTitle>
                          <Badge className={
                            subscriptionStatus === 'active'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : subscriptionStatus === 'trialing'
                              ? 'bg-primary/10 text-primary border-primary/20'
                              : subscriptionStatus === 'past_due'
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }>
                            {subscriptionStatus === 'trialing' && <Clock className="h-3 w-3 mr-0.5" />}
                            {subscriptionStatus.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {planDetails.priceINR > 0
                            ? `${formatINR(planDetails.priceINR)}/mo · ${formatUSD(planDetails.priceUSD)}/mo`
                            : 'Free forever'}
                          {billingCycle === 'yearly' && ' · Yearly billing'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentPlan !== 'elite' && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleSelectPlan(
                            currentPlan === 'free' ? 'pro' : 'elite'
                          )}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Upgrade
                        </Button>
                      )}
                      {currentPlan !== 'free' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setShowAllPlans(!showAllPlans)}
                        >
                          <SwitchCamera className="h-3.5 w-3.5" />
                          Change Plan
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Plan features */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {planDetails.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-foreground/80">{feature}</span>
                      </div>
                    ))}
                    {planDetails.disabledFeatures.slice(0, 4).map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm opacity-40">
                        <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground line-through">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Trial info */}
                  {isTrial && trialDaysRemaining > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                      <Clock className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-primary">
                          {trialDaysRemaining} days left in your trial
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Upgrade now to keep all features and your data
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 gap-1"
                        onClick={() => handleSelectPlan('pro')}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Upgrade
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Credit Usage Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border-primary/10 h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-primary" />
                    Credit Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Credit display */}
                  <div className="text-center">
                    <p className="text-3xl font-bold">{credits.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      of {creditsMonthly.toLocaleString()} credits remaining
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Used this month</span>
                      <span>{creditUsed.toLocaleString()} ({creditPercentage}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${creditPercentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={cn('h-full rounded-full', creditBarColor)}
                      />
                    </div>
                  </div>

                  {/* Credit breakdown */}
                  <div className="space-y-1.5 text-xs">
                    {(rolloverCredits > 0 || addonCredits > 0) && (
                      <>
                        <Separator />
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <RefreshCcw className="h-3 w-3" />
                            Rollover
                          </span>
                          <span className="font-medium">{rolloverCredits.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Plus className="h-3 w-3" />
                            Add-ons
                          </span>
                          <span className="font-medium">{addonCredits.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Buy credits CTA */}
                  {creditPercentage >= 70 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => handleSelectPlan(currentPlan === 'free' ? 'pro' : 'elite')}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Get More Credits
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ═══════════════ PLAN SWITCHER ═══════════════ */}
          <AnimatePresence>
            {showAllPlans && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <Card className="border-primary/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <SwitchCamera className="h-4 w-4 text-primary" />
                        Switch Plan
                      </CardTitle>
                      {/* Billing toggle */}
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-medium transition-colors',
                          !isYearly ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          Monthly
                        </span>
                        <Switch
                          checked={isYearly}
                          onCheckedChange={setIsYearly}
                          className="data-[state=checked]:bg-primary"
                        />
                        <span className={cn(
                          'text-xs font-medium transition-colors',
                          isYearly ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          Yearly
                        </span>
                        {isYearly && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                            Save up to ₹24,389/year
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {PLAN_ORDER.map((planType) => {
                        const details = PLAN_DETAILS[planType];
                        const price = isYearly ? details.yearlyINR : details.priceINR;
                        const priceUSD = isYearly ? details.yearlyUSD : details.priceUSD;
                        const isCurrent = planType === currentPlan;
                        const colors = PLAN_COLORS[planType];
                        const currentIdx = PLAN_ORDER.indexOf(currentPlan);
                        const thisIdx = PLAN_ORDER.indexOf(planType);
                        const isDown = thisIdx < currentIdx;
                        const isUpgrade = thisIdx > currentIdx;
                        // PART 2 — no self-serve downgrade. Lower plans get
                        // a "Contact Support" mailto link instead of a button.
                        const planName = planType === 'free' ? 'Free' : planType === 'pro' ? 'Pro' : 'Elite';

                        return (
                          <div
                            key={planType}
                            className={cn(
                              'relative rounded-xl border-2 p-4 transition-all duration-200',
                              'hover:shadow-md',
                              colors.border, colors.bg,
                              isCurrent && 'ring-2 ring-emerald-500/50',
                              planType === 'pro' && !isCurrent && 'ring-1 ring-primary/20'
                            )}
                          >
                            {planType === 'pro' && !isCurrent && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                                <Badge className="bg-primary text-primary-foreground text-[9px] px-2 py-0 h-4">
                                  Popular
                                </Badge>
                              </div>
                            )}
                            {isCurrent && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px] px-2">
                                  Current
                                </Badge>
                              </div>
                            )}

                            <div className="flex items-center gap-2 mb-2">
                              {planType === 'elite' ? (
                                <Crown className={cn('h-5 w-5', colors.icon)} />
                              ) : (
                                <Zap className={cn('h-5 w-5', colors.icon)} fill="currentColor" />
                              )}
                              <h4 className="font-bold text-foreground">{details.name}</h4>
                            </div>

                            <div className="flex items-baseline gap-1 mb-2">
                              {price === 0 ? (
                                <span className="text-2xl font-bold text-foreground">Free</span>
                              ) : (
                                <>
                                  <span className="text-xl font-bold text-foreground">{formatINR(price)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    /{isYearly ? 'year' : 'mo'}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* "₹X/month billed annually" sub-line for yearly plans */}
                            {isYearly && price > 0 && (
                              <p className="text-[10px] text-muted-foreground mb-1">
                                ₹{planType === 'pro'
                                  ? 999
                                  : planType === 'elite'
                                  ? 3166
                                  : 0}/month billed annually
                              </p>
                            )}
                            {priceUSD > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatUSD(priceUSD)}/{isYearly ? 'yr' : 'mo'}
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 mt-2 mb-3 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                              <Zap className="h-3 w-3 text-primary" />
                              <span className="text-xs font-semibold text-foreground">
                                {details.creditsMonthly.toLocaleString()} credits/mo
                              </span>
                            </div>

                            {/* CTA — driven by the same state matrix as the upgrade modal. */}
                            {isDown ? (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className={cn(
                                  'w-full gap-1.5 text-xs',
                                  'bg-muted/40 text-muted-foreground border-muted hover:bg-muted hover:text-foreground',
                                )}
                              >
                                <a href="mailto:support@acquisitionos.com?subject=Plan%20change%20request">
                                  <Mail className="h-3 w-3" />
                                  Contact Support
                                </a>
                              </Button>
                            ) : (
                              <Button
                                variant={isCurrent ? 'outline' : 'default'}
                                size="sm"
                                className={cn(
                                  'w-full gap-1.5 text-xs',
                                  planType === 'elite' && !isCurrent && 'bg-amber-600 hover:bg-amber-700 text-white',
                                  isCurrent && 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-default',
                                )}
                                disabled={isCurrent}
                                onClick={() => handleSelectPlan(planType)}
                              >
                                {isCurrent ? (
                                  <>
                                    <Shield className="h-3 w-3" />
                                    Current Plan
                                  </>
                                ) : isUpgrade ? (
                                  <>
                                    Upgrade to {planName}{isYearly && planType === 'elite' ? ' Annual' : ''}
                                    <ArrowUpRight className="h-3 w-3" />
                                  </>
                                ) : null}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════ PAYMENT METHOD + BILLING INFO ═══════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Method */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Payment Method
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-14 rounded-lg bg-muted flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Not configured yet
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Payment method will be set up on your first purchase
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-emerald-500" />
                    We support Razorpay (INR) and Stripe (USD) for secure payments
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Billing Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-primary" />
                    Billing Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Current Plan</span>
                    <span className="font-medium capitalize">{currentPlan}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Billing Cycle</span>
                    <span className="font-medium capitalize">{billingCycle}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Monthly Price</span>
                    <span className="font-medium">
                      {planDetails.priceINR > 0
                        ? `${formatINR(planDetails.priceINR)}/mo`
                        : 'Free'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={
                      subscriptionStatus === 'active'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]'
                        : subscriptionStatus === 'trialing'
                        ? 'bg-primary/10 text-primary border-primary/20 text-[10px]'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]'
                    }>
                      {subscriptionStatus.replace('_', ' ')}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between font-semibold">
                    <span>Estimated Next Bill</span>
                    <span className="text-primary">
                      {planDetails.priceINR > 0
                        ? formatINR(planDetails.priceINR + Math.round(planDetails.priceINR * 0.18))
                        : '₹0'}
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">incl. GST</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* ═══════════════ INVOICE & PAYMENT HISTORY ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-6"
          >
            <Separator />
            <InvoiceHistory />
            <PaymentHistory
              onRetryPayment={(orderId) => {
                toast.info(`Retrying payment for order ${orderId.slice(0, 8)}...`);
                // Re-open checkout modal with the same plan
                setCheckoutOpen(true);
              }}
            />
          </motion.div>

          {/* ═══════════════ CANCEL SUBSCRIPTION ═══════════════ */}
          {currentPlan !== 'free' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Separator />
              <Card className="border-red-500/10 bg-red-500/[0.02]">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-1.5 text-red-500">
                        <Ban className="h-4 w-4" />
                        Cancel Subscription
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        Your plan will remain active until the end of your current billing period.
                        You can reactivate anytime. All your data will be preserved.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-600 shrink-0"
                          disabled={cancelLoading || subscriptionStatus === 'canceled'}
                        >
                          {cancelLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          Cancel Subscription
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Cancel Subscription?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel your {planDetails.name} plan subscription. You can continue using
                            all features until the end of your current billing period. After that, your account
                            will be downgraded to the Free plan.
                            <br /><br />
                            <strong>You can reactivate your subscription at any time.</strong>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleCancelSubscription}
                            className="bg-red-500 hover:bg-red-600 text-white"
                          >
                            Yes, Cancel Subscription
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ═══════════════ FOOTER INFO ═══════════════ */}
          <div className="text-center space-y-2 pb-4">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                <span>Secure Payments</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCcw className="h-3.5 w-3.5 text-emerald-500" />
                <span>30-Day Money-Back</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Razorpay & Stripe Verified</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              18% GST applicable for Indian users. All prices are exclusive of GST.
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* ═══════════════ MODALS ═══════════════ */}
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        plan={selectedPlan}
        billingCycle={selectedBillingCycle}
        currentPlan={currentPlan}
      />

      <PaymentSuccessModal
        open={successOpen}
        onOpenChange={setSuccessOpen}
        plan={selectedPlan}
        creditsAllocated={PLAN_DETAILS[selectedPlan].creditsMonthly}
        billingCycle={selectedBillingCycle}
      />

      <PaymentFailedModal
        open={failedOpen}
        onOpenChange={setFailedOpen}
        onRetry={() => {
          setFailedOpen(false);
          setCheckoutOpen(true);
        }}
      />
    </div>
  );
}
