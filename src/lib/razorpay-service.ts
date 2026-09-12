// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Production-Grade Razorpay Integration Service
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// CRITICAL RULES:
// - NEVER trust frontend payment success — always verify via webhook
// - NEVER update DB before webhook signature verification
// - ALWAYS use Prisma $transaction for atomic operations
// - ALWAYS log audit events via billing-audit
// - NEVER store raw card/payment details
// - NEVER expose secret keys to frontend
// - Support idempotency — check if webhook event already processed
// ═══════════════════════════════════════════════════════════════════

import { createHmac } from 'crypto';
import Razorpay from 'razorpay';
import { db } from '@/lib/db';
import { logPaymentEvent, logSubscriptionEvent, logBillingEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { validateAndApplyCoupon, incrementCouponUsage } from '@/lib/coupon-service';
import type { BillingCycle, SubscriptionStatus } from '@/lib/subscription-service';

// ===== ENVIRONMENT CONFIGURATION =====

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

// ===== RAZORPAY INSTANCE (SINGLETON) =====

let razorpayInstance: Razorpay | null = null;

function getRazorpayInstance(): Razorpay {
  if (!razorpayInstance) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error(
        '[RazorpayService] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variables'
      );
    }
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

// ===== TYPES =====

/** Parameters for creating a Razorpay order */
export interface CreateRazorpayOrderParams {
  userId: string;
  /** Amount in paise (e.g., 29900 for ₹299) */
  amount: number;
  /** Currency code (e.g., 'INR', 'USD') */
  currency: string;
  /** Plan to subscribe to (pro, elite) */
  plan: PlanType;
  /** Billing cycle */
  billingCycle: BillingCycle;
  /** Optional coupon code for discount */
  couponCode?: string;
  /** Optional idempotency key to prevent duplicate orders */
  idempotencyKey?: string;
  /** Additional metadata to attach */
  metadata?: Record<string, string | number>;
}

/** Result of creating a Razorpay order */
export interface CreateRazorpayOrderResult {
  success: boolean;
  /** Internal PaymentOrder ID */
  orderId?: string;
  /** Razorpay order ID (providerOrderId) */
  razorpayOrderId?: string;
  /** Amount in paise */
  amount?: number;
  /** Currency code */
  currency?: string;
  /** Razorpay key ID for frontend checkout */
  keyId?: string;
  /** Prefill data for Razorpay checkout */
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /** Notes attached to the order */
  notes?: Record<string, string | number>;
  error?: string;
}

/** Parameters for verifying a payment signature */
export interface VerifyPaymentSignatureParams {
  /** Razorpay order ID */
  orderId: string;
  /** Razorpay payment ID */
  paymentId: string;
  /** Signature from Razorpay frontend callback */
  signature: string;
}

/** Result of payment signature verification */
export interface VerifyPaymentSignatureResult {
  success: boolean;
  error?: string;
}

/** Result of webhook signature verification */
export interface VerifyWebhookSignatureResult {
  success: boolean;
  error?: string;
}

/** Payload structure for payment.captured webhook event */
export interface RazorpayPaymentCapturedPayload {
  entity: string;
  id: string; // Razorpay payment ID
  order_id: string; // Razorpay order ID
  amount: number; // Amount in paise
  currency: string;
  status: string;
  method: string;
  email?: string;
  contact?: string;
  notes?: Record<string, string | number>;
  created_at: number;
  // NEVER store card/network details — only metadata
  [key: string]: unknown;
}

/** Payload structure for payment.failed webhook event */
export interface RazorpayPaymentFailedPayload {
  entity: string;
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  error_code: string;
  error_description: string;
  error_source: string;
  error_step: string;
  error_reason: string;
  method: string;
  notes?: Record<string, string | number>;
  created_at: number;
  [key: string]: unknown;
}

/** Payload structure for subscription.charged webhook event */
export interface RazorpaySubscriptionChargedPayload {
  entity: string;
  id: string; // Razorpay subscription ID
  status: string;
  plan_id: string;
  customer_id: string;
  current_start: number;
  current_end: number;
  paid_count: number;
  notes?: Record<string, string | number>;
  [key: string]: unknown;
}

/** Payload structure for subscription.cancelled webhook event */
export interface RazorpaySubscriptionCancelledPayload {
  entity: string;
  id: string; // Razorpay subscription ID
  status: string;
  ended_at: number;
  cancelled_at: number;
  notes?: Record<string, string | number>;
  [key: string]: unknown;
}

/** Generic webhook processing result */
export interface WebhookProcessResult {
  success: boolean;
  /** If the event was already processed (idempotency) */
  alreadyProcessed?: boolean;
  /** Internal IDs affected by processing */
  paymentOrderId?: string;
  subscriptionId?: string;
  error?: string;
}

/** Razorpay webhook event envelope */
export interface RazorpayWebhookEvent {
  entity: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentCapturedPayload | RazorpayPaymentFailedPayload;
    };
    subscription?: {
      entity: RazorpaySubscriptionChargedPayload | RazorpaySubscriptionCancelledPayload;
    };
    order?: {
      entity: {
        id: string;
        [key: string]: unknown;
      };
    };
  };
  /** Razorpay's unique event identifier for idempotency */
  id?: string;
  created_at?: number;
}

