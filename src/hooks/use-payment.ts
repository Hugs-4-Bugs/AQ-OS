// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — usePayment Hook
// Phase 5: Payments System
//
// Custom hook for payment operations: Razorpay, Stripe, coupons,
// payment status polling, subscription cancellation, billing preview.
// ═══════════════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSubscriptionStore, PLAN_DETAILS, type PlanType } from '@/lib/subscription-store';
import { useAuthStore } from '@/lib/auth-store';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'idle'
  | 'processing'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'timeout';

export interface CheckoutData {
  orderId: string;
  amount: number;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  gstRate: number;
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  creditsAllocated: number;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  stripeCheckoutUrl?: string;
}

export interface CouponValidation {
  valid: boolean;
  code?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountAmount?: number;
  finalAmount?: number;
  error?: string;
}

export interface BillingPreview {
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  creditsAllocated: number;
  proration?: number;
  effectiveDate?: string;
  featureGains?: string[];
  featureLosses?: string[];
}

export interface PaymentHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  plan: string;
  billingCycle: string;
  provider: string;
  status: string;
  couponCode: string | null;
  discountAmount: number;
  taxAmount: number;
  createdAt: string;
}

export interface InvoiceEntry {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  createdAt: string;
  paymentOrder: {
    plan: string;
    billingCycle: string;
    status: string;
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function usePayment() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [couponValidation, setCouponValidation] = useState<CouponValidation | null>(null);
  const [billingPreview, setBillingPreview] = useState<BillingPreview | null>(null);

  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const setPlan = useSubscriptionStore((s) => s.setPlan);
  const syncFromBackend = useSubscriptionStore((s) => s.syncFromBackend);
  const user = useAuthStore((s) => s.user);
  const updatePlan = useAuthStore((s) => s.updatePlan);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCancelledRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingCancelledRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // ── Load Razorpay script ─────────────────────────────────────────────
  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
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

  // ── Poll payment status after Razorpay payment ───────────────────────
  const pollPaymentStatus = useCallback(async (orderId: string) => {
    const maxAttempts = 30;
    const interval = 1000;

    pollingCancelledRef.current = false;

    for (let i = 0; i < maxAttempts; i++) {
      // Check if polling was cancelled (component unmounted)
      if (pollingCancelledRef.current) return;

      try {
        const res = await fetch(`/api/payments/history?limit=10`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          const order = data.orders?.find((o: PaymentHistoryEntry) => o.id === orderId);
          if (order?.status === 'completed') {
            setPaymentStatus('success');
            return;
          }
          if (order?.status === 'failed') {
            setPaymentStatus('failed');
            return;
          }
        }
      } catch {
        // Continue polling on network errors
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    // Check again before setting timeout (component may have unmounted during loop)
    if (!pollingCancelledRef.current) {
      setPaymentStatus('timeout');
    }
  }, []);

  // ── Open Razorpay checkout ───────────────────────────────────────────
  const openRazorpayCheckout = useCallback(async (orderData: CheckoutData) => {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast.error('Failed to load Razorpay. Please check your internet connection.');
      setPaymentStatus('failed');
      return;
    }

    setPaymentStatus('processing');

    const options = {
      key: orderData.razorpayKeyId || 'rzp_test_dev',
      amount: Math.round(orderData.amount * 100), // Razorpay expects paise
      currency: orderData.currency,
      name: 'AcquisitionOS',
      description: `${PLAN_DETAILS[orderData.plan]?.name || orderData.plan} Plan - ${orderData.billingCycle}`,
      order_id: orderData.razorpayOrderId,
      handler: function (_response: any) {
        // Payment successful on frontend — but we DON'T trust this alone
        // We wait for webhook to confirm via polling
        setPaymentStatus('verifying');
        pollPaymentStatus(orderData.orderId);
      },
      prefill: {
        name: user?.name || '',
        email: user?.email || '',
      },
      theme: {
        color: '#6C63FF',
      },
      modal: {
        ondismiss: function () {
          setPaymentStatus('idle');
          setIsProcessing(false);
        },
      },
    };

    try {
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (_response: any) {
        setPaymentStatus('failed');
        setIsProcessing(false);
      });
      rzp.open();
    } catch {
      toast.error('Failed to open Razorpay checkout.');
      setPaymentStatus('failed');
      setIsProcessing(false);
    }
  }, [loadRazorpayScript, pollPaymentStatus, user]);

  // ── Initiate Razorpay payment (create order + open checkout) ────────
  const initiatePayment = useCallback(async (
    plan: PlanType,
    billingCycle: 'monthly' | 'yearly',
    couponCode?: string,
  ) => {
    setIsProcessing(true);
    setPaymentStatus('processing');

    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          billingCycle,
          couponCode: couponCode || undefined,
          currency: 'INR',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to create order' }));
        throw new Error(data.error || 'Failed to create order');
      }

      const data: CheckoutData = await res.json();
      setCheckoutData(data);

      // Open Razorpay checkout
      await openRazorpayCheckout(data);
    } catch (error: any) {
      toast.error(error.message || 'Payment initiation failed');
      setPaymentStatus('failed');
      setIsProcessing(false);
    }
  }, [openRazorpayCheckout]);

  // ── Initiate Stripe payment (create checkout session + redirect) ────
  const initiateStripePayment = useCallback(async (
    plan: PlanType,
    billingCycle: 'monthly' | 'yearly',
    couponCode?: string,
  ) => {
    setIsProcessing(true);
    setPaymentStatus('processing');

    try {
      // First create the order
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          billingCycle,
          couponCode: couponCode || undefined,
          currency: 'USD',
        }),
      });

      if (!orderRes.ok) {
        const data = await orderRes.json().catch(() => ({ error: 'Failed to create order' }));
        throw new Error(data.error || 'Failed to create order');
      }

      const orderData: CheckoutData = await orderRes.json();
      setCheckoutData(orderData);

      // Then create Stripe checkout session
      const stripeRes = await fetch('/api/payments/create-stripe-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          billingCycle,
          couponCode: couponCode || undefined,
        }),
      });

      if (!stripeRes.ok) {
        const data = await stripeRes.json().catch(() => ({ error: 'Failed to create Stripe session' }));
        throw new Error(data.error || 'Failed to create Stripe session');
      }

      const stripeData = await stripeRes.json();

      if (stripeData.url) {
        window.location.href = stripeData.url;
        return;
      }

      throw new Error('No checkout URL returned from Stripe');
    } catch (error: any) {
      toast.error(error.message || 'Stripe payment initiation failed');
      setPaymentStatus('failed');
      setIsProcessing(false);
    }
  }, []);

  // ── Validate coupon ──────────────────────────────────────────────────
  const validateCoupon = useCallback(async (code: string, plan?: PlanType) => {
    try {
      const res = await fetch('/api/payments/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code,
          plan: plan || currentPlan,
          baseAmount: PLAN_DETAILS[plan || currentPlan]?.priceINR || 0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const validation: CouponValidation = {
          valid: false,
          error: data.error || 'Invalid coupon code',
        };
        setCouponValidation(validation);
        return validation;
      }

      const validation: CouponValidation = {
        valid: true,
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountAmount: data.discountAmount,
        finalAmount: data.finalAmount,
      };
      setCouponValidation(validation);
      return validation;
    } catch {
      const validation: CouponValidation = {
        valid: false,
        error: 'Network error. Please try again.',
      };
      setCouponValidation(validation);
      return validation;
    }
  }, [currentPlan]);

  // ── Retry payment ────────────────────────────────────────────────────
  const retryPayment = useCallback(async (failedOrderId?: string) => {
    if (!checkoutData) {
      toast.error('No previous checkout data found. Please start a new payment.');
      return;
    }

    setPaymentStatus('idle');
    setIsProcessing(false);

    // Re-initiate with same parameters
    if (checkoutData.currency === 'INR') {
      await initiatePayment(checkoutData.plan, checkoutData.billingCycle);
    } else {
      await initiateStripePayment(checkoutData.plan, checkoutData.billingCycle);
    }
  }, [checkoutData, initiatePayment, initiateStripePayment]);

  // ── Cancel subscription ──────────────────────────────────────────────
  const cancelSubscription = useCallback(async (reason?: string) => {
    try {
      const res = await fetch('/api/payments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to cancel subscription' }));
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      toast.success('Subscription cancelled. You can continue using your plan until the end of the billing period.');
      // Re-sync subscription data
      try {
        const subRes = await fetch('/api/subscriptions/current', { credentials: 'include' });
        if (subRes.ok) {
          const subData = await subRes.json();
          syncFromBackend(subData);
        }
      } catch {
        // Silent fail on re-sync
      }
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel subscription');
      return false;
    }
  }, [syncFromBackend]);

  // ── Get billing preview ──────────────────────────────────────────────
  const getBillingPreview = useCallback(async (plan: PlanType, billingCycle: 'monthly' | 'yearly') => {
    try {
      const res = await fetch('/api/subscriptions/upgrade-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, billingCycle }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      setBillingPreview(data);
      return data as BillingPreview;
    } catch {
      return null;
    }
  }, []);

  // ── Reset state ──────────────────────────────────────────────────────
  const resetPaymentState = useCallback(() => {
    setPaymentStatus('idle');
    setIsProcessing(false);
    setCheckoutData(null);
    setCouponValidation(null);
  }, []);

  // ── Confirm payment success (update local stores) ───────────────────
  // NOTE: This is called after the webhook has confirmed payment (or after
  // the user returns from Stripe checkout). The actual subscription
  // activation happens server-side via /api/payments/webhook/stripe; this
  // method only refreshes the local cache. The toast message intentionally
  // says "Payment received" rather than "Plan upgraded" because the upgrade
  // may still be in flight (the webhook can take a few seconds to land).
  const confirmPaymentSuccess = useCallback(async (plan: PlanType) => {
    setPlan(plan);
    updatePlan(plan);
    toast.info(`Payment received. Your plan will be updated to ${PLAN_DETAILS[plan].name} shortly.`);

    // Re-sync subscription data from backend
    try {
      const subRes = await fetch('/api/subscriptions/current', { credentials: 'include' });
      if (subRes.ok) {
        const subData = await subRes.json();
        syncFromBackend(subData);
      }
    } catch {
      // Silent fail on re-sync
    }
  }, [setPlan, updatePlan, syncFromBackend]);

  return {
    // State
    isProcessing,
    checkoutData,
    paymentStatus,
    couponValidation,
    billingPreview,

    // Actions
    initiatePayment,
    initiateStripePayment,
    validateCoupon,
    retryPayment,
    cancelSubscription,
    getBillingPreview,
    resetPaymentState,
    confirmPaymentSuccess,
    setPaymentStatus,
  };
}
