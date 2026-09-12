// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Complete Stripe Integration Service
// Phase 4: Payment Gateway — Stripe Provider
//
// CRITICAL RULES:
// - NEVER trust frontend payment success — always verify via webhook
// - NEVER update DB before webhook signature verification
// - ALWAYS use Prisma $transaction for atomic operations
// - ALWAYS log audit events for every billing mutation
// - NEVER store raw card/payment details
// - NEVER expose secret keys to frontend
// - Support idempotency — check PaymentWebhook for already-processed events
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  logPaymentEvent,
  logSubscriptionEvent,
  logCouponEvent,
  logBillingEvent,
} from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { validateAndApplyCoupon, incrementCouponUsage } from '@/lib/coupon-service';

// ═══════════════════════════════════════════════════════════════════
// STRIPE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Singleton Stripe instance initialized with the secret key from env.
 * Throws at import-time only if STRIPE_SECRET_KEY is missing AND a
 * Stripe operation is actually invoked — the getter pattern allows the
 * module to be imported in environments where Stripe is not configured.
 */
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      '[StripeService] STRIPE_SECRET_KEY is not set. ' +
      'Please add it to your .env file before using Stripe operations.'
    );
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: '2025-04-30.basil',
    typescript: true,
  });

  return _stripe;
}

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

/** Supported billing cycles */
export type StripeBillingCycle = 'monthly' | 'yearly';

/** Supported currencies */
export type StripeCurrency = 'usd' | 'inr';

/** Parameters for creating a checkout session */
export interface CreateCheckoutSessionParams {
  userId: string;
  plan: PlanType;
  billingCycle: StripeBillingCycle;
  currency?: StripeCurrency;
  couponCode?: string;
  metadata?: Record<string, string>;
}

/** Result of creating a checkout session */
export interface CheckoutSessionResult {
  success: boolean;
  sessionId?: string;
  url?: string;
  paymentOrderId?: string;
  error?: string;
}

/** Result of webhook signature verification */
export interface WebhookVerificationResult {
  verified: boolean;
  event?: Stripe.Event;
  error?: string;
}

/** Result of processing a webhook event */
export interface WebhookProcessResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// PLAN PRICING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

interface PlanPrice {
  monthly: number;
  yearly: number;
}

/** Prices in USD (cents are handled by Stripe) */
const PLAN_PRICES_USD: Record<Exclude<PlanType, 'free'>, PlanPrice> = {
  pro: { monthly: 29, yearly: 279 },
  elite: { monthly: 89, yearly: 849 },
};

/** Prices in INR (whole rupees, Stripe handles sub-unit) */
const PLAN_PRICES_INR: Record<Exclude<PlanType, 'free'>, PlanPrice> = {
  pro: { monthly: 2299, yearly: 22499 },
  elite: { monthly: 6999, yearly: 67499 },
};

/**
 * Get the price for a plan + billing cycle + currency.
 * Returns 0 for the free plan.
 */
function getPlanPrice(
  plan: PlanType,
  billingCycle: StripeBillingCycle,
  currency: StripeCurrency = 'usd'
): number {
  if (plan === 'free') return 0;

  const priceMap = currency === 'inr' ? PLAN_PRICES_INR : PLAN_PRICES_USD;
  const planPrices = priceMap[plan];
  if (!planPrices) return 0;

  return billingCycle === 'monthly' ? planPrices.monthly : planPrices.yearly;
}

/**
 * Build a human-readable product name for the Stripe line item.
 */
function getProductName(plan: PlanType, billingCycle: StripeBillingCycle): string {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const cycleLabel = billingCycle === 'monthly' ? 'Monthly' : 'Yearly';
  return `AcquisitionOS ${planLabel} — ${cycleLabel}`;
}

/**
 * Generate a unique invoice number.
 * Format: INV-YYYYMMDD-<random6>
 */
function generateInvoiceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${dateStr}-${rand}`;
}

// ═══════════════════════════════════════════════════════════════════
// STRIPE CUSTOMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Stripe Customer or retrieve an existing one.
 * Looks up the user's subscription record for an existing stripeCustomerId.
 * If none, creates a new Stripe Customer and persists the ID.
 */
async function getOrCreateStripeCustomer(
  userId: string,
  userEmail: string,
  userName?: string
): Promise<string> {
  const stripe = getStripe();

  // Check for existing customer in our DB
  const existingSub = await db.subscription.findFirst({
    where: {
      userId,
      stripeCustomerId: { not: null },
    },
    select: { stripeCustomerId: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existingSub?.stripeCustomerId) {
    // Verify the customer still exists in Stripe
    try {
      await stripe.customers.retrieve(existingSub.stripeCustomerId);
      return existingSub.stripeCustomerId;
    } catch {
      // Customer was deleted in Stripe — create a new one below
    }
  }

  // Create a new Stripe Customer
  const customer = await stripe.customers.create({
    email: userEmail,
    name: userName || undefined,
    metadata: {
      userId,
    },
  });

  return customer.id;
}

// ═══════════════════════════════════════════════════════════════════
// CHECKOUT SESSION CREATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Stripe Checkout Session for subscription or one-time payment.
 *
 * - For monthly/yearly plans: mode='subscription'
 * - For one-time credit addon purchases: mode='payment'
 * - Applies coupon discount if valid
 * - Stores PaymentOrder in DB with provider='stripe'
 * - Returns { sessionId, url, paymentOrderId }
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CheckoutSessionResult> {
  try {
    const {
      userId,
      plan,
      billingCycle,
      currency = 'usd',
      couponCode,
      metadata = {},
    } = params;

    // ── Validation ──────────────────────────────────────────────────
    if (plan === 'free') {
      return { success: false, error: 'Cannot create a checkout session for the free plan' };
    }

    if (!['pro', 'elite'].includes(plan)) {
      return { success: false, error: `Invalid plan: ${plan}` };
    }

    // Fetch user
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // ── Pricing ─────────────────────────────────────────────────────
    const baseAmount = getPlanPrice(plan, billingCycle, currency);
    const stripeCurrency = currency;

    // ── Coupon ──────────────────────────────────────────────────────
    let discountAmount = 0;
    let finalAmount = baseAmount;
    let couponId: string | undefined;

    if (couponCode) {
      const couponResult = await validateAndApplyCoupon({
        code: couponCode,
        baseAmount,
        plan,
        userId,
      });

      if (couponResult.valid) {
        discountAmount = couponResult.discountAmount;
        finalAmount = couponResult.finalAmount ?? baseAmount;

        // Try to find or create a matching Stripe Coupon
        // We use a naming convention to find our coupons
        try {
          const stripe = getStripe();

          // Search for an existing coupon with matching code
          const existingCoupons = await stripe.coupons.list({
            limit: 100,
          });

          const match = existingCoupons.data.find(
            (c) => c.name === couponCode || c.id === couponCode
          );

          if (match) {
            couponId = match.id;
          } else {
            // Create a Stripe coupon for the discount
            const coupon = await stripe.coupons.create({
              amount_off: currency === 'inr'
                ? Math.round(discountAmount * 100)
                : Math.round(discountAmount * 100),
              currency: stripeCurrency,
              duration: 'once',
              name: couponCode,
              metadata: { internalCode: couponCode },
            });
            couponId = coupon.id;
          }
        } catch (couponErr) {
          // If Stripe coupon creation fails, fall back to manual discount
          // via adjusting the line-item price
          console.warn('[StripeService] Could not create Stripe coupon, using manual discount:', couponErr);
          couponId = undefined;
        }

        await logCouponEvent(userId, 'coupon_applied', {
          code: couponCode,
          discountAmount,
        });
      } else {
        await logCouponEvent(userId, 'coupon_rejected', {
          code: couponCode,
          reason: couponResult.error || 'Invalid coupon',
        });
        // Continue without coupon — don't block checkout
      }
    }

    // ── PaymentOrder ────────────────────────────────────────────────
    const idempotencyKey = `stripe_checkout_${userId}_${plan}_${billingCycle}_${Date.now()}`;

    const paymentOrder = await db.paymentOrder.create({
      data: {
        userId,
        provider: 'stripe',
        amount: finalAmount,
        currency: stripeCurrency.toUpperCase(),
        plan,
        billingCycle,
        status: 'pending',
        couponCode: couponCode || null,
        discountAmount,
        subtotal: baseAmount,
        taxRate: 0,
        taxAmount: 0,
        idempotencyKey,
      },
    });

    // ── Stripe Customer ─────────────────────────────────────────────
    const stripeCustomerId = await getOrCreateStripeCustomer(
      userId,
      user.email,
      user.name ?? undefined
    );

    // ── Build Line Items ────────────────────────────────────────────
    const stripe = getStripe();
    const isSubscription = true; // All plan checkouts are subscriptions

    // Amount in Stripe's smallest currency unit (cents for USD, paise for INR)
    const unitAmount = Math.round(finalAmount * 100);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: stripeCurrency,
          product_data: {
            name: getProductName(plan, billingCycle),
            description: `AcquisitionOS ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan — ${billingCycle === 'monthly' ? 'billed monthly' : 'billed annually'}`,
            metadata: { plan, billingCycle },
          },
          unit_amount: unitAmount,
          recurring: isSubscription
            ? {
                interval: billingCycle === 'monthly' ? 'month' : 'year',
              }
            : undefined,
        },
        quantity: 1,
      },
    ];

    // ── URLs ────────────────────────────────────────────────────────
    const successUrl =
      process.env.STRIPE_SUCCESS_URL ||
      (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '') + '/billing?session_id={CHECKOUT_SESSION_ID}&status=success';
    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ||
      (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '') + '/billing?status=cancelled';

    // ── Metadata ────────────────────────────────────────────────────
    const sessionMetadata: Record<string, string> = {
      userId,
      plan,
      billingCycle,
      paymentOrderId: paymentOrder.id,
      ...(couponCode ? { couponCode } : {}),
      ...metadata,
    };

    // ── Create Checkout Session ─────────────────────────────────────
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId,
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: sessionMetadata,
      subscription_data: isSubscription
        ? {
            metadata: sessionMetadata,
          }
        : undefined,
      payment_method_types: ['card'],
      allow_promotion_codes: !couponCode, // Allow promo codes only if no coupon already applied
    };

    // Apply Stripe coupon if we have one
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // ── Update PaymentOrder with providerOrderId ────────────────────
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: { providerOrderId: session.id },
    });

    // ── Log event ───────────────────────────────────────────────────
    await logPaymentEvent(userId, 'payment_initiated', {
      amount: finalAmount,
      currency: stripeCurrency.toUpperCase(),
      provider: 'stripe',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    return {
      success: true,
      sessionId: session.id,
      url: session.url ?? undefined,
      paymentOrderId: paymentOrder.id,
    };
  } catch (error) {
    console.error('[StripeService] Failed to create checkout session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Verify the Stripe webhook signature.
 *
 * CRITICAL: NEVER trust unverified payloads.
 * Always use stripe.webhooks.constructEvent() to verify.
 *
 * @param body      — The raw request body (as a string or Buffer)
 * @param sigHeader — The Stripe-Signature header value
 * @returns The verified Stripe event, or an error
 */
export function verifyWebhookSignature(
  body: string | Buffer,
  sigHeader: string | Buffer | string[]
): WebhookVerificationResult {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[StripeService] STRIPE_WEBHOOK_SECRET is not configured');
      return {
        verified: false,
        error: 'Webhook secret is not configured on the server',
      };
    }

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(body, sigHeader, webhookSecret);

    return {
      verified: true,
      event,
    };
  } catch (error) {
    console.error('[StripeService] Webhook signature verification failed:', error);
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// IDEMPOTENCY: CHECK / RECORD WEBHOOK EVENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a webhook event has already been processed (idempotency guard).
 * Returns true if the event was already processed.
 */
async function isEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const existing = await db.paymentWebhook.findUnique({
    where: { eventId },
    select: { processed: true },
  });
  return existing?.processed ?? false;
}

/**
 * Record a webhook event in the PaymentWebhook table.
 * Marks it as processed (or stores the error).
 */
async function recordWebhookEvent(params: {
  eventId: string;
  eventType: string;
  payload: string;
  signature?: string;
  paymentOrderId?: string;
  processed: boolean;
  processingError?: string;
}): Promise<void> {
  try {
    await db.paymentWebhook.upsert({
      where: { eventId: params.eventId },
      create: {
        eventId: params.eventId,
        eventType: params.eventType,
        payload: params.payload,
        signature: params.signature || null,
        paymentOrderId: params.paymentOrderId || null,
        provider: 'stripe',
        processed: params.processed,
        processingError: params.processingError || null,
        processedAt: params.processed ? new Date() : null,
      },
      update: {
        processed: params.processed,
        processingError: params.processingError || null,
        processedAt: params.processed ? new Date() : undefined,
        paymentOrderId: params.paymentOrderId || undefined,
      },
    });
  } catch (error) {
    // Never fail the main flow due to webhook recording failure
    console.error('[StripeService] Failed to record webhook event:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a verified Stripe webhook event.
 * Routes to the appropriate handler based on event type.
 *
 * Supports idempotency — skips already-processed events.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<WebhookProcessResult> {
  try {
    // ── Idempotency check ───────────────────────────────────────────
    if (await isEventAlreadyProcessed(event.id)) {
      console.log(`[StripeService] Event ${event.id} already processed, skipping`);
      return { success: true, skipped: true };
    }

    // ── Route to handler ────────────────────────────────────────────
    let result: WebhookProcessResult;

    switch (event.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutSessionCompleted(event);
        break;

      case 'invoice.payment_succeeded':
        result = await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(event);
        break;

      case 'customer.subscription.deleted':
        result = await handleCustomerSubscriptionDeleted(event);
        break;

      case 'customer.subscription.updated':
        result = await handleCustomerSubscriptionUpdated(event);
        break;

      default:
        // Unhandled event type — record but don't fail
        console.log(`[StripeService] Unhandled event type: ${event.type}`);
        result = { success: true, skipped: true };
    }

    // ── Record webhook ──────────────────────────────────────────────
    await recordWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      payload: JSON.stringify(event.data.object),
      processed: result.success,
      processingError: result.error || undefined,
    });

    return result;
  } catch (error) {
    console.error('[StripeService] Failed to process webhook event:', error);

    // Still record the event as failed
    await recordWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      payload: JSON.stringify(event.data.object),
      processed: false,
      processingError: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process webhook event',
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// HANDLER: checkout.session.completed
// ───────────────────────────────────────────────────────────────────

/**
 * Process checkout.session.completed webhook.
 *
 * This is the PRIMARY confirmation path. NEVER trust the frontend
 * redirect — always use this webhook to confirm payment.
 *
 * Atomic DB transaction:
 *  a. Update PaymentOrder → completed, set providerPaymentId
 *  b. Update/create Subscription record
 *  c. Update User record (plan, credits, isTrial=false)
 *  d. Create CreditsLedger entry
 *  e. Create Invoice record
 *  f. Increment coupon usage if applicable
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event
): Promise<WebhookProcessResult> {
  try {
    const session = event.data.object as Stripe.Checkout.Session;

    // Extract metadata — supports both snake_case (as set by create-order) and camelCase
    const userId = session.metadata?.user_id || session.metadata?.userId;
    const plan = session.metadata?.plan as PlanType | undefined;
    const billingCycle = (session.metadata?.billing_cycle || session.metadata?.billingCycle) as StripeBillingCycle | undefined;
    const paymentOrderId = session.metadata?.order_id || session.metadata?.paymentOrderId;
    const couponCode = session.metadata?.coupon_code || session.metadata?.couponCode;

    if (!userId || !plan) {
      console.error('[StripeService] checkout.session.completed — missing userId or plan in metadata', {
        metadata: session.metadata,
      });
      return { success: false, error: 'Missing required metadata in checkout session' };
    }

    // Find PaymentOrder — by metadata.orderId or by session ID
    let paymentOrder = paymentOrderId
      ? await db.paymentOrder.findUnique({ where: { id: paymentOrderId } })
      : null;

    if (!paymentOrder) {
      paymentOrder = await db.paymentOrder.findFirst({
        where: { providerOrderId: session.id },
      });
    }

    if (!paymentOrder) {
      console.error('[StripeService] PaymentOrder not found for checkout session', {
        sessionId: session.id,
        paymentOrderId,
      });
      return { success: false, error: 'PaymentOrder not found' };
    }

    // Guard: already completed
    if (paymentOrder.status === 'completed') {
      console.log(`[StripeService] PaymentOrder ${paymentOrder.id} already completed`);
      return { success: true, skipped: true };
    }

    // Verify the session payment status
    if (session.payment_status !== 'paid') {
      console.warn('[StripeService] Checkout session not paid', {
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });
      return { success: false, error: 'Checkout session is not in paid status' };
    }

    // Period dates
    const now = new Date();
    const periodEnd =
      billingCycle === 'yearly'
        ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const planCredits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

    // Stripe subscription ID (for subscription mode)
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null;

    const stripeCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null;

    const providerPaymentId =
      session.payment_intent && typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null;

    // ── Atomic Transaction ──────────────────────────────────────────
    await db.$transaction(async (tx) => {
      // a. Read user's current credits before update (to accumulate)
      const userBefore = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      const currentCredits = userBefore?.credits ?? 0;
      const newCredits = currentCredits + planCredits;

      // b. Update PaymentOrder
      await tx.paymentOrder.update({
        where: { id: paymentOrder!.id },
        data: {
          status: 'completed',
          providerPaymentId,
        },
      });

      // c. Update/create Subscription
      const existingSub = await tx.subscription.findFirst({
        where: {
          userId,
          status: { in: ['trialing', 'active', 'past_due'] },
        },
      });

      if (existingSub) {
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            plan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            cancelAtPeriodEnd: false,
            scheduledPlanChange: null,
            billingCycle: billingCycle || 'monthly',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            stripeCustomerId,
            stripeSubscriptionId,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId,
            plan,
            status: 'active',
            isTrial: false,
            trialEndsAt: null,
            billingCycle: billingCycle || 'monthly',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            stripeCustomerId,
            stripeSubscriptionId,
          },
        });
      }

      // d. Update User — ACCUMULATE credits (existing + new plan credits)
      await tx.user.update({
        where: { id: userId },
        data: {
          plan,
          isTrial: false,
          trialEndsAt: null,
          credits: newCredits,
          creditsMonthly: planCredits,
          rolloverCredits: currentCredits,
        },
      });

      // e. Create CreditsLedger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'plan_upgrade',
          credits: planCredits,
          balance: newCredits,
          description: `Upgraded to ${plan} plan (${billingCycle}) — ${planCredits} credits added (previous balance: ${currentCredits}, new total: ${newCredits})`,
          referenceId: paymentOrder!.id,
        },
      });

      // e. Create Invoice
      const invoiceNumber = generateInvoiceNumber();
      await tx.invoice.create({
        data: {
          paymentOrderId: paymentOrder!.id,
          invoiceNumber,
          userId,
          subtotal: paymentOrder!.subtotal,
          taxRate: paymentOrder!.taxRate,
          taxAmount: paymentOrder!.taxAmount,
          total: paymentOrder!.amount,
          currency: paymentOrder!.currency,
          gstNumber: paymentOrder!.gstNumber,
          lineItems: JSON.stringify([
            {
              description: getProductName(plan, billingCycle || 'monthly'),
              amount: paymentOrder!.subtotal,
              quantity: 1,
              discount: paymentOrder!.discountAmount,
            },
          ]),
        },
      });

      // f. Increment coupon usage if applicable
      if (couponCode) {
        // Use a separate non-transactional call — coupon usage increment
        // is non-critical and shouldn't roll back the main operation
        incrementCouponUsage(couponCode).catch((err) => {
          console.error('[StripeService] Failed to increment coupon usage:', err);
        });
      }
    });

    // ── Log events (outside transaction) ────────────────────────────
    await logPaymentEvent(userId, 'payment_completed', {
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      provider: 'stripe',
      plan,
      paymentOrderId: paymentOrder.id,
    });

    await logSubscriptionEvent(userId, 'upgrade_completed', {
      toPlan: plan,
      billingCycle,
    });

    if (couponCode) {
      await logCouponEvent(userId, 'coupon_applied', {
        code: couponCode,
        discountAmount: paymentOrder.discountAmount,
      });
    }

    console.log(`[StripeService] Checkout completed: user=${userId} plan=${plan} order=${paymentOrder.id}`);

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to handle checkout.session.completed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process checkout completion',
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// HANDLER: invoice.payment_succeeded
// ───────────────────────────────────────────────────────────────────

/**
 * Process invoice.payment_succeeded webhook.
 *
 * Handles recurring subscription payments — adds monthly credits
 * and updates subscription period dates.
 */
export async function handleInvoicePaymentSucceeded(
  event: Stripe.Event
): Promise<WebhookProcessResult> {
  try {
    const invoice = event.data.object as Stripe.Invoice;

    // Only handle subscription invoices (not one-time payments)
    if (!invoice.subscription) {
      console.log('[StripeService] invoice.payment_succeeded — not a subscription invoice, skipping');
      return { success: true, skipped: true };
    }

    const stripeSubscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription.id;

    // Find subscription by Stripe subscription ID
    const subscription = await db.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      console.error('[StripeService] Subscription not found for invoice', {
        stripeSubscriptionId,
        invoiceId: invoice.id,
      });
      return { success: false, error: 'Subscription not found for Stripe subscription ID' };
    }

    const userId = subscription.userId;
    const plan = subscription.plan as PlanType;
    const planCredits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;

    // Period dates from invoice
    const periodStart = invoice.period_start
      ? new Date(invoice.period_start * 1000)
      : new Date();
    const periodEnd = invoice.period_end
      ? new Date(invoice.period_end * 1000)
      : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Check if this is the first invoice (created during checkout)
    // If so, the checkout.session.completed handler already processed it
    const isInitialInvoice =
      invoice.billing_reason === 'subscription_create' ||
      invoice.billing_reason === 'subscription_cycle_create';

    if (isInitialInvoice) {
      // Just update period dates — credits already handled by checkout.session.completed
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'active',
        },
      });

      console.log(`[StripeService] Initial invoice for subscription ${subscription.id}, updated period dates`);
      return { success: true };
    }

    // ── Recurring payment: add monthly credits ──────────────────────
    await db.$transaction(async (tx) => {
      // Update subscription period and status
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'active',
          cancelAtPeriodEnd: false,
        },
      });

      // Get current user credits
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const newBalance = user.credits + planCredits;

      // Add monthly credits
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: newBalance,
          creditsMonthly: planCredits,
        },
      });

      // Create ledger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'monthly_reset',
          credits: planCredits,
          balance: newBalance,
          description: `Monthly credits added for ${plan} plan — ${planCredits} credits`,
          referenceId: invoice.id,
        },
      });

      // Create PaymentOrder for the recurring payment
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          userId,
          provider: 'stripe',
          providerOrderId: invoice.id,
          providerPaymentId:
            invoice.payment_intent && typeof invoice.payment_intent === 'string'
              ? invoice.payment_intent
              : null,
          amount: (invoice.total / 100), // Stripe amounts are in cents
          currency: invoice.currency.toUpperCase(),
          plan,
          billingCycle: subscription.billingCycle || 'monthly',
          status: 'completed',
          subtotal: (invoice.subtotal / 100),
          taxRate: invoice.tax ? ((invoice.tax / invoice.subtotal) * 100) : 0,
          taxAmount: invoice.tax ? (invoice.tax / 100) : 0,
        },
      });

      // Create Invoice record
      await tx.invoice.create({
        data: {
          paymentOrderId: paymentOrder.id,
          invoiceNumber: generateInvoiceNumber(),
          userId,
          subtotal: paymentOrder.subtotal,
          taxRate: paymentOrder.taxRate,
          taxAmount: paymentOrder.taxAmount,
          total: paymentOrder.amount,
          currency: paymentOrder.currency,
          lineItems: JSON.stringify([
            {
              description: getProductName(plan, subscription.billingCycle as StripeBillingCycle || 'monthly'),
              amount: paymentOrder.subtotal,
              quantity: 1,
            },
          ]),
        },
      });
    });

    // Log event
    await logPaymentEvent(userId, 'payment_completed', {
      amount: invoice.total / 100,
      currency: invoice.currency.toUpperCase(),
      provider: 'stripe',
      plan,
    });

    await logSubscriptionEvent(userId, 'plan_change_processed', {
      toPlan: plan,
      toStatus: 'active',
    });

    console.log(`[StripeService] Recurring payment succeeded: user=${userId} plan=${plan}`);

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to handle invoice.payment_succeeded:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process invoice payment',
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// HANDLER: invoice.payment_failed
// ───────────────────────────────────────────────────────────────────

/**
 * Process invoice.payment_failed webhook.
 *
 * Sets subscription to 'past_due' and logs the event.
 * Does NOT downgrade the user immediately — gives them time to update
 * payment method (handled by subscription.deleted after dunning period).
 */
export async function handleInvoicePaymentFailed(
  event: Stripe.Event
): Promise<WebhookProcessResult> {
  try {
    const invoice = event.data.object as Stripe.Invoice;

    if (!invoice.subscription) {
      console.log('[StripeService] invoice.payment_failed — not a subscription invoice, skipping');
      return { success: true, skipped: true };
    }

    const stripeSubscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription.id;

    const subscription = await db.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      console.error('[StripeService] Subscription not found for failed invoice', {
        stripeSubscriptionId,
      });
      return { success: false, error: 'Subscription not found' };
    }

    const userId = subscription.userId;
    const attemptCount = invoice.attempt_count ?? 1;

    // Set subscription to past_due
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'past_due' },
    });

    // Log the payment failure
    await logPaymentEvent(userId, 'payment_failed', {
      amount: invoice.total / 100,
      currency: invoice.currency.toUpperCase(),
      provider: 'stripe',
      plan: subscription.plan,
      reason: `Payment attempt ${attemptCount} failed`,
    });

    await logSubscriptionEvent(userId, 'subscription_past_due', {
      fromStatus: subscription.status,
      toStatus: 'past_due',
    });

    await logBillingEvent({
      userId,
      action: 'payment_failed',
      details: `Subscription payment failed (attempt ${attemptCount})`,
      metadata: {
        invoiceId: invoice.id,
        attemptCount,
        stripeSubscriptionId,
      },
    });

    console.warn(`[StripeService] Payment failed: user=${userId} attempt=${attemptCount}`);

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to handle invoice.payment_failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment failure',
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// HANDLER: customer.subscription.deleted
// ───────────────────────────────────────────────────────────────────

/**
 * Process customer.subscription.deleted webhook.
 *
 * Triggered when a subscription is fully canceled (after dunning or
 * manual cancellation at period end). Downgrades the user to the
 * free plan.
 */
export async function handleCustomerSubscriptionDeleted(
  event: Stripe.Event
): Promise<WebhookProcessResult> {
  try {
    const stripeSubscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = stripeSubscription.id;

    const subscription = await db.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      console.error('[StripeService] Subscription not found for deleted event', {
        stripeSubscriptionId,
      });
      return { success: false, error: 'Subscription not found' };
    }

    const userId = subscription.userId;
    const previousPlan = subscription.plan as PlanType;
    const freeCredits = PLAN_CREDITS.free;

    // Atomic downgrade
    await db.$transaction(async (tx) => {
      // Update subscription to expired
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'expired',
          cancelAtPeriodEnd: false,
          scheduledPlanChange: null,
          stripeSubscriptionId: null, // Clear the Stripe link
        },
      });

      // Downgrade user to free
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: 'free',
          isTrial: false,
          trialEndsAt: null,
          credits: freeCredits,
          creditsMonthly: freeCredits,
          rolloverCredits: 0,
        },
      });

      // Create ledger entry
      await tx.creditsLedger.create({
        data: {
          userId,
          action: 'plan_downgrade',
          credits: freeCredits,
          balance: freeCredits,
          description: `Subscription expired — downgraded from ${previousPlan} to free plan`,
          referenceId: subscription.id,
        },
      });
    });

    // Log events
    await logSubscriptionEvent(userId, 'subscription_expired', {
      fromPlan: previousPlan,
      toPlan: 'free',
      fromStatus: subscription.status,
      toStatus: 'expired',
    });

    await logBillingEvent({
      userId,
      action: 'subscription_expired',
      details: `Subscription ${stripeSubscriptionId} deleted — user downgraded to free`,
      metadata: {
        stripeSubscriptionId,
        previousPlan,
      },
    });

    console.log(`[StripeService] Subscription deleted: user=${userId} prevPlan=${previousPlan} → free`);

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to handle customer.subscription.deleted:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process subscription deletion',
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// HANDLER: customer.subscription.updated
// ───────────────────────────────────────────────────────────────────

/**
 * Process customer.subscription.updated webhook.
 *
 * Handles plan changes (upgrades/downgrades):
 * - Detects plan changes from subscription metadata or price changes
 * - Applies upgrades immediately
 * - Schedules downgrades for end of period (via scheduledPlanChange)
 * - Handles pause/resume and cancel_at_period_end changes
 */
export async function handleCustomerSubscriptionUpdated(
  event: Stripe.Event
): Promise<WebhookProcessResult> {
  try {
    const stripeSubscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = stripeSubscription.id;

    const subscription = await db.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      // Could be a subscription not created through our system
      console.warn('[StripeService] Subscription not found for update event', {
        stripeSubscriptionId,
      });
      return { success: false, error: 'Subscription not found' };
    }

    const userId = subscription.userId;
    const previousPlan = subscription.plan as PlanType;

    // Determine the new plan from the subscription's price/item metadata
    let newPlan: PlanType | null = null;

    // Try to get plan from subscription metadata
    if (stripeSubscription.metadata?.plan) {
      newPlan = stripeSubscription.metadata.plan as PlanType;
    } else {
      // Try to determine from the price
      const priceId = stripeSubscription.items.data[0]?.price.id;
      if (priceId) {
        // Check against known price IDs (you'd populate this from your Stripe config)
        // For now, we use the metadata approach primarily
        newPlan = previousPlan; // Default: no change if we can't determine
      }
    }

    // Update subscription fields from Stripe
    const updateData: Record<string, unknown> = {
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    };

    // Handle plan change
    if (newPlan && newPlan !== previousPlan && newPlan !== 'free') {
      const planLevel = { free: 0, pro: 1, elite: 2 };
      const previousLevel = planLevel[previousPlan] ?? 0;
      const newLevel = planLevel[newPlan] ?? 0;

      if (newLevel > previousLevel) {
        // ── Upgrade: Apply immediately ────────────────────────────────
        const newCredits = PLAN_CREDITS[newPlan] || PLAN_CREDITS.free;

        await db.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              plan: newPlan,
              status: 'active',
              ...updateData,
            },
          });

          await tx.user.update({
            where: { id: userId },
            data: {
              plan: newPlan,
              credits: newCredits,
              creditsMonthly: newCredits,
            },
          });

          await tx.creditsLedger.create({
            data: {
              userId,
              action: 'plan_upgrade',
              credits: newCredits,
              balance: newCredits,
              description: `Upgraded from ${previousPlan} to ${newPlan} plan`,
              referenceId: subscription.id,
            },
          });
        });

        await logSubscriptionEvent(userId, 'upgrade_completed', {
          fromPlan: previousPlan,
          toPlan: newPlan,
        });

        console.log(`[StripeService] Subscription upgraded: user=${userId} ${previousPlan} → ${newPlan}`);
      } else {
        // ── Downgrade: Schedule for end of period ─────────────────────
        await db.subscription.update({
          where: { id: subscription.id },
          data: {
            scheduledPlanChange: newPlan,
            ...updateData,
          },
        });

        await logSubscriptionEvent(userId, 'downgrade_scheduled', {
          fromPlan: previousPlan,
          toPlan: newPlan,
          scheduledChange: newPlan,
        });

        console.log(`[StripeService] Subscription downgrade scheduled: user=${userId} ${previousPlan} → ${newPlan}`);
      }
    } else {
      // No plan change — just update subscription fields
      await db.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });
    }

    // Handle status changes
    const stripeStatus = stripeSubscription.status;
    if (stripeStatus === 'active' && subscription.status === 'past_due') {
      // Payment recovered
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'active' },
      });

      await logSubscriptionEvent(userId, 'subscription_reactivated', {
        fromStatus: 'past_due',
        toStatus: 'active',
      });

      console.log(`[StripeService] Subscription recovered from past_due: user=${userId}`);
    } else if (stripeStatus === 'canceled') {
      // This is handled by customer.subscription.deleted, but update here too
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'canceled' },
      });

      await logSubscriptionEvent(userId, 'subscription_canceled', {
        fromStatus: subscription.status,
        toStatus: 'canceled',
      });
    }

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to handle customer.subscription.updated:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process subscription update',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// STRIPE PORTAL SESSION
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Stripe Customer Portal session for the user to manage
 * their subscription (update payment method, cancel, etc.).
 */
export async function createCustomerPortalSession(
  userId: string,
  returnUrl?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Find the user's Stripe customer ID
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        stripeCustomerId: { not: null },
      },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      return { success: false, error: 'No Stripe customer found for this user' };
    }

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl || (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '') + '/billing',
    });

    return { success: true, url: portalSession.url };
  } catch (error) {
    console.error('[StripeService] Failed to create portal session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create portal session',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// STRIPE SUBSCRIPTION MANAGEMENT HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Cancel a Stripe subscription at the end of the current period.
 * Updates both Stripe and our DB.
 */
export async function cancelStripeSubscription(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing', 'past_due'] },
        stripeSubscriptionId: { not: null },
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      return { success: false, error: 'No active Stripe subscription found' };
    }

    const stripe = getStripe();

    // Cancel at period end in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update our DB
    await db.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    await logSubscriptionEvent(userId, 'subscription_canceled', {
      fromStatus: subscription.status,
      toStatus: subscription.status, // Status doesn't change yet
    });

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to cancel subscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel subscription',
    };
  }
}

/**
 * Reactivate a canceled Stripe subscription (remove cancel_at_period_end).
 */
export async function reactivateStripeSubscription(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: { not: null },
        status: { in: ['active', 'trialing'] },
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      return { success: false, error: 'No canceled subscription found to reactivate' };
    }

    const stripe = getStripe();

    // Remove cancel_at_period_end in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update our DB
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        scheduledPlanChange: null,
      },
    });

    await logSubscriptionEvent(userId, 'subscription_reactivated', {
      fromStatus: subscription.status,
      toStatus: subscription.status,
    });

    return { success: true };
  } catch (error) {
    console.error('[StripeService] Failed to reactivate subscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reactivate subscription',
    };
  }
}

/**
 * Get the Stripe subscription details for a user.
 * Returns the raw Stripe Subscription object.
 */
export async function getStripeSubscriptionDetails(
  userId: string
): Promise<{ success: boolean; subscription?: Stripe.Subscription; error?: string }> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        stripeSubscriptionId: { not: null },
        status: { in: ['active', 'trialing', 'past_due', 'canceled'] },
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      return { success: false, error: 'No Stripe subscription found' };
    }

    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

    return { success: true, subscription: stripeSub };
  } catch (error) {
    console.error('[StripeService] Failed to get subscription details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get subscription details',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if Stripe is properly configured (env vars set).
 * Useful for feature flags and conditional UI rendering.
 */
export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Get the plan price for display purposes (frontend-safe, no secrets).
 */
export function getStripePlanPrice(
  plan: PlanType,
  billingCycle: StripeBillingCycle,
  currency: StripeCurrency = 'usd'
): { amount: number; currency: string } {
  return {
    amount: getPlanPrice(plan, billingCycle, currency),
    currency: currency.toUpperCase(),
  };
}
