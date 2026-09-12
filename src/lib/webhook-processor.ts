// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Webhook Processing Service
// Phase 5: Payments System — Secure Webhook Verification & Processing
//
// CRITICAL SECURITY REQUIREMENTS:
// 1. ALWAYS verify webhook signature BEFORE processing
// 2. ALWAYS use PaymentWebhook table for idempotency (NOT AuditLog)
// 3. ALWAYS check if eventId already exists in PaymentWebhook
// 4. ALWAYS check timestamp is within 5 minutes for replay protection
// 5. NEVER process the same webhook event twice
// 6. ALWAYS use atomic DB transactions for payment activation
// 7. ALWAYS log failed webhooks with error details
// 8. ALWAYS return 200 to provider even if processing fails
// 9. NEVER expose internal errors in webhook responses
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logPaymentEvent } from '@/lib/billing-audit';
import { createHmac } from 'crypto';
import Stripe from 'stripe';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';

// ===== INTERFACES =====

export interface WebhookProcessResult {
  success: boolean;
  alreadyProcessed?: boolean;
  eventType?: string;
  eventId?: string;
  paymentActivated?: boolean;
  error?: string;
}

// ===== RAZORPAY WEBHOOK VERIFICATION =====

/**
 * Verify Razorpay webhook signature using HMAC-SHA256.
 * Computes the expected signature and compares it with the provided one.
 * Uses constant-time string comparison to prevent timing attacks.
 */
export async function verifyRazorpayWebhook(
  body: string,
  signature: string
): Promise<{ verified: boolean; payload?: any; error?: string }> {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[WebhookProcessor] RAZORPAY_WEBHOOK_SECRET not configured');
      return { verified: false, error: 'Webhook secret not configured' };
    }

    if (!signature) {
      return { verified: false, error: 'Missing signature' };
    }

    // Compute expected signature
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const verified = timingSafeEqual(expectedSignature, signature);

    if (!verified) {
      return { verified: false, error: 'Signature verification failed' };
    }

    // Parse the payload
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      return { verified: false, error: 'Invalid JSON payload' };
    }

    return { verified: true, payload };
  } catch (error) {
    console.error('[WebhookProcessor] Razorpay verification error:', error);
    return { verified: false, error: 'Verification failed' };
  }
}

// ===== STRIPE WEBHOOK VERIFICATION =====

/**
 * Verify Stripe webhook signature using stripe.webhooks.constructEvent().
 * This validates both the signature and the timestamp.
 */
export async function verifyStripeWebhook(
  body: string,
  signature: string
): Promise<{ verified: boolean; event?: any; error?: string }> {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[WebhookProcessor] STRIPE_WEBHOOK_SECRET not configured');
      return { verified: false, error: 'Webhook secret not configured' };
    }

    if (!signature) {
      return { verified: false, error: 'Missing signature' };
    }

    // Use Stripe's official verification method
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-06-20',
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature verification failed';
      console.error('[WebhookProcessor] Stripe verification error:', message);
      return { verified: false, error: message };
    }

    return { verified: true, event };
  } catch (error) {
    console.error('[WebhookProcessor] Stripe verification error:', error);
    return { verified: false, error: 'Verification failed' };
  }
}

// ===== IDEMPOTENCY & WEBHOOK RECORDING =====

/**
 * Record a webhook event in the PaymentWebhook table.
 * Used for idempotency tracking and audit logging.
 * Returns { recorded, alreadyExists } — if alreadyExists, the webhook was already processed.
 */
export async function recordWebhook(params: {
  eventId: string;
  eventType: string;
  provider: 'razorpay' | 'stripe';
  payload: string;
  signature?: string;
  paymentOrderId?: string;
  processed: boolean;
  processingError?: string;
}): Promise<{ recorded: boolean; alreadyExists: boolean }> {
  try {
    // Check if this eventId already exists (idempotency)
    const existing = await db.paymentWebhook.findUnique({
      where: { eventId: params.eventId },
    });

    if (existing) {
      return { recorded: false, alreadyExists: true };
    }

    // Create new webhook record
    await db.paymentWebhook.create({
      data: {
        eventId: params.eventId,
        eventType: params.eventType,
        provider: params.provider,
        payload: params.payload,
        signature: params.signature || null,
        paymentOrderId: params.paymentOrderId || null,
        processed: params.processed,
        processingError: params.processingError || null,
        processedAt: params.processed ? new Date() : null,
      },
    });

    return { recorded: true, alreadyExists: false };
  } catch (error) {
    // If unique constraint violation, it's a duplicate
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2002') {
      return { recorded: false, alreadyExists: true };
    }
    console.error('[WebhookProcessor] Failed to record webhook:', error);
    return { recorded: false, alreadyExists: false };
  }
}

