// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RazorpayPaymentProvider
//
// Implements the PaymentProvider contract for Razorpay:
//   • Subscription checkout (recurring, when RAZORPAY_PLAN_* is configured)
//   • One-time order checkout (default fallback, renewals via cron)
//   • Credit add-on one-time orders
//   • Server-side payment verification (signature + gateway API fetch +
//     amount check) — the ONLY path that can mark a client-reported
//     Razorpay payment as payable.
//
// SECURITY RULES (enforced here):
//   • Amounts are ALWAYS computed server-side from PLAN_PRICING / GST.
//   • The browser-reported success state is NEVER trusted — activation
//     happens only after signature verification AND a gateway payment
//     fetch, and remains idempotent (PaymentWebhook dedup + order
//     pending-check inside confirmPaymentAndActivate).
//   • Secrets are never returned to the client (only the public key id).
// ═══════════════════════════════════════════════════════════════════

import Razorpay from 'razorpay';
import { createHmac } from 'crypto';

import { db } from '@/lib/db';
import { createModuleLogger } from '@/lib/observability/logger';
import {
  PLAN_CREDITS,
  isValidPlanChange,
  type PlanType,
} from '@/lib/entitlement-service';
import {
  createPaymentOrder,
  getRazorpayClient,
} from '@/lib/payment-service';
import { verifyPaymentSignature } from '@/lib/razorpay-service';
import { calculateGST, isIndianUser as checkIsIndianUser } from '@/lib/gst-service';
import { logPaymentEvent } from '@/lib/billing-audit';
import { recordWebhookEvent, markWebhookProcessed } from '@/lib/payment-service';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { fulfillCreditAddon, isCreditAddonOrder } from '@/lib/credit-addon-fulfillment';

import type {
  BillingCycle,
  CreateCheckoutResult,
  PaymentProvider,
  PurchaseKind,
  VerifyPaymentParams,
  VerifyPaymentResult,
} from './types';
import { getPlanPrice, getRazorpayPlanId, razorpayPlanEnvName } from './plan-config';

const logger = createModuleLogger({ module: 'razorpay-provider' });

