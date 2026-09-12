// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Failure Recovery UI (Phase 5)
// Complete payment failure recovery system for past_due subscriptions,
// failed payments, grace periods, and cancellation flows.
//
// Sub-components:
//   1. PastDueBanner       — Top-of-dashboard warning banner
//   2. RetryPaymentCard    — Retry failed payment with details
//   3. CancelSubscriptionCard — Confirm subscription cancellation
//   4. GracePeriodCard     — Grace period countdown & access status
//   5. PaymentStatusOverview — Full payment status dashboard
//
// Default export: PaymentRecoveryUI — conditionally renders based
// on the current payment status from /api/payments/status.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CreditCard,
  RefreshCw,
  X,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Calendar,
  Zap,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Ban,
  Settings,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useSubscriptionStore, PLAN_DETAILS, type PlanType } from '@/lib/subscription-store';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface GracePeriodInfo {
  inGracePeriod: boolean;
  gracePeriodEndsAt: string | null;
  daysRemaining: number;
  shouldDowngrade: boolean;
}

export interface ScheduledDowngradeInfo {
  isScheduled: boolean;
  scheduledPlanChange: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentStatusData {
  subscriptionStatus: SubscriptionStatus | null;
  hasPastDue: boolean;
  gracePeriodInfo: GracePeriodInfo;
  nextPaymentDate: string | null;
  failedPayments: number;
  scheduledDowngrade: ScheduledDowngradeInfo;
}

export interface FailedPaymentDetail {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  billingCycle: string;
  createdAt: string;
  status: string;
}

interface PaymentRecoveryUIProps {
  className?: string;
}

// ─── API Helper ───────────────────────────────────────────────────

async function fetchPaymentStatus(): Promise<PaymentStatusData> {
  const res = await fetch('/api/payments/status');
  if (!res.ok) throw new Error('Failed to fetch payment status');
  return res.json();
}

async function retryPayment(originalPaymentOrderId: string): Promise<{
  success: boolean;
  newPaymentOrderId?: string;
  amount?: number;
  currency?: string;
  plan?: string;
  provider?: string;
  error?: string;
}> {
  const res = await fetch('/api/payments/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalPaymentOrderId }),
  });
  return res.json();
}