// ===== REPLAY PROTECTION =====

/**
 * Check if a webhook timestamp is within the acceptable window (5 minutes).
 * Prevents replay attacks by rejecting old events.
 */
function isWithinReplayWindow(timestamp: number | string | Date): boolean {
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;
  return Math.abs(now - eventTime) <= fiveMinutesMs;
}

// ===== RAZORPAY WEBHOOK PROCESSING =====

/**
 * Process a Razorpay webhook event.
 * Full pipeline: verify → idempotency → record → process → mark complete.
 *
 * CRITICAL: Always returns a result object. The caller should return 200
 * to Razorpay regardless of processing outcome.
 */
export async function processRazorpayWebhook(
  body: string,
  signature: string
): Promise<WebhookProcessResult> {
  // 1. Verify signature FIRST
  const verification = await verifyRazorpayWebhook(body, signature);
  if (!verification.verified) {
    // Log the failed verification attempt
    console.warn('[WebhookProcessor] Razorpay webhook verification failed:', verification.error);
    await recordWebhook({
      eventId: `razorpay_failed_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      eventType: 'verification_failed',
      provider: 'razorpay',
      payload: body,
      signature,
      processed: false,
      processingError: verification.error,
    }).catch(() => {}); // Never fail the main flow

    return { success: false, error: 'Signature verification failed' };
  }

  const payload = verification.payload;
  const eventType = payload.event as string;

  // Extract event ID and timestamp
  // Razorpay event payload structure: { entity: 'event', id: 'evt_xxx', created_at: 1234567890, ... }
  const eventId = payload.id || `razorpay_${payload.payload?.payment?.entity?.id || Date.now()}`;
  const eventTimestamp = payload.created_at || payload.payload?.payment?.entity?.created_at;

  // 2. Replay protection — check timestamp within 5 minutes
  if (eventTimestamp && !isWithinReplayWindow(eventTimestamp * 1000)) {
    console.warn('[WebhookProcessor] Razorpay webhook replay detected:', { eventId, eventTimestamp });
    await recordWebhook({
      eventId,
      eventType: `${eventType}_replay_rejected`,
      provider: 'razorpay',
      payload: body,
      signature,
      processed: false,
      processingError: `Replay detected: event timestamp ${eventTimestamp} is outside 5-minute window`,
    }).catch(() => {});

    return { success: false, error: 'Replay detected', eventType, eventId };
  }

  // 3. Idempotency check — has this eventId been processed already?
  const existingWebhook = await db.paymentWebhook.findUnique({
    where: { eventId },
  });

  if (existingWebhook) {
    // Already processed — return success but mark as already processed
    return {
      success: true,
      alreadyProcessed: true,
      eventType,
      eventId,
      paymentActivated: existingWebhook.processed,
    };
  }

  // 4. Record the webhook (initially as unprocessed)
  let paymentOrderId: string | undefined;

  // Try to extract payment order ID from payload
  const razorpayOrderId = payload.payload?.payment?.entity?.order_id
    || payload.payload?.subscription?.entity?.id;

  if (razorpayOrderId) {
    const order = await db.paymentOrder.findFirst({
      where: { providerOrderId: razorpayOrderId },
      select: { id: true },
    });
    paymentOrderId = order?.id;
  }

  const recordResult = await recordWebhook({
    eventId,
    eventType,
    provider: 'razorpay',
    payload: body,
    signature,
    paymentOrderId,
    processed: false, // Will be marked true after successful processing
  });

  if (recordResult.alreadyExists) {
    return {
      success: true,
      alreadyProcessed: true,
      eventType,
      eventId,
    };
  }

  // 5. Process specific event types
  let paymentActivated = false;
  let processingError: string | undefined;

  try {
    switch (eventType) {
      case 'payment.captured':
        paymentActivated = await handleRazorpayPaymentCaptured(payload);
        break;

      case 'payment.failed':
        await handleRazorpayPaymentFailed(payload);
        break;

      case 'subscription.cancelled':
        await handleRazorpaySubscriptionCancelled(payload);
        break;

      case 'subscription.charged':
        paymentActivated = await handleRazorpaySubscriptionCharged(payload);
        break;

      default:
        // Unknown event type — log but don't fail
        console.info('[WebhookProcessor] Unhandled Razorpay event type:', eventType);
        break;
    }
  } catch (error) {
    processingError = error instanceof Error ? error.message : 'Unknown processing error';
    console.error('[WebhookProcessor] Razorpay event processing error:', {
      eventType,
      eventId,
      error: processingError,
    });
  }

  // 6. Mark webhook as processed (or record error)
  try {
    await db.paymentWebhook.update({
      where: { eventId },
      data: {
        processed: !processingError,
        processingError: processingError || null,
        processedAt: new Date(),
        paymentOrderId: paymentOrderId || null,
      },
    });
  } catch (updateError) {
    console.error('[WebhookProcessor] Failed to update webhook record:', updateError);
  }

  // 7. Audit log
  if (paymentActivated) {
    try {
      const userId = await getUserIdFromPayload(payload);
      if (userId) {
        await logPaymentEvent(userId, 'payment_completed', {
          amount: payload.payload?.payment?.entity?.amount
            ? payload.payload.payment.entity.amount / 100
            : 0,
          currency: payload.payload?.payment?.entity?.currency?.toUpperCase() || 'INR',
          provider: 'razorpay',
          plan: 'pro', // Best effort — actual plan from order
          paymentOrderId,
        });
      }
    } catch {
      // Don't fail on audit logging errors
    }
  }

  return {
    success: !processingError,
    eventType,
    eventId,
    paymentActivated,
    error: processingError,
  };
}

// ===== STRIPE WEBHOOK PROCESSING =====

/**
 * Process a Stripe webhook event.
 * Full pipeline: verify → idempotency → record → process → mark complete.
 *
 * CRITICAL: Always returns a result object. The caller should return 200
 * to Stripe regardless of processing outcome.
 */
export async function processStripeWebhook(
  body: string,
  signature: string
): Promise<WebhookProcessResult> {
  // 1. Verify signature FIRST
  const verification = await verifyStripeWebhook(body, signature);
  if (!verification.verified) {
    console.warn('[WebhookProcessor] Stripe webhook verification failed:', verification.error);
    await recordWebhook({
      eventId: `stripe_failed_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      eventType: 'verification_failed',
      provider: 'stripe',
      payload: body,
      signature,
      processed: false,
      processingError: verification.error,
    }).catch(() => {});

    return { success: false, error: 'Signature verification failed' };
  }

  const event = verification.event;
  const eventType = event.type as string;
  const eventId = event.id as string;

  // 2. Replay protection — Stripe events have a created timestamp
  if (event.created && !isWithinReplayWindow(event.created * 1000)) {
    console.warn('[WebhookProcessor] Stripe webhook replay detected:', { eventId, created: event.created });
    await recordWebhook({
      eventId,
      eventType: `${eventType}_replay_rejected`,
      provider: 'stripe',
      payload: body,
      signature,
      processed: false,
      processingError: `Replay detected: event created_at ${event.created} is outside 5-minute window`,
    }).catch(() => {});

    return { success: false, error: 'Replay detected', eventType, eventId };
  }

  // 3. Idempotency check
  const existingWebhook = await db.paymentWebhook.findUnique({
    where: { eventId },
  });

  if (existingWebhook) {
    return {
      success: true,
      alreadyProcessed: true,
      eventType,
      eventId,
      paymentActivated: existingWebhook.processed,
    };
  }

  // 4. Record the webhook (initially as unprocessed)
  let paymentOrderId: string | undefined;

  // Try to extract payment order ID from metadata
  const metadata = event.data?.object?.metadata || {};
  const orderId = metadata.orderId || metadata.order_id;

  if (orderId) {
    const order = await db.paymentOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    paymentOrderId = order?.id;
  }

  const recordResult = await recordWebhook({
    eventId,
    eventType,
    provider: 'stripe',
    payload: body,
    signature,
    paymentOrderId,
    processed: false,
  });

  if (recordResult.alreadyExists) {
    return {
      success: true,
      alreadyProcessed: true,
      eventType,
      eventId,
    };
  }

  // 5. Process specific event types
  let paymentActivated = false;
  let processingError: string | undefined;

  try {
    switch (eventType) {
      case 'checkout.session.completed':
        paymentActivated = await handleStripeCheckoutCompleted(event);
        break;

      case 'invoice.payment_failed':
        await handleStripeInvoicePaymentFailed(event);
        break;

      case 'customer.subscription.deleted':
        await handleStripeSubscriptionDeleted(event);
        break;

      case 'invoice.payment_succeeded':
        paymentActivated = await handleStripeInvoicePaymentSucceeded(event);
        break;

      default:
        console.info('[WebhookProcessor] Unhandled Stripe event type:', eventType);
        break;
    }
  } catch (error) {
    processingError = error instanceof Error ? error.message : 'Unknown processing error';
    console.error('[WebhookProcessor] Stripe event processing error:', {
      eventType,
      eventId,
      error: processingError,
    });
  }

  // 6. Mark webhook as processed (or record error)
  try {
    await db.paymentWebhook.update({
      where: { eventId },
      data: {
        processed: !processingError,
        processingError: processingError || null,
        processedAt: new Date(),
        paymentOrderId: paymentOrderId || null,
      },
    });
  } catch (updateError) {
    console.error('[WebhookProcessor] Failed to update webhook record:', updateError);
  }

  // 7. Audit log
  if (paymentActivated) {
    try {
      const userId = await getUserIdFromStripeEvent(event);
      if (userId) {
        await logPaymentEvent(userId, 'payment_completed', {
          amount: (event.data?.object?.amount_total || event.data?.object?.amount_due || 0) / 100,
          currency: (event.data?.object?.currency || 'usd').toUpperCase(),
          provider: 'stripe',
          plan: 'pro',
          paymentOrderId,
        });
      }
    } catch {
      // Don't fail on audit logging errors
    }
  }

  return {
    success: !processingError,
    eventType,
    eventId,
    paymentActivated,
    error: processingError,
  };
}