// Total billing cycles for Razorpay subscriptions (mandate tenure).
// Overridable per cycle via RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY / _YEARLY.
function getSubscriptionTotalCount(cycle: BillingCycle): number {
  const envName = `RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_${cycle.toUpperCase()}`;
  const parsed = parseInt(process.env[envName] || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return cycle === 'monthly' ? 12 : 5;
}

function getRazorpayInstance(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/** Constant-time hex signature comparison. */
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly gateway = 'razorpay' as const;
  readonly displayName = 'Razorpay';

  isConfigured(): boolean {
    // Read the env directly (not a module-load snapshot) so the check is
    // always live and testable.
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  }

  getMode(): 'test' | 'live' | null {
    if (!this.isConfigured()) return null;
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    return keyId.startsWith('rzp_test_') ? 'test' : 'live';
  }

  /** Publishable key id for Checkout.js — safe for the browser. */
  private getPublicKeyId(): string | undefined {
    return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || undefined;
  }

  /** Razorpay accounts are India-first; INR is the supported currency for
   * this integration. USD is only advertised when explicitly enabled via
   * RAZORPAY_SUPPORTED_CURRENCIES (accounts with international support). */
  supportedCurrencies(): string[] {
    const raw = (process.env.RAZORPAY_SUPPORTED_CURRENCIES || 'INR')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return raw.length > 0 ? raw : ['INR'];
  }

  canCheckout(_plan: 'pro' | 'elite', _cycle: BillingCycle): boolean {
    // Both one-time orders and subscriptions only need the API keys; the
    // plan/cycle distinction only changes WHICH checkout is used.
    return this.isConfigured();
  }

  /** True when this plan/cycle is mapped to a recurring Razorpay plan. */
  isRecurring(plan: 'pro' | 'elite', cycle: BillingCycle): boolean {
    return !!getRazorpayPlanId(plan, cycle);
  }

  // ─────────────────────────────────────────────────────────────────
  // Checkout creation
  // ─────────────────────────────────────────────────────────────────

  async createCheckout(params: {
    userId: string;
    kind: PurchaseKind;
    plan?: 'pro' | 'elite';
    billingCycle?: BillingCycle;
    creditAmount?: 100 | 500 | 1000;
    couponCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreateCheckoutResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        gateway: 'razorpay',
        error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      };
    }

    if (params.kind === 'credits') {
      return this.createCreditAddonOrder(params);
    }
    return this.createSubscriptionCheckout(params);
  }

  /**
   * Plan checkout. Uses a recurring Razorpay Subscription when the plan is
   * mapped via RAZORPAY_PLAN_*; otherwise a one-time Razorpay order
   * (renewals then handled by the end-of-period cron, matching the Stripe
   * canonical path's server-side renewal semantics).
   */
  private async createSubscriptionCheckout(params: {
    userId: string;
    plan?: 'pro' | 'elite';
    billingCycle?: BillingCycle;
    couponCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreateCheckoutResult> {
    const { userId, couponCode, ipAddress, userAgent } = params;
    const plan = params.plan;
    const billingCycle = params.billingCycle ?? 'monthly';

    if (plan !== 'pro' && plan !== 'elite') {
      return { success: false, gateway: 'razorpay', error: 'Invalid plan. Only Pro and Elite plans require payment.' };
    }
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return { success: false, gateway: 'razorpay', error: 'Invalid billing cycle.' };
    }

    try {
      // Validate user + plan change (same semantics as the Stripe path).
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, plan: true, country: true, name: true, email: true, phone: true },
      });
      if (!user) {
        return { success: false, gateway: 'razorpay', error: 'User not found.' };
      }

      const currentPlan = (user.plan || 'free') as PlanType;
      const activeSubscription = await db.subscription.findFirst({
        where: { userId, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select: { billingCycle: true },
      });
      const currentBillingCycle = (activeSubscription?.billingCycle || 'monthly') as BillingCycle;
      if (currentPlan === plan && currentBillingCycle === billingCycle) {
        return { success: false, gateway: 'razorpay', error: `You are already on the ${plan} (${billingCycle}) plan.` };
      }
      if (currentPlan !== plan && !isValidPlanChange(currentPlan, plan)) {
        return { success: false, gateway: 'razorpay', error: `Invalid plan change from ${currentPlan} to ${plan}.` };
      }

      const razorpayPlanId = getRazorpayPlanId(plan, billingCycle);

      // ── RECURRING: Razorpay Subscription checkout ──
      if (razorpayPlanId) {
        return this.createRazorpaySubscriptionOrder({
          userId,
          plan,
          billingCycle,
          razorpayPlanId,
          couponCode,
          user: { id: user.id, name: user.name, email: user.email, phone: user.phone, country: user.country },
          ipAddress,
          userAgent,
        });
      }

      // ── ONE-TIME: delegate to the canonical createPaymentOrder (idempotency,
      //    coupon, GST, audit logging all handled there). ──
      const order = await createPaymentOrder({
        userId,
        plan,
        billingCycle,
        currency: 'INR',
        couponCode,
        ipAddress,
        userAgent,
      });

      if (!order.success || !order.razorpayOrderId) {
        return { success: false, gateway: 'razorpay', error: order.error || 'Failed to create Razorpay order.' };
      }

      // Attach prefill for the Checkout modal.
      return {
        success: true,
        gateway: 'razorpay',
        orderId: order.orderId,
        razorpayOrderId: order.razorpayOrderId,
        razorpayKeyId: this.getPublicKeyId(),
        razorpayAmount: Math.round(order.amount * 100),
        razorpayCurrency: order.currency,
        prefill: {
          name: user.name || undefined,
          email: user.email || undefined,
          contact: user.phone || undefined,
        },
        amount: order.amount,
        currency: order.currency,
        plan: order.plan,
        billingCycle: order.billingCycle,
        creditsAllocated: order.creditsAllocated,
        idempotent: order.idempotent,
        mode: this.getMode() ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create Razorpay checkout';
      logger.error('Razorpay subscription checkout failed', { error: message });
      return { success: false, gateway: 'razorpay', error: message };
    }
  }

  /** Create a recurring Razorpay Subscription and a linked PaymentOrder. */
  private async createRazorpaySubscriptionOrder(params: {
    userId: string;
    plan: 'pro' | 'elite';
    billingCycle: BillingCycle;
    razorpayPlanId: string;
    couponCode?: string;
    user: { id: string; name: string | null; email: string | null; phone: string | null; country: string | null };
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreateCheckoutResult> {
    const { userId, plan, billingCycle, razorpayPlanId, couponCode, user } = params;

    // Authoritative amount (INR) + GST, computed server-side. Coupons on
    // recurring plans are recorded for audit but applied by Razorpay via
    // the dashboard-linked plan/offer (Stripe-style host-applied discount).
    const baseAmount = getPlanPrice(plan, billingCycle, 'INR');
    const isIndian = checkIsIndianUser(user.country);
    const gstCalc = calculateGST({ subtotal: baseAmount, currency: 'INR', isIndianUser: isIndian, merchantState: 'MH' });
    const totalAmount = gstCalc.total;

    // Create the internal PaymentOrder first so its id can ride along in
    // the subscription notes (webhook attribution for the FIRST charge).
    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'razorpay',
        amount: totalAmount,
        currency: 'INR',
        plan,
        billingCycle,
        status: 'pending',
        couponCode: couponCode || null,
        subtotal: baseAmount,
        taxRate: gstCalc.totalTax > 0 && baseAmount > 0 ? gstCalc.totalTax / baseAmount : 0,
        taxAmount: gstCalc.totalTax,
        isIndianUser: isIndian,
      },
    });

    const razorpay = getRazorpayInstance();
    const notes: Record<string, string> = {
      paymentOrderId: paymentOrder.id,
      userId,
      plan,
      billingCycle,
      ...(couponCode ? { couponCode } : {}),
    };

    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: getSubscriptionTotalCount(billingCycle),
      quantity: 1,
      customer_notify: 1,
      notes,
    });

    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: { providerSubscriptionId: subscription.id },
    });

    await logPaymentEvent(userId, 'payment_initiated', {
      amount: totalAmount,
      currency: 'INR',
      provider: 'razorpay',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    return {
      success: true,
      gateway: 'razorpay',
      orderId: paymentOrder.id,
      razorpaySubscriptionId: subscription.id,
      razorpayKeyId: this.getPublicKeyId(),
      razorpayAmount: Math.round(totalAmount * 100),
      razorpayCurrency: 'INR',
      prefill: {
        name: user.name || undefined,
        email: user.email || undefined,
        contact: user.phone || undefined,
      },
      amount: totalAmount,
      currency: 'INR',
      plan,
      billingCycle,
      creditsAllocated: PLAN_CREDITS[plan],
      mode: this.getMode() ?? undefined,
    };
  }

  /** One-time credit add-on order via Razorpay (INR + GST, like the
   * Stripe credit add-on path but with server-computed amounts). */
  private async createCreditAddonOrder(params: {
    userId: string;
    creditAmount?: 100 | 500 | 1000;
    couponCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreateCheckoutResult> {
    const { userId, creditAmount } = params;
    if (creditAmount !== 100 && creditAmount !== 500 && creditAmount !== 1000) {
      return { success: false, gateway: 'razorpay', error: 'Invalid creditAmount. Must be 100, 500, or 1000.' };
    }

    try {
      const { CREDIT_ADDONS } = await import('@/app/api/payments/credit-addons/route');
      const addon = CREDIT_ADDONS.find((a) => a.credits === creditAmount);
      if (!addon) {
        return { success: false, gateway: 'razorpay', error: 'Credit add-on not found.' };
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, country: true },
      });
      if (!user) {
        return { success: false, gateway: 'razorpay', error: 'User not found.' };
      }

      const isIndian = checkIsIndianUser(user.country);
      const baseAmount = addon.priceINR;
      const gstCalc = calculateGST({ subtotal: baseAmount, currency: 'INR', isIndianUser: isIndian, merchantState: 'MH' });
      const totalAmount = gstCalc.total;

      const razorpay = getRazorpayInstance();
      const amountInPaise = Math.round(totalAmount * 100);

      const razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `addon_${Date.now()}_${userId.substring(0, 8)}`,
        notes: {
          userId,
          plan: 'credit_addon',
          billingCycle: 'one_time',
          credits: String(creditAmount),
          type: 'credits',
        },
      });

      const paymentOrder = await db.paymentOrder.create({
        data: {
          userId,
          provider: 'razorpay',
          providerOrderId: razorpayOrder.id,
          amount: totalAmount,
          currency: 'INR',
          plan: 'credit_addon',
          billingCycle: 'one_time',
          status: 'pending',
          couponCode: `addon:credits_${creditAmount}`,
          subtotal: baseAmount,
          taxRate: gstCalc.totalTax > 0 && baseAmount > 0 ? gstCalc.totalTax / baseAmount : 0,
          taxAmount: gstCalc.totalTax,
          isIndianUser: isIndian,
        },
      });

      await logPaymentEvent(userId, 'payment_initiated', {
        amount: totalAmount,
        currency: 'INR',
        provider: 'razorpay',
        plan: 'credit_addon',
        paymentOrderId: paymentOrder.id,
      });

      return {
        success: true,
        gateway: 'razorpay',
        orderId: paymentOrder.id,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: this.getPublicKeyId(),
        razorpayAmount: amountInPaise,
        razorpayCurrency: 'INR',
        prefill: {
          name: user.name || undefined,
          email: user.email || undefined,
          contact: user.phone || undefined,
        },
        amount: totalAmount,
        currency: 'INR',
        plan: 'credit_addon',
        creditsAllocated: creditAmount,
        mode: this.getMode() ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create Razorpay credit add-on order';
      logger.error('Razorpay credit addon order failed', { error: message });
      return { success: false, gateway: 'razorpay', error: message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-side payment verification
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verify a client-reported Razorpay payment:
   *  1. Signature check (HMAC-SHA256, constant-time) — order|payment or
   *     subscription|payment depending on the checkout mode.
   *  2. Gateway payment fetch — the payment must exist at Razorpay and be
   *     captured/authorized for OUR order (defense in depth: even a
   *     correctly-signed payload for a different order is rejected).
   *  3. Amount check against the server-stored order amount.
   *  4. Idempotency via PaymentWebhook (eventId = checkout_verify_<paymentId>)
   *     plus the pending-check inside confirmPaymentAndActivate.
   */
  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    const { userId, orderId, razorpayPaymentId, razorpaySignature, razorpaySubscriptionId } = params;

    if (!this.isConfigured()) {
      return { success: false, errorCode: 'NOT_CONFIGURED', error: 'Razorpay is not configured.' };
    }
    if (!razorpayPaymentId || !razorpaySignature) {
      return { success: false, errorCode: 'SIGNATURE_INVALID', error: 'Missing payment id or signature.' };
    }

    try {
      const order = await db.paymentOrder.findUnique({ where: { id: orderId } });
      if (!order || order.userId !== userId) {
        return { success: false, errorCode: 'ORDER_NOT_FOUND', error: 'Payment order not found.' };
      }
      if (order.status === 'completed') {
        return { success: true, alreadyProcessed: true, plan: order.plan };
      }
      if (order.status !== 'pending') {
        return { success: false, errorCode: 'ORDER_NOT_PENDING', error: `Payment order is '${order.status}'.` };
      }
      if (order.provider !== 'razorpay') {
        return { success: false, errorCode: 'ORDER_NOT_FOUND', error: 'Order does not belong to Razorpay.' };
      }

      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

      // ── 1. Signature verification ──
      // Standard order checkout: HMAC(order_id|payment_id).
      // Subscription checkout: the handler also carries the underlying
      // order id; fall back to HMAC(subscription_id|payment_id) when the
      // client only returns subscription identifiers.
      const orderRef = params.razorpayOrderId || order.providerOrderId || order.providerSubscriptionId || razorpaySubscriptionId;
      let signatureValid = false;
      if (orderRef) {
        const expected = createHmac('sha256', keySecret).update(`${orderRef}|${razorpayPaymentId}`).digest('hex');
        signatureValid = safeEqual(expected, razorpaySignature);
      }
      if (!signatureValid && razorpaySubscriptionId) {
        const expectedSub = createHmac('sha256', keySecret)
          .update(`${razorpaySubscriptionId}|${razorpayPaymentId}`)
          .digest('hex');
        signatureValid = safeEqual(expectedSub, razorpaySignature);
      }

      if (!signatureValid) {
        logger.warn('Razorpay payment signature verification failed', { orderId, paymentId: razorpayPaymentId });
        await logPaymentEvent(userId, 'payment_failed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: order.plan,
          paymentOrderId: order.id,
          reason: 'Payment signature verification failed (checkout verify)',
        });
        return { success: false, errorCode: 'SIGNATURE_INVALID', error: 'Payment signature verification failed.' };
      }

      // ── 2. Gateway-side payment fetch (trusted amount/status) ──
      let gatewayPayment: { id: string; status: string; amount: number; currency: string; order_id?: string; subscription_id?: string; error_description?: string };
      try {
        const rzp = getRazorpayClient();
        const fetched = (await rzp.payments.fetch(razorpayPaymentId)) as unknown as {
          id: string;
          status: string;
          amount: string | number;
          currency?: string;
          order_id?: string;
          subscription_id?: string;
          error_description?: string;
        };
        gatewayPayment = {
          id: fetched.id,
          status: fetched.status,
          amount: typeof fetched.amount === 'string' ? parseFloat(fetched.amount) : (fetched.amount ?? 0),
          currency: fetched.currency || 'INR',
          order_id: fetched.order_id,
          subscription_id: fetched.subscription_id,
          error_description: fetched.error_description,
        };
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
        logger.error('Razorpay payment fetch failed during verification', { orderId, paymentId: razorpayPaymentId, error: message });
        return { success: false, errorCode: 'GATEWAY_ERROR', error: 'Could not verify the payment with Razorpay. If you were charged, the webhook will complete activation automatically.' };
      }

      if (gatewayPayment.status !== 'captured' && gatewayPayment.status !== 'authorized') {
        await this.recordFailure(order.id, gatewayPayment.id, `Payment status at gateway: ${gatewayPayment.status}`);
        return { success: false, errorCode: 'PAYMENT_FAILED', error: `Payment is ${gatewayPayment.status}. It was not completed.` };
      }

      // The payment must reference OUR order or subscription.
      const matchesOrder =
        (gatewayPayment.order_id && gatewayPayment.order_id === (params.razorpayOrderId || order.providerOrderId)) ||
        (gatewayPayment.subscription_id && gatewayPayment.subscription_id === order.providerSubscriptionId) ||
        (razorpaySubscriptionId && razorpaySubscriptionId === order.providerSubscriptionId);
      if (!matchesOrder) {
        logger.warn('Razorpay payment does not reference the order — rejecting', {
          orderId,
          paymentId: gatewayPayment.id,
          gatewayOrder: gatewayPayment.order_id,
          gatewaySubscription: gatewayPayment.subscription_id,
        });
        return { success: false, errorCode: 'AMOUNT_MISMATCH', error: 'Payment does not match this order.' };
      }

      // ── 3. Amount check (server-stored amount is authoritative) ──
      const paidMajor = gatewayPayment.amount / 100;
      if (Math.abs(paidMajor - order.amount) > 0.01) {
        logger.error('Razorpay amount mismatch', { orderId, expected: order.amount, paid: paidMajor });
        await this.recordFailure(order.id, gatewayPayment.id, `Amount mismatch: expected ${order.amount}, paid ${paidMajor}`);
        return { success: false, errorCode: 'AMOUNT_MISMATCH', error: 'Payment amount does not match the order total.' };
      }

      // ── 4. Idempotent activation ──
      const dedup = await recordWebhookEvent({
        eventId: `checkout_verify_${gatewayPayment.id}`,
        provider: 'razorpay',
        eventType: 'checkout.verified',
        payload: JSON.stringify({ orderId: order.id, paymentId: gatewayPayment.id, source: 'client_verify' }),
        paymentOrderId: order.id,
      });

      if (!dedup.isNew) {
        return { success: true, alreadyProcessed: true, plan: order.plan };
      }

      if (isCreditAddonOrder(order)) {
        const addonResult = await fulfillCreditAddon(order.userId, order.id, gatewayPayment.id);
        if (!addonResult.success) {
          await markWebhookProcessed(dedup.webhookId!, addonResult.error || 'Credit addon fulfillment failed');
          return { success: false, errorCode: 'GATEWAY_ERROR', error: addonResult.error || 'Failed to fulfill credit add-on.' };
        }
        await markWebhookProcessed(dedup.webhookId!);
        await logPaymentEvent(userId, 'payment_completed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: 'credit_addon',
          paymentOrderId: order.id,
        });
        return { success: true, plan: 'credit_addon', creditsAdded: addonResult.creditsAdded };
      }

      const activation = await confirmPaymentAndActivate(
        order.userId,
        order.id,
        gatewayPayment.id,
        razorpaySubscriptionId || order.providerSubscriptionId || undefined
      );
      if (!activation.success) {
        await markWebhookProcessed(dedup.webhookId!, activation.error);
        return { success: false, errorCode: 'GATEWAY_ERROR', error: activation.error || 'Failed to activate subscription.' };
      }

      await markWebhookProcessed(dedup.webhookId!);
      return {
        success: true,
        plan: order.plan,
        creditsAdded: PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment verification failed';
      logger.error('Razorpay verifyPayment error', { orderId, error: message });
      return { success: false, errorCode: 'GATEWAY_ERROR', error: message };
    }
  }

  /** Mark an order failed after verification rejection (never touches the
   * user's existing subscription — that is webhook/dunning territory). */
  private async recordFailure(orderId: string, paymentId: string, reason: string): Promise<void> {
    try {
      const order = await db.paymentOrder.findUnique({ where: { id: orderId } });
      if (order && order.status === 'pending') {
        await db.paymentOrder.update({
          where: { id: orderId },
          data: { status: 'failed', providerPaymentId: paymentId },
        });
        await logPaymentEvent(order.userId, 'payment_failed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: order.plan,
          paymentOrderId: orderId,
          reason,
        });
      }
    } catch (error) {
      logger.error('Failed to record payment failure', { orderId, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// Re-export for the verify route's convenience (single import site).
export { verifyPaymentSignature, razorpayPlanEnvName };