async function cancelSubscription(): Promise<{
  success: boolean;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  error?: string;
}> {
  const res = await fetch('/api/payments/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

// ─── Animation Variants ───────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

const staggerItem = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
};

// ─── Grace Period Constants ───────────────────────────────────────

const GRACE_PERIOD_DAYS = 7;

// ═══════════════════════════════════════════════════════════════════
// 1. PastDueBanner — Top-of-dashboard warning banner
// ═══════════════════════════════════════════════════════════════════

interface PastDueBannerProps {
  daysRemaining: number;
  onUpdatePayment?: () => void;
  onRetryPayment?: () => void;
  onDismiss?: () => void;
}

export function PastDueBanner({
  daysRemaining,
  onUpdatePayment,
  onRetryPayment,
  onDismiss,
}: PastDueBannerProps) {
  const isUrgent = daysRemaining <= 2;
  const isCritical = daysRemaining <= 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-3 text-sm border-b',
            isCritical
              ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
              : isUrgent
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <motion.div
              animate={isUrgent || isCritical ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <AlertTriangle
                className={cn(
                  'h-4 w-4 shrink-0',
                  isCritical && 'text-red-500',
                  isUrgent && !isCritical && 'text-orange-500'
                )}
              />
            </motion.div>
            <span className="truncate">
              {isCritical ? (
                <>
                  Your <span className="font-semibold">grace period has expired</span>. Update your payment now to restore access.
                </>
              ) : (
                <>
                  Your <span className="font-semibold">payment failed</span>.{' '}
                  <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> remaining in grace period.
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className={cn(
                'gap-1.5 text-xs h-7',
                isCritical || isUrgent
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              )}
              onClick={onUpdatePayment}
            >
              <CreditCard className="h-3 w-3" />
              Update Payment
            </Button>
            {!isCritical && (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'gap-1.5 text-xs h-7',
                  !isCritical && 'border-amber-500/30 hover:bg-amber-500/10'
                )}
                onClick={onRetryPayment}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 2. RetryPaymentCard — Retry a failed payment
// ═══════════════════════════════════════════════════════════════════

interface RetryPaymentCardProps {
  failedPayment: FailedPaymentDetail;
  onRetrySuccess?: () => void;
  onChangePlan?: () => void;
  onCancel?: () => void;
}

export function RetryPaymentCard({
  failedPayment,
  onRetrySuccess,
  onChangePlan,
  onCancel,
}: RetryPaymentCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setRetryResult('idle');
    setErrorMessage(null);

    try {
      const result = await retryPayment(failedPayment.id);
      if (result.success) {
        setRetryResult('success');
        onRetrySuccess?.();
      } else {
        setRetryResult('error');
        setErrorMessage(result.error || 'Payment retry failed. Please try again.');
      }
    } catch {
      setRetryResult('error');
      setErrorMessage('Network error. Please check your connection and try again.');
    } finally {
      setRetrying(false);
    }
  }, [failedPayment.id, onRetrySuccess]);

  const planName = PLAN_DETAILS[failedPayment.plan as PlanType]?.name ?? failedPayment.plan;
  const formattedAmount = useMemo(() => {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: failedPayment.currency || 'INR',
        minimumFractionDigits: 0,
      }).format(failedPayment.amount);
    } catch {
      return `${failedPayment.currency} ${failedPayment.amount}`;
    }
  }, [failedPayment.amount, failedPayment.currency]);

  const formattedDate = useMemo(() => {
    try {
      return new Date(failedPayment.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return failedPayment.createdAt;
    }
  }, [failedPayment.createdAt]);

  return (
    <motion.div {...fadeInUp}>
      <Card className="border-red-500/10 dark:border-red-500/20 overflow-hidden">
        {/* Error state */}
        <AnimatePresence mode="wait">
          {retryResult === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center"
              >
                <CheckCircle2 className="h-7 w-7 text-green-500" />
              </motion.div>
              <div>
                <h3 className="font-semibold text-green-600 dark:text-green-400">
                  Payment Retry Initiated
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your payment is being processed. You&apos;ll be notified once it&apos;s confirmed.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5 text-xs"
                onClick={() => setRetryResult('idle')}
              >
                View Status
              </Button>
            </motion.div>
          ) : (
            <motion.div key="form" {...scaleIn}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Failed Payment</CardTitle>
                    <CardDescription>
                      Your last payment could not be processed
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Payment details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-0.5">Plan</p>
                    <p className="text-sm font-semibold">{planName}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                    <p className="text-sm font-semibold">{formattedAmount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-0.5">Billing</p>
                    <p className="text-sm font-semibold capitalize">{failedPayment.billingCycle}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-0.5">Failed On</p>
                    <p className="text-sm font-semibold">{formattedDate}</p>
                  </div>
                </div>

                {/* Error message */}
                {retryResult === 'error' && errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Alert variant="destructive" className="py-2.5">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="text-xs font-semibold">Retry Failed</AlertTitle>
                      <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 pt-0">
                <Button
                  className="w-full gap-2"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Retry Payment
                    </>
                  )}
                </Button>
                <div className="flex items-center justify-center gap-4 w-full">
                  <button
                    onClick={onChangePlan}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Change Plan
                  </button>
                  <span className="text-muted-foreground/30">|</span>
                  <button
                    onClick={onCancel}
                    className="text-xs text-red-500/70 hover:text-red-500 transition-colors underline underline-offset-2"
                  >
                    Cancel Subscription
                  </button>
                </div>
              </CardFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3. CancelSubscriptionCard — Confirm subscription cancellation
// ═══════════════════════════════════════════════════════════════════

interface CancelSubscriptionCardProps {
  currentPlan: PlanType;
  onCancelConfirm?: () => void;
  onKeepSubscription?: () => void;
}

const CANCEL_FEATURES: Record<string, { icon: React.ElementType; label: string }[]> = {
  pro: [
    { icon: Zap, label: '500 monthly credits → 50 credits' },
    { icon: CreditCard, label: 'Unlimited leads → 10 leads max' },
    { icon: Sparkles, label: 'Deep lead analysis' },
    { icon: ArrowRight, label: 'Outreach sequences' },
    { icon: Shield, label: 'Sales coaching sessions' },
    { icon: CheckCircle2, label: 'Proposal generation' },
    { icon: AlertTriangle, label: 'Competitor analysis' },
    { icon: ExternalLink, label: 'Data export (PDF)' },
  ],
  elite: [
    { icon: Sparkles, label: 'White-label reports' },
    { icon: Shield, label: 'Team collaboration' },
    { icon: Zap, label: 'Custom integrations & API access' },
    { icon: CheckCircle2, label: 'Dedicated account manager' },
    { icon: CreditCard, label: 'Custom AI training' },
    { icon: ShieldCheck, label: 'SLA guarantee' },
    { icon: ArrowRight, label: '2,000 → 50 monthly credits' },
  ],
};

export function CancelSubscriptionCard({
  currentPlan,
  onCancelConfirm,
  onKeepSubscription,
}: CancelSubscriptionCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [cancelDate, setCancelDate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const planDetails = PLAN_DETAILS[currentPlan];
  const lostFeatures = CANCEL_FEATURES[currentPlan] || [];

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    setCancelResult('idle');
    setErrorMessage(null);

    try {
      const result = await cancelSubscription();
      if (result.success) {
        setCancelResult('success');
        const endDate = result.currentPeriodEnd
          ? new Date(result.currentPeriodEnd).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : 'end of current billing period';
        setCancelDate(endDate);
        onCancelConfirm?.();
      } else {
        setCancelResult('error');
        setErrorMessage(result.error || 'Failed to cancel subscription.');
      }
    } catch {
      setCancelResult('error');
      setErrorMessage('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  }, [onCancelConfirm]);

  return (
    <motion.div {...fadeInUp}>
      <Card className="border-red-500/10 dark:border-red-500/20 overflow-hidden">
        <AnimatePresence mode="wait">
          {cancelResult === 'success' ? (
            <motion.div
              key="cancelled"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center"
              >
                <Ban className="h-7 w-7 text-amber-500" />
              </motion.div>
              <div>
                <h3 className="font-semibold text-amber-600 dark:text-amber-400">
                  Subscription Cancelled
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Your {planDetails.name} plan will remain active until{' '}
                  <span className="font-medium text-foreground">{cancelDate}</span>.
                  After that, you&apos;ll be moved to the Free plan.
                </p>
              </div>
              <Badge variant="secondary" className="gap-1.5 mt-1">
                <Clock className="h-3 w-3" />
                Access until {cancelDate}
              </Badge>
            </motion.div>
          ) : (
            <motion.div key="cancel-form" {...scaleIn}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Cancel Subscription</CardTitle>
                    <CardDescription>
                      Are you sure you want to cancel your {planDetails.name} plan?
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Warning message */}
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      You will lose access to all {planDetails.name} features at the end of your
                      current billing period. This action cannot be reversed until the next billing
                      cycle.
                    </span>
                  </p>
                </div>

                {/* Features that will be removed */}
                <div>
                  <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                    <X className="h-4 w-4" />
                    Features you&apos;ll lose
                  </h4>
                  <div className="space-y-2">
                    {lostFeatures.slice(0, showConfirmation ? undefined : 4).map(({ icon: FIcon, label }) => (
                      <motion.div
                        key={label}
                        {...staggerItem}
                        className="flex items-center gap-2.5 text-sm text-foreground/70"
                      >
                        <FIcon className="h-4 w-4 text-red-400/60 shrink-0" />
                        <span>{label}</span>
                      </motion.div>
                    ))}
                    {lostFeatures.length > 4 && !showConfirmation && (
                      <button
                        onClick={() => setShowConfirmation(true)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 ml-6"
                      >
                        <ChevronDown className="h-3 w-3" />
                        +{lostFeatures.length - 4} more features
                      </button>
                    )}
                    {showConfirmation && lostFeatures.length > 4 && (
                      <button
                        onClick={() => setShowConfirmation(false)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 ml-6"
                      >
                        <ChevronUp className="h-3 w-3" />
                        Show less
                      </button>
                    )}
                  </div>
                </div>

                {/* Error state */}
                {cancelResult === 'error' && errorMessage && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    <Alert variant="destructive" className="py-2.5">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="text-xs font-semibold">Cancellation Failed</AlertTitle>
                      <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-0">
                <Button
                  variant="outline"
                  className="gap-2 font-semibold flex-1 sm:flex-none"
                  onClick={onKeepSubscription}
                >
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                  Keep Subscription
                </Button>
                <Button
                  variant="destructive"
                  className="gap-2 font-semibold flex-1 sm:flex-none"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
                      Cancel Anyway
                    </>
                  )}
                </Button>
              </CardFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 4. GracePeriodCard — Grace period countdown & access status
// ═══════════════════════════════════════════════════════════════════

interface GracePeriodCardProps {
  daysRemaining: number;
  gracePeriodEndsAt: string | null;
  currentPlan: PlanType;
  onUpdatePayment?: () => void;
}

export function GracePeriodCard({
  daysRemaining,
  gracePeriodEndsAt,
  currentPlan,
  onUpdatePayment,
}: GracePeriodCardProps) {
  const [now, setNow] = useState(Date.now());

  // Live countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const percentage = Math.max(0, Math.min(100, (daysRemaining / GRACE_PERIOD_DAYS) * 100));

  const progressColor = useMemo(() => {
    if (daysRemaining <= 1) return 'bg-red-500';
    if (daysRemaining <= 3) return 'bg-orange-500';
    if (daysRemaining <= 5) return 'bg-amber-500';
    return 'bg-green-500';
  }, [daysRemaining]);

  const progressTrackColor = useMemo(() => {
    if (daysRemaining <= 1) return 'bg-red-500/20';
    if (daysRemaining <= 3) return 'bg-orange-500/20';
    if (daysRemaining <= 5) return 'bg-amber-500/20';
    return 'bg-green-500/20';
  }, [daysRemaining]);

  const formattedEndDate = useMemo(() => {
    if (!gracePeriodEndsAt) return 'Unknown';
    try {
      return new Date(gracePeriodEndsAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return gracePeriodEndsAt;
    }
  }, [gracePeriodEndsAt]);

  const timeRemaining = useMemo(() => {
    if (!gracePeriodEndsAt) return null;
    const end = new Date(gracePeriodEndsAt).getTime();
    const diff = end - now;
    if (diff <= 0) return { hours: 0, minutes: 0 };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  }, [gracePeriodEndsAt, now]);

  const isUrgent = daysRemaining <= 2;
  const isExpired = daysRemaining <= 0;

  // Feature access status for the current plan
  const featureAccess = useMemo(() => {
    if (currentPlan === 'free') return [];
    const planInfo = PLAN_DETAILS[currentPlan];
    return [
      { name: 'Dashboard & Stats', accessible: true },
      { name: 'Lead Management', accessible: daysRemaining > 1 },
      { name: 'AI Features', accessible: daysRemaining > 3 },
      { name: 'Outreach', accessible: daysRemaining > 2 },
      { name: 'Export & Reports', accessible: daysRemaining > 0 },
      { name: 'Priority Support', accessible: true },
    ];
  }, [currentPlan, daysRemaining]);

  return (
    <motion.div {...fadeInUp}>
      <Card
        className={cn(
          'overflow-hidden',
          isExpired
            ? 'border-red-500/20 dark:border-red-500/30'
            : isUrgent
              ? 'border-orange-500/20 dark:border-orange-500/30'
              : 'border-amber-500/10 dark:border-amber-500/20'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                isExpired
                  ? 'bg-red-500/10'
                  : isUrgent
                    ? 'bg-orange-500/10'
                    : 'bg-amber-500/10'
              )}
            >
              <Clock
                className={cn(
                  'h-5 w-5',
                  isExpired
                    ? 'text-red-500'
                    : isUrgent
                      ? 'text-orange-500'
                      : 'text-amber-500'
                )}
              />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Grace Period</CardTitle>
              <CardDescription>
                {isExpired
                  ? 'Your grace period has expired'
                  : 'Update your payment to keep your features'}
              </CardDescription>
            </div>
            <Badge
              className={cn(
                'ml-auto shrink-0',
                isExpired
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                  : isUrgent
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              )}
              variant="outline"
            >
              {isExpired ? 'Expired' : `${daysRemaining}d left`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-0">
          {/* Circular progress indicator */}
          <div className="flex items-center justify-center">
            <div className="relative h-28 w-28">
              {/* Background circle */}
              <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className={progressTrackColor}
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - percentage / 100)}`}
                  className={progressColor}
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={cn(
                    'text-2xl font-bold',
                    isExpired
                      ? 'text-red-500'
                      : isUrgent
                        ? 'text-orange-500'
                        : 'text-amber-500'
                  )}
                >
                  {daysRemaining}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  days left
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Grace period progress</span>
              <span className="text-xs font-medium">{Math.round(percentage)}%</span>
            </div>
            <Progress
              value={percentage}
              className={cn('h-2', progressTrackColor)}
            />
          </div>

          {/* Countdown timer */}
          {timeRemaining && !isExpired && (
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <span className="text-lg font-bold tabular-nums">{timeRemaining.hours}</span>
                <p className="text-[10px] text-muted-foreground uppercase">Hours</p>
              </div>
              <span className="text-muted-foreground/30 text-lg">:</span>
              <div className="text-center">
                <span className="text-lg font-bold tabular-nums">
                  {String(timeRemaining.minutes).padStart(2, '0')}
                </span>
                <p className="text-[10px] text-muted-foreground uppercase">Minutes</p>
              </div>
            </div>
          )}

          <Separator />

          {/* End date */}
          <div className="flex items-center gap-2.5 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Grace period ends:</span>
            <span className="font-medium">{formattedEndDate}</span>
          </div>

          {/* Feature access status */}
          {featureAccess.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Feature Access
              </h4>
              <div className="space-y-2">
                {featureAccess.map((feature) => (
                  <motion.div
                    key={feature.name}
                    {...staggerItem}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{feature.name}</span>
                    {feature.accessible ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] bg-green-500/5 text-green-600 dark:text-green-400 border-green-500/20"
                      >
                        <Eye className="h-2.5 w-2.5" />
                        Available
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] bg-red-500/5 text-red-600 dark:text-red-400 border-red-500/20"
                      >
                        <EyeOff className="h-2.5 w-2.5" />
                        Restricted
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-0">
          <Button
            className={cn(
              'w-full gap-2',
              isExpired || isUrgent
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : ''
            )}
            onClick={onUpdatePayment}
          >
            <CreditCard className="h-4 w-4" />
            {isExpired ? 'Restore Access Now' : 'Update Payment Method'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 5. PaymentStatusOverview — Full payment status dashboard
// ═══════════════════════════════════════════════════════════════════

interface PaymentStatusOverviewProps {
  paymentStatus: PaymentStatusData;
  currentPlan: PlanType;
  onRetryPayment?: () => void;
  onUpdatePayment?: () => void;
  onCancelSubscription?: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }
> = {
  active: {
    label: 'Active',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    icon: ShieldCheck,
  },
  trialing: {
    label: 'Trial',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    icon: Clock,
  },
  past_due: {
    label: 'Past Due',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    icon: ShieldAlert,
  },
  canceled: {
    label: 'Cancelled',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    icon: Ban,
  },
  expired: {
    label: 'Expired',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/20',
    icon: XCircle,
  },
};

export function PaymentStatusOverview({
  paymentStatus,
  currentPlan,
  onRetryPayment,
  onUpdatePayment,
  onCancelSubscription,
}: PaymentStatusOverviewProps) {
  const statusKey = paymentStatus.subscriptionStatus || 'expired';
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.expired;
  const StatusIcon = statusConfig.icon;
  const planDetails = PLAN_DETAILS[currentPlan];

  const formattedNextPayment = useMemo(() => {
    if (!paymentStatus.nextPaymentDate) return 'N/A';
    try {
      return new Date(paymentStatus.nextPaymentDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return paymentStatus.nextPaymentDate;
    }
  }, [paymentStatus.nextPaymentDate]);

  const formattedGraceEnd = useMemo(() => {
    const dateStr = paymentStatus.gracePeriodInfo.gracePeriodEndsAt;
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }, [paymentStatus.gracePeriodInfo.gracePeriodEndsAt]);

  return (
    <motion.div {...fadeInUp}>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                  statusConfig.bgColor
                )}
              >
                <StatusIcon className={cn('h-5 w-5', statusConfig.color)} />
              </div>
              <div>
                <CardTitle className="text-base">Payment Status</CardTitle>
                <CardDescription>Subscription & billing overview</CardDescription>
              </div>
            </div>
            <Badge
              className={cn(
                'gap-1.5',
                statusConfig.bgColor,
                statusConfig.color,
                statusConfig.borderColor
              )}
              variant="outline"
            >
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Status grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Current plan */}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-0.5">Current Plan</p>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {planDetails.name}
              </p>
            </div>

            {/* Next billing date */}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-0.5">Next Billing</p>
              <p className="text-sm font-semibold">{formattedNextPayment}</p>
            </div>

            {/* Payment method (masked placeholder) */}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-0.5">Payment Method</p>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                •••• 4242
              </p>
            </div>

            {/* Failed payments */}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-0.5">Failed Payments</p>
              <p
                className={cn(
                  'text-sm font-semibold flex items-center gap-1.5',
                  paymentStatus.failedPayments > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                )}
              >
                {paymentStatus.failedPayments > 0 ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {paymentStatus.failedPayments}
              </p>
            </div>
          </div>

          <Separator />

          {/* Grace period info */}
          {paymentStatus.hasPastDue && paymentStatus.gracePeriodInfo.inGracePeriod && (
            <div
              className={cn(
                'p-3 rounded-xl border',
                paymentStatus.gracePeriodInfo.daysRemaining <= 2
                  ? 'bg-red-500/5 border-red-500/10'
                  : 'bg-amber-500/5 border-amber-500/10'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock
                    className={cn(
                      'h-4 w-4',
                      paymentStatus.gracePeriodInfo.daysRemaining <= 2
                        ? 'text-red-500'
                        : 'text-amber-500'
                    )}
                  />
                  <span className="text-sm font-medium">Grace Period</span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    paymentStatus.gracePeriodInfo.daysRemaining <= 2
                      ? 'bg-red-500/5 text-red-600 dark:text-red-400 border-red-500/20'
                      : 'bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  )}
                >
                  {paymentStatus.gracePeriodInfo.daysRemaining}d remaining
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Ends on {formattedGraceEnd}
              </p>
            </div>
          )}

          {/* Scheduled changes */}
          {paymentStatus.scheduledDowngrade.isScheduled && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Scheduled Change</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {paymentStatus.scheduledDowngrade.cancelAtPeriodEnd
                  ? 'Your subscription will be cancelled at the end of the current billing period.'
                  : paymentStatus.scheduledDowngrade.scheduledPlanChange
                    ? `Your plan will change to ${paymentStatus.scheduledDowngrade.scheduledPlanChange} at the end of the billing period.`
                    : 'A change is scheduled for your subscription.'}
              </p>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {paymentStatus.hasPastDue && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={onRetryPayment}
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry Payment
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={onUpdatePayment}
              >
                <CreditCard className="h-3 w-3" />
                Update Payment
              </Button>
              {currentPlan !== 'free' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 text-red-500/70 hover:text-red-500 hover:bg-red-500/5 border-red-500/20"
                  onClick={onCancelSubscription}
                >
                  <Ban className="h-3 w-3" />
                  Cancel Plan
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Default Export: PaymentRecoveryUI
// Conditionally renders appropriate sub-components based on payment
// status fetched from /api/payments/status
// ═══════════════════════════════════════════════════════════════════

export default function PaymentRecoveryUI({ className }: PaymentRecoveryUIProps) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showCancelCard, setShowCancelCard] = useState(false);
  const [failedPayment, setFailedPayment] = useState<FailedPaymentDetail | null>(null);

  // Subscription store
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const subscriptionStatus = useSubscriptionStore((s) => s.subscriptionStatus);

  // Fetch payment status
  const loadPaymentStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPaymentStatus();
      setPaymentStatus(data);

      // If there's a past due status, create a mock failed payment detail
      // (In production, this would come from a separate API call)
      if (data.hasPastDue && !failedPayment) {
        const planInfo = PLAN_DETAILS[currentPlan];
        setFailedPayment({
          id: 'failed-order-latest',
          plan: currentPlan,
          amount: planInfo.priceUSD,
          currency: 'USD',
          billingCycle: 'monthly',
          createdAt: new Date().toISOString(),
          status: 'failed',
        });
      }

      // Sync store status
      if (data.subscriptionStatus) {
        useSubscriptionStore.getState().setSubscriptionStatus(data.subscriptionStatus);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment status');
    } finally {
      setLoading(false);
    }
  }, [currentPlan, failedPayment]);

  useEffect(() => {
    loadPaymentStatus();
  }, [loadPaymentStatus]);

  // Auto-refresh after actions (every 30 seconds if past_due)
  useEffect(() => {
    if (paymentStatus?.hasPastDue) {
      const interval = setInterval(loadPaymentStatus, 30_000);
      return () => clearInterval(interval);
    }
  }, [paymentStatus?.hasPastDue, loadPaymentStatus]);

  const handleRetrySuccess = useCallback(() => {
    // Refresh payment status after successful retry
    setTimeout(loadPaymentStatus, 2000);
  }, [loadPaymentStatus]);

  const handleCancelConfirm = useCallback(() => {
    setTimeout(loadPaymentStatus, 2000);
  }, [loadPaymentStatus]);

  // Loading state
  if (loading && !paymentStatus) {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Skeleton banner */}
        <div className="h-10 rounded-lg skeleton-wave" />
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl skeleton-wave" />
          <div className="h-64 rounded-xl skeleton-wave" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !paymentStatus) {
    return (
      <div className={cn('', className)}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to load payment status</AlertTitle>
          <AlertDescription className="flex items-center gap-2">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={loadPaymentStatus}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // If no payment status data, don't render anything
  if (!paymentStatus) return null;

  const isPastDue = paymentStatus.hasPastDue;
  const isCanceled = paymentStatus.subscriptionStatus === 'canceled';
  const isExpired = paymentStatus.subscriptionStatus === 'expired';
  const isGracePeriod = paymentStatus.gracePeriodInfo.inGracePeriod;
  const daysRemaining = paymentStatus.gracePeriodInfo.daysRemaining;

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Past Due Banner ── */}
      {isPastDue && !bannerDismissed && (
        <PastDueBanner
          daysRemaining={daysRemaining}
          onUpdatePayment={() => {
            // In production, this would open the checkout modal
            window.location.href = '/settings?tab=billing';
          }}
          onRetryPayment={() => {
            // Trigger retry on the failed payment card
            if (failedPayment) {
              retryPayment(failedPayment.id);
            }
          }}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: status + grace period */}
        <div className="space-y-4">
          {/* Payment Status Overview — always shown */}
          <PaymentStatusOverview
            paymentStatus={paymentStatus}
            currentPlan={currentPlan}
            onRetryPayment={() => {
              // Scroll to or focus the retry card
              if (failedPayment) {
                retryPayment(failedPayment.id);
              }
            }}
            onUpdatePayment={() => {
              window.location.href = '/settings?tab=billing';
            }}
            onCancelSubscription={() => setShowCancelCard(true)}
          />

          {/* Grace Period Card — only when in grace period */}
          {isGracePeriod && (
            <GracePeriodCard
              daysRemaining={daysRemaining}
              gracePeriodEndsAt={paymentStatus.gracePeriodInfo.gracePeriodEndsAt}
              currentPlan={currentPlan}
              onUpdatePayment={() => {
                window.location.href = '/settings?tab=billing';
              }}
            />
          )}
        </div>

        {/* Right column: retry + cancel */}
        <div className="space-y-4">
          {/* Retry Payment Card — only when there's a failed payment */}
          {isPastDue && failedPayment && !isExpired && (
            <RetryPaymentCard
              failedPayment={failedPayment}
              onRetrySuccess={handleRetrySuccess}
              onChangePlan={() => {
                window.location.href = '/pricing';
              }}
              onCancel={() => setShowCancelCard(true)}
            />
          )}

          {/* Cancel Subscription Card — shown when user clicks cancel */}
          {showCancelCard && !isCanceled && !isExpired && currentPlan !== 'free' && (
            <CancelSubscriptionCard
              currentPlan={currentPlan}
              onCancelConfirm={handleCancelConfirm}
              onKeepSubscription={() => setShowCancelCard(false)}
            />
          )}

          {/* Cancellation confirmation — if subscription is canceled */}
          {isCanceled && (
            <motion.div {...fadeInUp}>
              <Card className="border-amber-500/10 dark:border-amber-500/20 overflow-hidden">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Ban className="h-7 w-7 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-600 dark:text-amber-400">
                      Subscription Cancelled
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your subscription has been cancelled. You&apos;ll retain access until the
                      end of your current billing period.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      window.location.href = '/pricing';
                    }}
                  >
                    <Sparkles className="h-3 w-3" />
                    Resubscribe
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Expired subscription notice */}
          {isExpired && (
            <motion.div {...fadeInUp}>
              <Card className="border-gray-500/10 dark:border-gray-500/20 overflow-hidden">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-gray-500/10 flex items-center justify-center">
                    <XCircle className="h-7 w-7 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-600 dark:text-gray-400">
                      Subscription Expired
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your subscription has expired and your account has been moved to the Free
                      plan. Upgrade anytime to restore access.
                    </p>
                  </div>
                  <Button
                    className="gap-1.5"
                    onClick={() => {
                      window.location.href = '/pricing';
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade Now
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