// ===== RAZORPAY EVENT HANDLERS =====

/**
 * Handle Razorpay payment.captured event.
 * Activates the subscription after successful payment capture.
 * Uses atomic DB transaction for payment activation.
 */
async function handleRazorpayPaymentCaptured(payload: any): Promise<boolean> {
  const paymentEntity = payload.payload?.payment?.entity;
  if (!paymentEntity) {
    console.error('[WebhookProcessor] Razorpay payment.captured: missing payment entity');
    return false;
  }

  const razorpayOrderId = paymentEntity.order_id;
  const razorpayPaymentId = paymentEntity.id;

  if (!razorpayOrderId) {
    console.error('[WebhookProcessor] Razorpay payment.captured: missing order_id');
    return false;
  }

  // Find the payment order by provider order ID
  const order = await db.paymentOrder.findFirst({
    where: { providerOrderId: razorpayOrderId },
  });

  if (!order) {
    console.error('[WebhookProcessor] Razorpay payment.captured: order not found for', razorpayOrderId);
    return false;
  }

  if (order.status === 'completed') {
    console.info('[WebhookProcessor] Razorpay payment.captured: order already completed', order.id);
    return false; // Already processed
  }

  // Use atomic transaction to activate subscription
  try {
    const result = await confirmPaymentAndActivate(
      order.userId,
      order.id,
      razorpayPaymentId
    );

    if (!result.success) {
      console.error('[WebhookProcessor] Razorpay payment.captured: activation failed:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[WebhookProcessor] Razorpay payment.captured: activation error:', error);
    return false;
  }
}

/**
 * Handle Razorpay payment.failed event.
 * Updates the payment order status and logs the failure.
 */
async function handleRazorpayPaymentFailed(payload: any): Promise<void> {
  const paymentEntity = payload.payload?.payment?.entity;
  if (!paymentEntity) return;

  const razorpayOrderId = paymentEntity.order_id;
  if (!razorpayOrderId) return;

  const order = await db.paymentOrder.findFirst({
    where: { providerOrderId: razorpayOrderId },
  });

  if (!order || order.status === 'failed') return;

  // Update order status to failed
  await db.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: 'failed',
      providerPaymentId: paymentEntity.id,
    },
  });

  // Audit log
  await logPaymentEvent(order.userId, 'payment_failed', {
    amount: order.amount,
    currency: order.currency,
    provider: 'razorpay',
    plan: order.plan,
    paymentOrderId: order.id,
    reason: paymentEntity.error_description || 'Payment failed',
  }).catch(() => {});
}