// ===== PLAN PRICING CONFIGURATION =====

const PLAN_PRICING_INR: Record<PlanType, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 2900, yearly: 27900 },    // ₹29/₹279 in paise
  elite: { monthly: 8900, yearly: 84900 },   // ₹89/₹849 in paise
};

const PLAN_PRICING_USD: Record<PlanType, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 2900, yearly: 27900 },     // $29/$279 in cents
  elite: { monthly: 8900, yearly: 84900 },   // $89/$849 in cents
};

/**
 * Get the price for a plan in paise/cents for a given currency and billing cycle.
 */
export function getPlanPrice(
  plan: PlanType,
  billingCycle: BillingCycle,
  currency: string = 'INR'
): number {
  const pricing = currency === 'INR' ? PLAN_PRICING_INR : PLAN_PRICING_USD;
  const planPricing = pricing[plan] || pricing.free;
  return billingCycle === 'monthly' ? planPricing.monthly : planPricing.yearly;
}

// ===== CORE FUNCTIONS =====

/**
 * Create a Razorpay order for a subscription purchase.
 *
 * Flow:
 * 1. Validate inputs
 * 2. Apply coupon if provided (calculates discount)
 * 3. Create PaymentOrder in DB (status: pending)
 * 4. Call Razorpay API to create order
 * 5. Update PaymentOrder with providerOrderId
 * 6. Return checkout config for frontend
 */
