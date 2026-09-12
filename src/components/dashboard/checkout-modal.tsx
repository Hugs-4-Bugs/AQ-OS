// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Checkout Modal
// Phase 5: Payments System
//
// Full checkout modal that handles both Razorpay (INR) and Stripe (USD)
// payment flows. Shows order summary, coupon code, GST breakdown,
// and payment status with polling.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Loader2,
  BadgeCheck,
  AlertCircle,
  Shield,
  Zap,
  Receipt,
  Tag,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Globe,
  IndianRupee,
  Info,
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
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useSubscriptionStore,
  PLAN_DETAILS,
  type PlanType,
} from '@/lib/subscription-store';
import { usePayment, type PaymentStatus } from '@/hooks/use-payment';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  currentPlan: PlanType;
}

// ─── Currency selector ──────────────────────────────────────────────────────────

type Currency = 'INR' | 'USD';

// ─── Animation variants ─────────────────────────────────────────────────────────

const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3 },
};

// ─── Status display ─────────────────────────────────────────────────────────────

function PaymentStatusDisplay({ status }: { status: PaymentStatus }) {
  const statusConfig: Record<PaymentStatus, { icon: React.ReactNode; text: string; color: string }> = {
    idle: {
      icon: <CreditCard className="h-5 w-5" />,
      text: 'Ready to pay',
      color: 'text-muted-foreground',
    },
    processing: {
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      text: 'Processing payment...',
      color: 'text-primary',
    },
    verifying: {
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      text: 'Verifying payment...',
      color: 'text-amber-500',
    },
    success: {
      icon: <BadgeCheck className="h-5 w-5" />,
      text: 'Payment successful!',
      color: 'text-emerald-500',
    },
    failed: {
      icon: <AlertCircle className="h-5 w-5" />,
      text: 'Payment failed',
      color: 'text-red-500',
    },
    timeout: {
      icon: <AlertCircle className="h-5 w-5" />,
      text: 'Verification timed out',
      color: 'text-amber-500',
    },
  };

  const config = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 text-sm font-medium"
    >
      <span className={config.color}>{config.icon}</span>
      <span className={config.color}>{config.text}</span>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function CheckoutModal({
  open,
  onOpenChange,
  plan,
  billingCycle,
  currentPlan,
}: CheckoutModalProps) {
  const planDetails = PLAN_DETAILS[plan];
  const isYearly = billingCycle === 'yearly';

  const [currency, setCurrency] = useState<Currency>('INR');
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // paymentInProgress is true from the moment the user clicks "Pay" until
  // EITHER the Stripe redirect happens (window.location.href is set, modal
  // state no longer matters) OR the API call fails. While true it prevents
  // the modal from being dismissed (Esc, outside click, X button) so the
  // user can't accidentally abandon a checkout session mid-flight.
  const [paymentInProgress, setPaymentInProgress] = useState(false);

  const {
    isProcessing,
    paymentStatus,
    validateCoupon,
    initiatePayment,
    initiateStripePayment,
    resetPaymentState,
  } = usePayment();

  // ── Calculate pricing ──────────────────────────────────────────────
  const basePrice = isYearly
    ? (currency === 'INR' ? planDetails.yearlyINR : planDetails.yearlyUSD)
    : (currency === 'INR' ? planDetails.priceINR : planDetails.priceUSD);

  const subtotal = Math.max(0, basePrice - discountAmount);
  const gstRate = currency === 'INR' ? 0.18 : 0;
  const taxAmount = Math.round(subtotal * gstRate * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  const isUpgrade = PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan);
  const isDowngrade = PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(currentPlan);
  const isSame = plan === currentPlan;

  // ── Reset state when modal closes ────────────────────────────
  const prevOpenRef = useRef(open);
  useEffect(() => {
    prevOpenRef.current = open;
  }, [open]);

  const handleClose = useCallback(() => {
    if (paymentInProgress) return;
    setCouponCode('');
    setCouponApplied(false);
    setCouponError('');
    setDiscountPercent(0);
    setDiscountAmount(0);
    setIsUpgrading(false);
    setPaymentInProgress(false);
    resetPaymentState();
    onOpenChange(false);
  }, [resetPaymentState, onOpenChange, paymentInProgress]);

  // ── Coupon validation ──────────────────────────────────────────────
  const handleApplyCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');

    const result = await validateCoupon(couponCode.trim(), plan);

    if (result.valid) {
      setCouponApplied(true);
      setDiscountPercent(result.discountValue || 0);
      setDiscountAmount(result.discountAmount || 0);
      toast.success(`Coupon "${couponCode.trim().toUpperCase()}" applied! ${result.discountValue || 0}% discount`);
    } else {
      setCouponError(result.error || 'Invalid coupon code');
      setCouponApplied(false);
      setDiscountPercent(0);
      setDiscountAmount(0);
    }

    setCouponLoading(false);
  }, [couponCode, plan, validateCoupon]);

  // ── Remove coupon ──────────────────────────────────────────────────
  const handleRemoveCoupon = useCallback(() => {
    setCouponCode('');
    setCouponApplied(false);
    setCouponError('');
    setDiscountPercent(0);
    setDiscountAmount(0);
  }, []);

  // ── Handle Razorpay payment ────────────────────────────────────────
  const handleRazorpayPayment = useCallback(async () => {
    setPaymentInProgress(true);
    setIsUpgrading(true);
    try {
      await initiatePayment(plan, billingCycle, couponApplied ? couponCode : undefined);
    } finally {
      // For Razorpay the user stays in the modal — release the lock once
      // the hook has finished its work (overlay opened or error shown).
      // The hook's own isProcessing flag continues to gate the buttons.
      setIsUpgrading(false);
      setPaymentInProgress(false);
    }
  }, [plan, billingCycle, couponApplied, couponCode, initiatePayment]);

  // ── Handle Stripe payment ──────────────────────────────────────────
  // Stripe flow: POST to the server, receive a hosted-checkout URL, then
  // hard-navigate the browser to Stripe. We MUST NOT release the
  // paymentInProgress lock until either the redirect happens (in which
  // case the modal state is irrelevant) or the API call fails.
  const handleStripePayment = useCallback(async () => {
    setPaymentInProgress(true);
    setIsUpgrading(true);
    try {
      await initiateStripePayment(plan, billingCycle, couponApplied ? couponCode : undefined);
      // If initiateStripePayment returned without throwing, it either:
      //   (a) set window.location.href and the browser is mid-navigation,
      //       in which case React state no longer matters, OR
      //   (b) threw before reaching the redirect (caught below).
      // We intentionally leave paymentInProgress=true here so the modal
      // stays locked during the brief window before the browser swaps
      // to Stripe's checkout page.
    } catch (error) {
      // Hook already toasted the error message — just release the lock
      // so the user can close the modal and try again.
      setIsUpgrading(false);
      setPaymentInProgress(false);
      throw error;
    }
  }, [plan, billingCycle, couponApplied, couponCode, initiateStripePayment]);

  // ── Format currency ────────────────────────────────────────────────
  const formatCurrency = (amount: number) => {
    if (currency === 'INR') {
      return `₹${amount.toLocaleString('en-IN')}`;
    }
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const isPaymentActive = paymentStatus === 'processing' || paymentStatus === 'verifying';
  const isPaymentDone = paymentStatus === 'success' || paymentStatus === 'failed' || paymentStatus === 'timeout';
  // Lock the modal while a Stripe redirect is in flight. Razorpay payments
  // release the lock in handleRazorpayPayment's finally block because the
  // user stays in the modal; Stripe payments keep the lock until the
  // browser swaps to Stripe's checkout page.
  const lockModal = paymentInProgress || isPaymentActive;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (lockModal) return; // Don't close while a payment is in flight
      onOpenChange(v);
    }}>
      <DialogContent
        className="max-w-lg w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden"
        showCloseButton={!lockModal}
        onInteractOutside={(e) => {
          if (lockModal) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (lockModal) e.preventDefault();
        }}
      >
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-bold gradient-text flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Checkout
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Complete your {isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'subscription'} to {planDetails.name}
          </DialogDescription>
          {lockModal && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Shield className="h-3 w-3 shrink-0" />
              Complete or cancel your payment before closing.
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="px-6 pb-6 space-y-5">
            {/* ── Plan Summary ──────────────────────────────────────── */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    plan === 'elite' ? 'bg-amber-500/10' : 'bg-primary/10'
                  )}>
                    {plan === 'elite' ? (
                      <span className="text-amber-500">★</span>
                    ) : (
                      <Zap className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{planDetails.name} Plan</h3>
                    <p className="text-xs text-muted-foreground capitalize">{billingCycle} billing</p>
                  </div>
                </div>
                <Badge className={cn(
                  isUpgrade
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : isDowngrade
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-primary/10 text-primary border-primary/20'
                )}>
                  {isUpgrade ? 'Upgrade' : isDowngrade ? 'Downgrade' : 'Subscribe'}
                </Badge>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {planDetails.creditsMonthly.toLocaleString()} credits/month
                </span>
              </div>
            </div>

            {/* ── Currency Toggle ───────────────────────────────────── */}
            <div className="flex items-center gap-2">
              <Button
                variant={currency === 'INR' ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1 gap-1.5', currency === 'INR' && 'bg-primary')}
                onClick={() => setCurrency('INR')}
                disabled={isPaymentActive}
              >
                <IndianRupee className="h-3.5 w-3.5" />
                INR (₹)
              </Button>
              <Button
                variant={currency === 'USD' ? 'default' : 'outline'}
                size="sm"
                className={cn('flex-1 gap-1.5', currency === 'USD' && 'bg-primary')}
                onClick={() => setCurrency('USD')}
                disabled={isPaymentActive}
              >
                <Globe className="h-3.5 w-3.5" />
                USD ($)
              </Button>
            </div>

            {/* ── Coupon Code ───────────────────────────────────────── */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                Coupon Code
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponError('');
                      if (couponApplied) handleRemoveCoupon();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !couponApplied) handleApplyCoupon();
                    }}
                    className={cn(
                      'pr-10',
                      couponApplied && 'border-emerald-500/50 focus-visible:border-emerald-500',
                      couponError && 'border-red-500/50 focus-visible:border-red-500'
                    )}
                    disabled={couponLoading || couponApplied || isPaymentActive}
                    aria-label="Coupon code"
                  />
                  {couponApplied && (
                    <BadgeCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                </div>
                {couponApplied ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveCoupon}
                    className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    disabled={isPaymentActive}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim() || couponLoading}
                    className="shrink-0 gap-1.5"
                  >
                    {couponLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Apply'
                    )}
                  </Button>
                )}
              </div>
              {couponApplied && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-emerald-500 flex items-center gap-1"
                >
                  <BadgeCheck className="h-3 w-3" />
                  Coupon &quot;{couponCode}&quot; applied — {discountPercent}% off!
                </motion.p>
              )}
              {couponError && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-500 flex items-center gap-1"
                >
                  <AlertCircle className="h-3 w-3" />
                  {couponError}
                </motion.p>
              )}
            </div>

            <Separator />

            {/* ── Order Summary ─────────────────────────────────────── */}
            <div className="space-y-3">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center justify-between w-full text-sm font-semibold"
                disabled={isPaymentActive}
              >
                <span className="flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-primary" />
                  Order Summary
                </span>
                {showBreakdown ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <AnimatePresence>
                {showBreakdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 text-sm">
                      {/* Base price */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {planDetails.name} Plan ({billingCycle})
                        </span>
                        <span className={cn(discountAmount > 0 && 'line-through text-muted-foreground')}>
                          {formatCurrency(basePrice)}
                        </span>
                      </div>

                      {/* Discount */}
                      {discountAmount > 0 && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center justify-between text-emerald-500"
                        >
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Coupon ({couponCode})
                          </span>
                          <span>-{formatCurrency(discountAmount)}</span>
                        </motion.div>
                      )}

                      {/* Subtotal */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatCurrency(subtotal)}</span>
                      </div>

                      {/* GST / Tax */}
                      {currency === 'INR' && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1">
                            GST (18%)
                            <Info className="h-3 w-3" />
                          </span>
                          <span>{formatCurrency(taxAmount)}</span>
                        </div>
                      )}

                      <Separator />

                      {/* Total */}
                      <div className="flex items-center justify-between font-bold text-base">
                        <span>Total</span>
                        <span className="text-primary">{formatCurrency(totalAmount)}</span>
                      </div>

                      {/* Savings badge */}
                      {isYearly && basePrice > 0 && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs gap-0.5">
                            <BadgeCheck className="h-2.5 w-2.5" />
                            Saving {formatCurrency(
                              currency === 'INR'
                                ? (planDetails.priceINR * 12 - planDetails.yearlyINR)
                                : (planDetails.priceUSD * 12 - planDetails.yearlyUSD)
                            )}/year
                          </Badge>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Separator />

            {/* ── Payment Status ────────────────────────────────────── */}
            {paymentStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-xl border p-4',
                  paymentStatus === 'success' && 'bg-emerald-500/5 border-emerald-500/20',
                  paymentStatus === 'failed' && 'bg-red-500/5 border-red-500/20',
                  paymentStatus === 'timeout' && 'bg-amber-500/5 border-amber-500/20',
                  (paymentStatus === 'processing' || paymentStatus === 'verifying') && 'bg-primary/5 border-primary/20',
                )}
              >
                <PaymentStatusDisplay status={paymentStatus} />

                {paymentStatus === 'verifying' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    We&apos;re confirming your payment with the payment gateway. This may take a few seconds...
                  </p>
                )}

                {paymentStatus === 'timeout' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Payment verification is taking longer than expected. If your payment was successful, your subscription will be updated shortly.
                  </p>
                )}
              </motion.div>
            )}

            {/* ── Payment Buttons ───────────────────────────────────── */}
            {paymentStatus === 'idle' && (
              <div className="space-y-3">
                {currency === 'INR' ? (
                  <Button
                    className="w-full gap-2 font-semibold h-12 text-base"
                    onClick={handleRazorpayPayment}
                    disabled={isProcessing || isSame || basePrice === 0}
                    size="lg"
                  >
                    {isProcessing || isUpgrading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5" />
                        Pay {formatCurrency(totalAmount)} with Razorpay
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2 font-semibold h-12 text-base"
                    onClick={handleStripePayment}
                    disabled={isProcessing || isSame || basePrice === 0}
                    size="lg"
                  >
                    {isProcessing || isUpgrading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5" />
                        Pay {formatCurrency(totalAmount)} with Stripe
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}

                {currency === 'INR' ? (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Pay securely via Razorpay. Supports UPI, cards, net banking & wallets.
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground text-center">
                    You&apos;ll be redirected to Stripe checkout to complete payment.
                  </p>
                )}
              </div>
            )}

            {/* ── Retry on failure ──────────────────────────────────── */}
            {(paymentStatus === 'failed' || paymentStatus === 'timeout') && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    resetPaymentState();
                  }}
                >
                  Try Again
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Need help?{' '}
                  <a href="mailto:support@acquisitionos.com" className="text-primary hover:underline">
                    Contact Support
                  </a>
                </p>
              </div>
            )}

            {/* ── Security badges ───────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-emerald-500" />
                <span>SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <BadgeCheck className="h-3 w-3 text-emerald-500" />
                <span>{currency === 'INR' ? 'Razorpay Verified' : 'Stripe Verified'}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-emerald-500" />
                <span>30-Day Refund</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

const PLAN_ORDER: PlanType[] = ['free', 'pro', 'elite'];