/**
 * Handle Razorpay subscription.cancelled event.
 * Marks the subscription as canceled.
 */
async function handleRazorpaySubscriptionCancelled(payload: any): Promise<void> {
  const subscriptionEntity = payload.payload?.subscription?.entity;
  if (!subscriptionEntity) return;

  const razorpaySubId = subscriptionEntity.id;

  const subscription = await db.subscription.findFirst({
    where: { razorpaySubscriptionId: razorpaySubId },
  });

  if (!subscription) return;

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'canceled',
      cancelAtPeriodEnd: false,
    },
  });

  await logPaymentEvent(subscription.userId, 'payment_refunded', {
    amount: 0,
    currency: 'INR',
    provider: 'razorpay',
    plan: subscription.plan,
    paymentOrderId: undefined,
    reason: 'Subscription cancelled via Razorpay',
  }).catch(() => {});
}

/**
 * Handle Razorpay subscription.charged event.
 * Handles renewal payments for subscriptions.
 */
async function handleRazorpaySubscriptionCharged(payload: any): Promise<boolean> {
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const paymentEntity = payload.payload?.payment?.entity;

  if (!subscriptionEntity || !paymentEntity) return false;

  const razorpaySubId = subscriptionEntity.id;
  const razorpayPaymentId = paymentEntity.id;

  const subscription = await db.subscription.findFirst({
    where: { razorpaySubscriptionId: razorpaySubId },
  });

  if (!subscription) return false;

  // Renew the subscription — extend current period
  const now = new Date();
  const billingCycle = subscription.currentPeriodEnd && subscription.currentPeriodStart
    ? (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime() > 180 * 24 * 60 * 60 * 1000 ? 'yearly' : 'monthly')
    : 'monthly';

  const periodEnd = billingCycle === 'monthly'
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await db.$transaction(async (tx) => {
    // Update subscription period
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    // Find and update the associated payment order
    const order = await tx.paymentOrder.findFirst({
      where: {
        userId: subscription.userId,
        provider: 'razorpay',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (order) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          providerPaymentId: razorpayPaymentId,
        },
      });
    }
  });

  return true;
}