export async function createRazorpayOrder(
  params: CreateRazorpayOrderParams
): Promise<CreateRazorpayOrderResult> {
  const { userId, amount, currency, plan, billingCycle, couponCode, idempotencyKey, metadata } = params;

  try {
    // ── 1. Validate inputs ──
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0' };
    }
    if (!plan || !['pro', 'elite'].includes(plan)) {
      return { success: false, error: 'Invalid plan. Only pro and elite plans require payment.' };
    }
    if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
      return { success: false, error: 'Invalid billing cycle' };
    }

    // ── 2. Check idempotency — return existing order if already created ──
    if (idempotencyKey) {
      const existingOrder = await db.paymentOrder.findUnique({
        where: { idempotencyKey },
      });
      if (existingOrder) {
        // Fetch user data for prefill
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, phone: true },
        });

        return {
          success: true,
          orderId: existingOrder.id,
          razorpayOrderId: existingOrder.providerOrderId || undefined,
          amount: existingOrder.amount,
          currency: existingOrder.currency,
          keyId: RAZORPAY_KEY_ID,
          prefill: {
            name: user?.name || undefined,
            email: user?.email || undefined,
            contact: user?.phone || undefined,
          },
          notes: {
            plan: existingOrder.plan,
            billingCycle: existingOrder.billingCycle,
            userId,
            ...(metadata || {}),
          },
        };
      }
    }

    // ── 3. Apply coupon if provided ──
    let discountAmount = 0;
    let finalAmount = amount;

    if (couponCode) {
      // Convert paise to base currency unit for coupon calculation
      const baseAmount = amount / 100;
      const couponResult = await validateAndApplyCoupon({
        code: couponCode,
        baseAmount,
        plan,
        userId,
      });

      if (couponResult.valid) {
        discountAmount = Math.round((couponResult.discountAmount || 0) * 100); // Convert back to paise
        finalAmount = Math.max(0, amount - discountAmount);
      }
      // If coupon is invalid, proceed without discount
    }

    // ── 4. Fetch user for prefill data ──
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true, country: true },
    });

    const isIndianUser = user?.country === 'IN' || currency === 'INR';

    // ── 5. Create PaymentOrder in DB ──
    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'razorpay',
        amount: finalAmount / 100, // Store in base currency unit
        currency,
        plan,
        billingCycle,
        status: 'pending',
        couponCode: couponCode || null,
        discountAmount: discountAmount / 100, // Store in base currency unit
        subtotal: amount / 100, // Original amount before discount
        taxRate: isIndianUser ? 18 : 0, // GST for Indian users
        taxAmount: isIndianUser ? Math.round(finalAmount * 0.18) / 100 : 0,
        isIndianUser,
        idempotencyKey: idempotencyKey || null,
      },
    });

    // ── 6. Create Razorpay order via SDK ──
    const razorpay = getRazorpayInstance();

    const orderNotes: Record<string, string | number> = {
      paymentOrderId: paymentOrder.id,
      plan,
      billingCycle,
      userId,
      ...(metadata || {}),
    };

    if (couponCode) {
      orderNotes.couponCode = couponCode;
      orderNotes.discountAmount = discountAmount;
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: finalAmount, // Razorpay expects paise
      currency,
      receipt: paymentOrder.id, // Use our internal ID as receipt
      notes: orderNotes,
      payment: {
        capture: 'automatic',
      },
    });

    // ── 7. Update PaymentOrder with Razorpay order ID ──
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: {
        providerOrderId: razorpayOrder.id,
      },
    });

    // ── 8. Log the payment initiation ──
    await logPaymentEvent(userId, 'payment_initiated', {
      amount: finalAmount / 100,
      currency,
      provider: 'razorpay',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    await logBillingEvent({
      userId,
      action: 'payment_initiated',
      details: `Razorpay order created: ${razorpayOrder.id} for ${plan} ${billingCycle}`,
      resourceId: paymentOrder.id,
      metadata: {
        razorpayOrderId: razorpayOrder.id,
        amount: finalAmount,
        currency,
        plan,
        billingCycle,
        couponCode: couponCode || undefined,
        discountAmount: discountAmount || undefined,
      },
    });

    // ── 9. Return checkout configuration for frontend ──
    return {
      success: true,
      orderId: paymentOrder.id,
      razorpayOrderId: razorpayOrder.id,
      amount: finalAmount,
      currency,
      keyId: RAZORPAY_KEY_ID,
      prefill: {
        name: user?.name || undefined,
        email: user?.email || undefined,
        contact: user?.phone || undefined,
      },
      notes: orderNotes,
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to create Razorpay order:', error);
    const message = error instanceof Error ? error.message : 'Failed to create Razorpay order';
    return { success: false, error: message };
  }
}

/**
 * Verify a Razorpay payment signature using HMAC-SHA256.
 *
 * SECURITY: This MUST be called on the backend before trusting any payment.
 * NEVER trust the frontend callback alone — always verify the signature.
 *
 * The signature is computed as: HMAC-SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyPaymentSignature(
  params: VerifyPaymentSignatureParams
): VerifyPaymentSignatureResult {
  const { orderId, paymentId, signature } = params;

  try {
    if (!orderId || !paymentId || !signature) {
      return { success: false, error: 'Missing required parameters: orderId, paymentId, signature' };
    }

    if (!RAZORPAY_KEY_SECRET) {
      console.error('[RazorpayService] RAZORPAY_KEY_SECRET is not configured');
      return { success: false, error: 'Payment verification is not configured' };
    }

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const isValid = timingSafeEqual(expectedSignature, signature);

    if (!isValid) {
      console.warn('[RazorpayService] Payment signature verification failed', {
        orderId,
        paymentId,
      });
      return { success: false, error: 'Invalid payment signature' };
    }

    return { success: true };
  } catch (error) {
    console.error('[RazorpayService] Failed to verify payment signature:', error);
    return { success: false, error: 'Failed to verify payment signature' };
  }
}

/**
 * Verify a Razorpay webhook signature.
 *
 * SECURITY: ALWAYS verify webhook signatures before processing.
 * NEVER process unverified webhook payloads.
 *
 * The signature is computed as: HMAC-SHA256(rawBody, webhookSecret)
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): VerifyWebhookSignatureResult {
  try {
    if (!body || !signature) {
      return { success: false, error: 'Missing body or signature' };
    }

    if (!RAZORPAY_WEBHOOK_SECRET) {
      console.error('[RazorpayService] RAZORPAY_WEBHOOK_SECRET is not configured');
      return { success: false, error: 'Webhook verification is not configured' };
    }

    // Compute expected signature
    const expectedSignature = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    const isValid = timingSafeEqual(expectedSignature, signature);

    if (!isValid) {
      console.warn('[RazorpayService] Webhook signature verification failed');
      return { success: false, error: 'Invalid webhook signature' };
    }

    return { success: true };
  } catch (error) {
    console.error('[RazorpayService] Failed to verify webhook signature:', error);
    return { success: false, error: 'Failed to verify webhook signature' };
  }
}

/**
 * Process a payment.captured webhook event.
 *
 * This is the PRIMARY method for confirming payments.
 * NEVER trust frontend payment success — this webhook is the source of truth.
 *
 * Atomic transaction ensures:
 * a. PaymentOrder status → 'completed'
 * b. Subscription updated (plan, status='active', period dates)
 * c. User record updated (plan, credits, isTrial=false)
 * d. CreditsLedger entry created
 * e. Invoice record created
 * f. Coupon usage incremented if applicable
 */
export async function handlePaymentCaptured(
  payload: RazorpayPaymentCapturedPayload
): Promise<WebhookProcessResult> {
  const razorpayOrderId = payload.order_id;
  const razorpayPaymentId = payload.id;

  try {
    // ── 1. Find the PaymentOrder by Razorpay order ID ──
    const paymentOrder = await db.paymentOrder.findFirst({
      where: { providerOrderId: razorpayOrderId },
    });

    if (!paymentOrder) {
      console.error('[RazorpayService] PaymentOrder not found for Razorpay order:', razorpayOrderId);
      return { success: false, error: 'PaymentOrder not found for this Razorpay order' };
    }

    // ── 2. Idempotency check — already completed? ──
    if (paymentOrder.status === 'completed') {
      console.info('[RazorpayService] PaymentOrder already completed, skipping:', paymentOrder.id);
      return {
        success: true,
        alreadyProcessed: true,
        paymentOrderId: paymentOrder.id,
      };
    }

    const userId = paymentOrder.userId;
    const newPlan = paymentOrder.plan as PlanType;
    const billingCycle = paymentOrder.billingCycle as BillingCycle;

    // ── 3. Calculate subscription period dates ──
    const now = new Date();
    const periodEnd =
      billingCycle === 'monthly'
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)  // 30 days
        : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 365 days

    const planCredits = PLAN_CREDITS[newPlan] || PLAN_CREDITS.free;

    // ── 4. Atomic transaction for all state changes ──
    await db.$transaction(async (tx) => {
      // a. Update PaymentOrder status to 'completed'
      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: {
          status: 'completed',
          providerPaymentId: razorpayPaymentId,
        },
      });

      // b. Update or create Subscription record
      const existingSubscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: { in: ['trialing', 'active', 'past_due'] },
        },
      });

      if (existingSubscription) {
        await tx.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            plan: newPlan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            scheduledPlanChange: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle,
            razorpaySubscriptionId: payload.subscription_id || existingSubscription.razorpaySubscriptionId,
          },
        });
      } else {
        // Create new subscription if none exists
        await tx.subscription.create({
          data: {
            userId,
            plan: newPlan,
            status: 'active',
            isTrial: false,
            cancelAtPeriodEnd: false,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle,
            razorpaySubscriptionId: (payload as Record<string, unknown>).subscription_id as string || null,
          },
        });
      }

      // c. Read user's current credits before update (to accumulate)
      const userBefore = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      const currentCredits = userBefore?.credits ?? 0;
      const newTotalCredits = currentCredits + planCredits;

      // d. Update User record — ACCUMULATE credits (existing + new plan credits)
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: newPlan,
          credits: newTotalCredits,
          creditsMonthly: planCredits,
          rolloverCredits: currentCredits,
          isTrial: false,
          trialEndsAt: null,
        },
      });

      // e. Create CreditsLedger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'plan_upgrade',
          credits: planCredits,
          balance: newTotalCredits,
          description: `Upgraded to ${newPlan} plan (${billingCycle}) — ${planCredits} credits added (previous balance: ${currentCredits}, new total: ${newTotalCredits})`,
          referenceId: paymentOrder.id,
        },
      });

      // e. Create Invoice record
      const invoiceCount = await tx.invoice.count();
      const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(6, '0')}-${Date.now()}`;
      const subtotal = paymentOrder.subtotal;
      const taxRate = paymentOrder.taxRate;
      const taxAmount = paymentOrder.taxAmount;
      const total = paymentOrder.amount;

      const lineItems = JSON.stringify([
        {
          description: `${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} Plan — ${billingCycle}`,
          plan: newPlan,
          billingCycle,
          quantity: 1,
          unitPrice: subtotal,
          discount: paymentOrder.discountAmount,
          tax: taxAmount,
          total,
        },
      ]);

      await tx.invoice.create({
        data: {
          paymentOrderId: paymentOrder.id,
          invoiceNumber,
          userId,
          subtotal,
          taxRate,
          taxAmount,
          total,
          currency: paymentOrder.currency,
          gstNumber: paymentOrder.gstNumber || null,
          lineItems,
        },
      });

      // f. Increment coupon usage if coupon was used
      if (paymentOrder.couponCode) {
        await incrementCouponUsage(paymentOrder.couponCode);
      }
    });

    // ── 5. Log audit events (outside transaction to not block it) ──
    await logPaymentEvent(userId, 'payment_completed', {
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      provider: 'razorpay',
      plan: newPlan,
      paymentOrderId: paymentOrder.id,
    });

    await logSubscriptionEvent(userId, 'upgrade_completed', {
      toPlan: newPlan,
      billingCycle,
    });

    await logBillingEvent({
      userId,
      action: 'payment_completed',
      details: `Payment captured via Razorpay: ${razorpayPaymentId} for ${newPlan} ${billingCycle}`,
      resourceId: paymentOrder.id,
      metadata: {
        razorpayOrderId,
        razorpayPaymentId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        plan: newPlan,
        billingCycle,
      },
    });

    return {
      success: true,
      paymentOrderId: paymentOrder.id,
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to handle payment.captured:', error);
    const message = error instanceof Error ? error.message : 'Failed to process payment captured event';
    return { success: false, error: message };
  }
}

/**
 * Process a payment.failed webhook event.
 *
 * Updates PaymentOrder status to 'failed' and sets subscription to 'past_due'.
 * Logs the failure for analytics and retry logic.
 */
export async function handlePaymentFailed(
  payload: RazorpayPaymentFailedPayload
): Promise<WebhookProcessResult> {
  const razorpayOrderId = payload.order_id;
  const razorpayPaymentId = payload.id;

  try {
    // ── 1. Find the PaymentOrder ──
    const paymentOrder = await db.paymentOrder.findFirst({
      where: { providerOrderId: razorpayOrderId },
    });

    if (!paymentOrder) {
      console.error('[RazorpayService] PaymentOrder not found for Razorpay order:', razorpayOrderId);
      return { success: false, error: 'PaymentOrder not found for this Razorpay order' };
    }

    // ── 2. Idempotency check ──
    if (paymentOrder.status === 'failed') {
      return {
        success: true,
        alreadyProcessed: true,
        paymentOrderId: paymentOrder.id,
      };
    }

    const userId = paymentOrder.userId;

    // ── 3. Update PaymentOrder and Subscription status ──
    await db.$transaction(async (tx) => {
      // Update payment order
      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: {
          status: 'failed',
          providerPaymentId: razorpayPaymentId,
        },
      });

      // Set subscription to 'past_due' if it exists
      const subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: { in: ['active', 'trialing', 'past_due'] },
        },
      });

      if (subscription) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'past_due' },
        });
      }
    });

    // ── 4. Log audit events ──
    await logPaymentEvent(userId, 'payment_failed', {
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      provider: 'razorpay',
      plan: paymentOrder.plan,
      paymentOrderId: paymentOrder.id,
      reason: payload.error_description || payload.error_reason || 'Unknown error',
    });

    await logSubscriptionEvent(userId, 'subscription_past_due', {
      fromStatus: 'active',
      toStatus: 'past_due',
    });

    await logBillingEvent({
      userId,
      action: 'payment_failed',
      details: `Payment failed via Razorpay: ${payload.error_description || 'Unknown reason'}`,
      resourceId: paymentOrder.id,
      metadata: {
        razorpayOrderId,
        razorpayPaymentId,
        errorCode: payload.error_code,
        errorDescription: payload.error_description,
        errorReason: payload.error_reason,
        errorSource: payload.error_source,
        errorStep: payload.error_step,
        method: payload.method,
      },
    });

    return {
      success: true,
      paymentOrderId: paymentOrder.id,
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to handle payment.failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to process payment failed event';
    return { success: false, error: message };
  }
}

/**
 * Process a subscription.charged webhook event.
 *
 * Handles recurring subscription payments from Razorpay.
 * Extends the subscription period and allocates credits for the new cycle.
 */
export async function handleSubscriptionCharged(
  payload: RazorpaySubscriptionChargedPayload
): Promise<WebhookProcessResult> {
  const razorpaySubscriptionId = payload.id;

  try {
    // ── 1. Find subscription by Razorpay subscription ID ──
    const subscription = await db.subscription.findFirst({
      where: { razorpaySubscriptionId: razorpaySubscriptionId },
    });

    if (!subscription) {
      console.error(
        '[RazorpayService] Subscription not found for Razorpay subscription:',
        razorpaySubscriptionId
      );
      return { success: false, error: 'Subscription not found for this Razorpay subscription' };
    }

    const userId = subscription.userId;
    const plan = subscription.plan as PlanType;
    const billingCycle = subscription.billingCycle as BillingCycle;
    const planCredits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

    // ── 2. Calculate new period dates ──
    const currentPeriodStart = payload.current_start
      ? new Date(payload.current_start * 1000)
      : new Date();
    const currentPeriodEnd = payload.current_end
      ? new Date(payload.current_end * 1000)
      : billingCycle === 'monthly'
        ? new Date(currentPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000)
        : new Date(currentPeriodStart.getTime() + 365 * 24 * 60 * 60 * 1000);

    // ── 3. Atomic transaction ──
    await db.$transaction(async (tx) => {
      // Update subscription period
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      // Reset user credits for new billing period
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: planCredits,
          creditsMonthly: planCredits,
        },
      });

      // Create credits ledger entry for renewal
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'monthly_reset',
          credits: planCredits,
          balance: planCredits,
          description: `Subscription renewed — ${planCredits} credits for ${plan} plan`,
          referenceId: subscription.id,
        },
      });

      // Find the most recent payment order for this subscription to create an invoice
      const latestPaymentOrder = await tx.paymentOrder.findFirst({
        where: {
          userId,
          plan,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (latestPaymentOrder) {
        // Update payment order status
        await tx.paymentOrder.update({
          where: { id: latestPaymentOrder.id },
          data: { status: 'completed' },
        });

        // Create invoice
        const invoiceCount = await tx.invoice.count();
        const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(6, '0')}-${Date.now()}`;

        await tx.invoice.create({
          data: {
            paymentOrderId: latestPaymentOrder.id,
            invoiceNumber,
            userId,
            subtotal: latestPaymentOrder.subtotal,
            taxRate: latestPaymentOrder.taxRate,
            taxAmount: latestPaymentOrder.taxAmount,
            total: latestPaymentOrder.amount,
            currency: latestPaymentOrder.currency,
            gstNumber: latestPaymentOrder.gstNumber || null,
            lineItems: JSON.stringify([
              {
                description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — ${billingCycle} renewal`,
                plan,
                billingCycle,
                quantity: 1,
                unitPrice: latestPaymentOrder.subtotal,
                tax: latestPaymentOrder.taxAmount,
                total: latestPaymentOrder.amount,
              },
            ]),
          },
        });
      }
    });

    // ── 4. Log audit events ──
    await logPaymentEvent(userId, 'payment_completed', {
      amount: 0, // Amount from Razorpay subscription, not directly available here
      currency: 'INR',
      provider: 'razorpay',
      plan,
    });

    await logSubscriptionEvent(userId, 'upgrade_completed', {
      fromPlan: plan,
      toPlan: plan,
      billingCycle,
    });

    await logBillingEvent({
      userId,
      action: 'payment_completed',
      details: `Razorpay subscription charged: ${razorpaySubscriptionId}`,
      resourceId: subscription.id,
      metadata: {
        razorpaySubscriptionId,
        paidCount: payload.paid_count,
        currentPeriodStart: currentPeriodStart.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      },
    });

    return {
      success: true,
      subscriptionId: subscription.id,
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to handle subscription.charged:', error);
    const message = error instanceof Error ? error.message : 'Failed to process subscription charged event';
    return { success: false, error: message };
  }
}

/**
 * Process a subscription.cancelled webhook event.
 *
 * Marks the subscription as canceled and schedules downgrade to free
 * at the end of the current period.
 */
export async function handleSubscriptionCancelled(
  payload: RazorpaySubscriptionCancelledPayload
): Promise<WebhookProcessResult> {
  const razorpaySubscriptionId = payload.id;

  try {
    // ── 1. Find subscription by Razorpay subscription ID ──
    const subscription = await db.subscription.findFirst({
      where: { razorpaySubscriptionId: razorpaySubscriptionId },
    });

    if (!subscription) {
      console.error(
        '[RazorpayService] Subscription not found for Razorpay subscription:',
        razorpaySubscriptionId
      );
      return { success: false, error: 'Subscription not found for this Razorpay subscription' };
    }

    const userId = subscription.userId;
    const previousStatus = subscription.status as SubscriptionStatus;

    // ── 2. Update subscription state ──
    await db.$transaction(async (tx) => {
      // If subscription has remaining period, mark for cancel at period end
      // Otherwise, cancel immediately and downgrade to free
      const now = new Date();
      const periodEnd = subscription.currentPeriodEnd;

      if (periodEnd && periodEnd > now) {
        // Still has time — cancel at end of period
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            cancelAtPeriodEnd: true,
            scheduledPlanChange: 'free',
          },
        });
      } else {
        // Period already ended — cancel immediately
        const freeCredits = PLAN_CREDITS.free;

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'canceled',
            cancelAtPeriodEnd: false,
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            plan: 'free',
            credits: freeCredits,
            creditsMonthly: freeCredits,
            isTrial: false,
            trialEndsAt: null,
          },
        });

        // Create ledger entry for downgrade
        await tx.creditsLedger.create({
          data: {
            userId,
            action: 'plan_downgrade',
            credits: freeCredits,
            balance: freeCredits,
            description: 'Subscription cancelled — downgraded to free plan',
            referenceId: subscription.id,
          },
        });
      }
    });

    // ── 3. Log audit events ──
    await logSubscriptionEvent(userId, 'subscription_canceled', {
      fromStatus: previousStatus,
      toStatus: 'canceled',
    });

    await logBillingEvent({
      userId,
      action: 'payment_failed', // Using existing event type for notification
      details: `Razorpay subscription cancelled: ${razorpaySubscriptionId}`,
      resourceId: subscription.id,
      metadata: {
        razorpaySubscriptionId,
        endedAt: payload.ended_at ? new Date(payload.ended_at * 1000).toISOString() : undefined,
        cancelledAt: payload.cancelled_at
          ? new Date(payload.cancelled_at * 1000).toISOString()
          : undefined,
        previousStatus,
      },
    });

    return {
      success: true,
      subscriptionId: subscription.id,
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to handle subscription.cancelled:', error);
    const message = error instanceof Error ? error.message : 'Failed to process subscription cancelled event';
    return { success: false, error: message };
  }
}

/**
 * Main webhook event dispatcher.
 *
 * Verifies the webhook signature, records the webhook event,
 * and dispatches to the appropriate handler based on event type.
 *
 * IDENTITY: Checks if the webhook event has already been processed
 * using the PaymentWebhook eventId (unique constraint).
 */
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string,
  parsedEvent: RazorpayWebhookEvent
): Promise<WebhookProcessResult> {
  try {
    // ── 1. Verify webhook signature ──
    const signatureResult = verifyWebhookSignature(rawBody, signature);
    if (!signatureResult.success) {
      console.error('[RazorpayService] Webhook signature verification failed');
      return { success: false, error: 'Webhook signature verification failed' };
    }

    const eventType = parsedEvent.event;
    const eventId = parsedEvent.id || `${eventType}-${Date.now()}`;

    // ── 2. Idempotency check — has this event been processed? ──
    const existingWebhook = await db.paymentWebhook.findUnique({
      where: { eventId },
    });

    if (existingWebhook && existingWebhook.processed) {
      console.info('[RazorpayService] Webhook event already processed:', eventId);
      return {
        success: true,
        alreadyProcessed: true,
        paymentOrderId: existingWebhook.paymentOrderId || undefined,
      };
    }

    // ── 3. Record the webhook event ──
    let paymentOrderId: string | null = null;

    // Try to find associated payment order from the payload
    const razorpayOrderId = parsedEvent.payload.order?.entity?.id
      || (parsedEvent.payload.payment?.entity as Record<string, unknown>)?.order_id as string
      || null;

    if (razorpayOrderId) {
      const paymentOrder = await db.paymentOrder.findFirst({
        where: { providerOrderId: razorpayOrderId },
        select: { id: true },
      });
      paymentOrderId = paymentOrder?.id || null;
    }

    // Also try to find from subscription
    if (!paymentOrderId) {
      const razorpaySubId =
        (parsedEvent.payload.subscription?.entity as Record<string, unknown>)?.id as string || null;
      if (razorpaySubId) {
        const sub = await db.subscription.findFirst({
          where: { razorpaySubscriptionId: razorpaySubId },
          include: { user: { select: { paymentOrders: { where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } } } },
        });
        paymentOrderId = sub?.user.paymentOrders[0]?.id || null;
      }
    }

    const webhookRecord = await db.paymentWebhook.upsert({
      where: { eventId },
      create: {
        eventId,
        eventType,
        provider: 'razorpay',
        payload: JSON.stringify(parsedEvent),
        signature,
        processed: false,
        paymentOrderId,
      },
      update: {
        eventType,
        payload: JSON.stringify(parsedEvent),
        signature,
        paymentOrderId,
      },
    });

    // ── 4. Dispatch to appropriate handler ──
    let result: WebhookProcessResult;

    switch (eventType) {
      case 'payment.captured':
        result = await handlePaymentCaptured(
          parsedEvent.payload.payment!.entity as RazorpayPaymentCapturedPayload
        );
        break;

      case 'payment.failed':
        result = await handlePaymentFailed(
          parsedEvent.payload.payment!.entity as RazorpayPaymentFailedPayload
        );
        break;

      case 'subscription.charged':
        result = await handleSubscriptionCharged(
          parsedEvent.payload.subscription!.entity as RazorpaySubscriptionChargedPayload
        );
        break;

      case 'subscription.cancelled':
        result = await handleSubscriptionCancelled(
          parsedEvent.payload.subscription!.entity as RazorpaySubscriptionCancelledPayload
        );
        break;

      default:
        console.info('[RazorpayService] Unhandled webhook event type:', eventType);
        result = { success: true, error: `Unhandled event type: ${eventType}` };
    }

    // ── 5. Update webhook record with processing result ──
    await db.paymentWebhook.update({
      where: { id: webhookRecord.id },
      data: {
        processed: result.success,
        processedAt: new Date(),
        processingError: result.success ? null : result.error || null,
        paymentOrderId: result.paymentOrderId || paymentOrderId,
      },
    });

    return result;
  } catch (error) {
    console.error('[RazorpayService] Failed to process Razorpay webhook:', error);
    const message = error instanceof Error ? error.message : 'Failed to process webhook';
    return { success: false, error: message };
  }
}

/**
 * Fetch a Razorpay order by ID.
 * Useful for verifying order status directly from Razorpay.
 */
export async function fetchRazorpayOrder(razorpayOrderId: string): Promise<{
  success: boolean;
  order?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    receipt: string;
    created_at: number;
  };
  error?: string;
}> {
  try {
    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.fetch(razorpayOrderId);

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt || '',
        created_at: order.created_at,
      },
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to fetch Razorpay order:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch Razorpay order';
    return { success: false, error: message };
  }
}

/**
 * Fetch payments for a Razorpay order.
 * Useful for verifying payment status when webhook hasn't arrived.
 */
export async function fetchRazorpayOrderPayments(razorpayOrderId: string): Promise<{
  success: boolean;
  payments?: Array<{
    id: string;
    status: string;
    amount: number;
    method: string;
    created_at: number;
  }>;
  error?: string;
}> {
  try {
    const razorpay = getRazorpayInstance();
    const result = await razorpay.orders.fetchPayments(razorpayOrderId);

    return {
      success: true,
      payments: result.items.map((payment: Record<string, unknown>) => ({
        id: payment.id as string,
        status: payment.status as string,
        amount: payment.amount as number,
        method: payment.method as string,
        created_at: payment.created_at as number,
      })),
    };
  } catch (error) {
    console.error('[RazorpayService] Failed to fetch Razorpay order payments:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch order payments';
    return { success: false, error: message };
  }
}

/**
 * Cancel a Razorpay subscription.
 */
export async function cancelRazorpaySubscription(
  razorpaySubscriptionId: string,
  cancelAtCycleEnd: boolean = false
): Promise<{
  success: boolean;
  subscriptionId?: string;
  error?: string;
}> {
  try {
    const razorpay = getRazorpayInstance();
    await razorpay.subscriptions.cancel(razorpaySubscriptionId, cancelAtCycleEnd ? 1 : 0);

    return { success: true, subscriptionId: razorpaySubscriptionId };
  } catch (error) {
    console.error('[RazorpayService] Failed to cancel Razorpay subscription:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel Razorpay subscription';
    return { success: false, error: message };
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Uses a constant-time algorithm regardless of where the first difference occurs.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Get Razorpay key ID for frontend checkout.
 * This is the ONLY value from Razorpay config that should be sent to the frontend.
 */
export function getRazorpayKeyId(): string {
  return RAZORPAY_KEY_ID;
}

/**
 * Check if Razorpay is properly configured.
 */
export function isRazorpayConfigured(): boolean {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

/**
 * Get the webhook processing status for debugging/monitoring.
 */
export async function getWebhookProcessingStats(options?: {
  since?: Date;
}): Promise<{
  total: number;
  processed: number;
  failed: number;
  pending: number;
}> {
  try {
    const where: Record<string, unknown> = { provider: 'razorpay' };
    if (options?.since) {
      where.receivedAt = { gte: options.since };
    }

    const [total, processed, failed, pending] = await Promise.all([
      db.paymentWebhook.count({ where }),
      db.paymentWebhook.count({ where: { ...where, processed: true } }),
      db.paymentWebhook.count({
        where: { ...where, processed: false, processingError: { not: null } },
      }),
      db.paymentWebhook.count({
        where: { ...where, processed: false, processingError: null },
      }),
    ]);

    return { total, processed, failed, pending };
  } catch (error) {
    console.error('[RazorpayService] Failed to get webhook stats:', error);
    return { total: 0, processed: 0, failed: 0, pending: 0 };
  }
}

/**
 * Retry processing a failed webhook event.
 */
export async function retryFailedWebhook(webhookId: string): Promise<WebhookProcessResult> {
  try {
    const webhook = await db.paymentWebhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      return { success: false, error: 'Webhook record not found' };
    }

    if (webhook.processed) {
      return { success: true, alreadyProcessed: true };
    }

    // Parse the stored payload
    const parsedEvent: RazorpayWebhookEvent = JSON.parse(webhook.payload);

    // Dispatch to appropriate handler
    let result: WebhookProcessResult;

    switch (webhook.eventType) {
      case 'payment.captured':
        result = await handlePaymentCaptured(
          parsedEvent.payload.payment!.entity as RazorpayPaymentCapturedPayload
        );
        break;

      case 'payment.failed':
        result = await handlePaymentFailed(
          parsedEvent.payload.payment!.entity as RazorpayPaymentFailedPayload
        );
        break;

      case 'subscription.charged':
        result = await handleSubscriptionCharged(
          parsedEvent.payload.subscription!.entity as RazorpaySubscriptionChargedPayload
        );
        break;

      case 'subscription.cancelled':
        result = await handleSubscriptionCancelled(
          parsedEvent.payload.subscription!.entity as RazorpaySubscriptionCancelledPayload
        );
        break;

      default:
        result = { success: false, error: `Unhandled event type: ${webhook.eventType}` };
    }

    // Update webhook record
    await db.paymentWebhook.update({
      where: { id: webhookId },
      data: {
        processed: result.success,
        processedAt: new Date(),
        processingError: result.success ? null : result.error || null,
      },
    });

    return result;
  } catch (error) {
    console.error('[RazorpayService] Failed to retry webhook:', error);
    const message = error instanceof Error ? error.message : 'Failed to retry webhook processing';
    return { success: false, error: message };
  }
}