// ===== STRIPE EVENT HANDLERS =====

/**
 * Handle Stripe checkout.session.completed event.
 * Activates the subscription after successful checkout.
 */
async function handleStripeCheckoutCompleted(event: any): Promise<boolean> {
  const session = event.data?.object;
  if (!session) {
    console.error('[WebhookProcessor] Stripe checkout.session.completed: missing session object');
    return false;
  }

  // Get the order ID from session metadata
  const orderId = session.metadata?.orderId || session.metadata?.order_id;
  const paymentIntentId = session.payment_intent?.toString() || session.id;

  if (!orderId) {
    console.error('[WebhookProcessor] Stripe checkout.session.completed: missing orderId in metadata');
    return false;
  }

  const order = await db.paymentOrder.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    console.error('[WebhookProcessor] Stripe checkout.session.completed: order not found', orderId);
    return false;
  }

  if (order.status === 'completed') {
    console.info('[WebhookProcessor] Stripe checkout.session.completed: order already completed', orderId);
    return false;
  }

  // Use atomic transaction to activate subscription
  try {
    const result = await confirmPaymentAndActivate(
      order.userId,
      order.id,
      paymentIntentId
    );

    if (!result.success) {
      console.error('[WebhookProcessor] Stripe checkout.session.completed: activation failed:', result.error);
      return false;
    }

    // Update Stripe-specific fields on the subscription
    if (session.customer) {
      const sub = await db.subscription.findFirst({
        where: { userId: order.userId, status: 'active' },
      });
      if (sub) {
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            stripeCustomerId: session.customer.toString(),
            stripeSubscriptionId: session.subscription?.toString() || null,
          },
        });
      }
    }

    return true;
  } catch (error) {
    console.error('[WebhookProcessor] Stripe checkout.session.completed: activation error:', error);
    return false;
  }
}

/**
 * Handle Stripe invoice.payment_failed event.
 * Marks subscription as past_due.
 */
async function handleStripeInvoicePaymentFailed(event: any): Promise<void> {
  const invoice = event.data?.object;
  if (!invoice) return;

  const customerId = invoice.customer;
  if (!customerId) return;

  // Find subscription by Stripe customer ID
  const subscription = await db.subscription.findFirst({
    where: { stripeCustomerId: customerId.toString() },
  });

  if (!subscription) return;

  // Update subscription status to past_due
  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: 'past_due' },
  });

  // Find the related payment order
  const order = await db.paymentOrder.findFirst({
    where: {
      userId: subscription.userId,
      provider: 'stripe',
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (order) {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'failed' },
    });
  }

  await logPaymentEvent(subscription.userId, 'payment_failed', {
    amount: (invoice.amount_due || 0) / 100,
    currency: (invoice.currency || 'usd').toUpperCase(),
    provider: 'stripe',
    plan: subscription.plan,
    paymentOrderId: order?.id,
    reason: 'Stripe invoice payment failed',
  }).catch(() => {});
}

/**
 * Handle Stripe customer.subscription.deleted event.
 * Marks the subscription as expired.
 */
async function handleStripeSubscriptionDeleted(event: any): Promise<void> {
  const stripeSubscription = event.data?.object;
  if (!stripeSubscription) return;

  const subscription = await db.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription) return;

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'expired',
      cancelAtPeriodEnd: false,
    },
  });

  await logPaymentEvent(subscription.userId, 'payment_refunded', {
    amount: 0,
    currency: 'USD',
    provider: 'stripe',
    plan: subscription.plan,
    paymentOrderId: undefined,
    reason: 'Subscription deleted via Stripe',
  }).catch(() => {});
}

/**
 * Handle Stripe invoice.payment_succeeded event.
 * Handles renewal payments for subscriptions.
 */
async function handleStripeInvoicePaymentSucceeded(event: any): Promise<boolean> {
  const invoice = event.data?.object;
  if (!invoice) return false;

  // Only handle renewal invoices (not first payment)
  if (invoice.billing_reason === 'subscription_create') {
    // First payment — already handled by checkout.session.completed
    return false;
  }

  const customerId = invoice.customer;
  if (!customerId) return false;

  const subscription = await db.subscription.findFirst({
    where: { stripeCustomerId: customerId.toString() },
  });

  if (!subscription) return false;

  // Renew the subscription — extend current period
  const now = new Date();
  const billingCycle = subscription.currentPeriodEnd && subscription.currentPeriodStart
    ? (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime() > 180 * 24 * 60 * 60 * 1000 ? 'yearly' : 'monthly')
    : 'monthly';

  const periodEnd = billingCycle === 'monthly'
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await db.$transaction(async (tx) => {
    // Update subscription period
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    // Find and update pending payment order
    const order = await tx.paymentOrder.findFirst({
      where: {
        userId: subscription.userId,
        provider: 'stripe',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (order) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          providerPaymentId: invoice.payment_intent?.toString() || invoice.id,
        },
      });
    }
  });

  return true;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Constant-time string comparison to prevent timing attacks.
 * Compares two strings in a way that doesn't leak information about
 * the length or content of the expected value.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid leaking length info via timing
    const result = createHmac('sha256', a).update(b).digest('hex');
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Extract user ID from Razorpay payload by looking up the payment order.
 */
async function getUserIdFromPayload(payload: any): Promise<string | null> {
  const orderId = payload.payload?.payment?.entity?.order_id
    || payload.payload?.subscription?.entity?.id;

  if (!orderId) return null;

  const order = await db.paymentOrder.findFirst({
    where: { providerOrderId: orderId },
    select: { userId: true },
  });

  return order?.userId || null;
}

/**
 * Extract user ID from a Stripe event by looking up the customer ID.
 */
async function getUserIdFromStripeEvent(event: any): Promise<string | null> {
  const customerId = event.data?.object?.customer;
  if (!customerId) {
    // Try from metadata
    const orderId = event.data?.object?.metadata?.orderId;
    if (orderId) {
      const order = await db.paymentOrder.findUnique({
        where: { id: orderId },
        select: { userId: true },
      });
      return order?.userId || null;
    }
    return null;
  }

  const subscription = await db.subscription.findFirst({
    where: { stripeCustomerId: customerId.toString() },
    select: { userId: true },
  });

  return subscription?.userId || null;
}
