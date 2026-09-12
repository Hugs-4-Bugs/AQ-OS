// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Webhook Replay Service
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Stores webhook events in PaymentWebhook table, supports replay of
// failed webhooks, deduplication, manual replay, and batch replay.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export interface WebhookEventData {
  eventId: string;
  eventType: string;
  provider: 'stripe' | 'razorpay';
  payload: Record<string, unknown>;
  signature?: string;
  paymentOrderId?: string;
}

export interface ReplayResult {
  success: boolean;
  eventId?: string;
  processed?: boolean;
  error?: string;
}

export interface BatchReplayResult {
  total: number;
  replayed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
}

export interface WebhookReplayStatus {
  eventId: string;
  provider: string;
  eventType: string;
  processed: boolean;
  processingError: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  replayCount: number;
}

// ===== STORE WEBHOOK EVENT =====

export async function storeWebhookEvent(data: WebhookEventData): Promise<{
  success: boolean;
  isNew?: boolean;
  webhookId?: string;
  error?: string;
}> {
  try {
    // Check for deduplication
    const isDuplicate = await deduplicateWebhookEvent(data.eventId);
    if (isDuplicate) {
      return { success: true, isNew: false };
    }

    // Store the webhook event
    const webhook = await db.paymentWebhook.create({
      data: {
        paymentOrderId: data.paymentOrderId || null,
        provider: data.provider,
        eventId: data.eventId,
        eventType: data.eventType,
        payload: JSON.stringify(data.payload),
        signature: data.signature || null,
        processed: false,
      },
    });

    return { success: true, isNew: true, webhookId: webhook.id };
  } catch (error) {
    console.error('[WebhookReplay] Failed to store webhook event:', error);
    return { success: false, error: 'Failed to store webhook event' };
  }
}

// ===== DEDUPLICATE WEBHOOK EVENT =====

export async function deduplicateWebhookEvent(eventId: string): Promise<boolean> {
  try {
    const existing = await db.paymentWebhook.findUnique({
      where: { eventId },
      select: { id: true, processed: true },
    });

    return !!existing;
  } catch (error) {
    console.error('[WebhookReplay] Deduplication check failed:', error);
    return false; // On error, allow processing (fail open)
  }
}

// ===== MARK WEBHOOK PROCESSED =====

export async function markWebhookProcessed(eventId: string, error?: string): Promise<void> {
  try {
    const webhook = await db.paymentWebhook.findUnique({
      where: { eventId },
    });

    if (webhook) {
      await db.paymentWebhook.update({
        where: { id: webhook.id },
        data: {
          processed: !error,
          processingError: error || null,
          processedAt: new Date(),
        },
      });
    }
  } catch (err) {
    console.error('[WebhookReplay] Failed to mark webhook processed:', err);
  }
}

// ===== REPLAY SINGLE WEBHOOK =====

export async function replayWebhook(eventId: string): Promise<ReplayResult> {
  try {
    const webhook = await db.paymentWebhook.findUnique({
      where: { eventId },
    });

    if (!webhook) {
      return { success: false, eventId, error: 'Webhook event not found' };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(webhook.payload);
    } catch {
      return { success: false, eventId, error: 'Invalid webhook payload' };
    }

    // Process the webhook based on provider and event type
    let processed = false;
    let processingError: string | null = null;

    try {
      if (webhook.provider === 'stripe') {
        processed = await processStripeWebhookEvent(webhook.eventType, payload, webhook.paymentOrderId);
      } else if (webhook.provider === 'razorpay') {
        processed = await processRazorpayWebhookEvent(webhook.eventType, payload, webhook.paymentOrderId);
      } else {
        processingError = `Unknown provider: ${webhook.provider}`;
      }
    } catch (error) {
      processingError = error instanceof Error ? error.message : 'Processing failed';
      processed = false;
    }

    // Update webhook status
    await db.paymentWebhook.update({
      where: { id: webhook.id },
      data: {
        processed,
        processingError,
        processedAt: new Date(),
      },
    });

    // Log the replay
    await logBillingEvent({
      userId: 'system',
      action: 'payment_completed',
      details: `Webhook replay: ${eventId} — ${processed ? 'success' : 'failed'}`,
      metadata: {
        action: 'webhook_replay',
        eventId,
        eventType: webhook.eventType,
        provider: webhook.provider,
        processed,
        processingError,
      },
    });

    return {
      success: processed,
      eventId,
      processed,
      error: processingError || undefined,
    };
  } catch (error) {
    console.error('[WebhookReplay] Failed to replay webhook:', error);
    return { success: false, eventId, error: 'Failed to replay webhook' };
  }
}

// ===== REPLAY FAILED WEBHOOKS =====

export async function replayFailedWebhooks(options?: {
  provider?: 'stripe' | 'razorpay';
  limit?: number;
  eventType?: string;
  since?: Date;
}): Promise<BatchReplayResult> {
  try {
    const where: Record<string, unknown> = {
      processed: false,
    };

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.eventType) {
      where.eventType = options.eventType;
    }

    if (options?.since) {
      where.receivedAt = { gte: options.since };
    }

    const failedWebhooks = await db.paymentWebhook.findMany({
      where,
      orderBy: { receivedAt: 'asc' },
      take: options?.limit || 50,
    });

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ eventId: string; error: string }> = [];

    for (const webhook of failedWebhooks) {
      const result = await replayWebhook(webhook.eventId);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        errors.push({ eventId: webhook.eventId, error: result.error || 'Unknown error' });
      }
    }

    return {
      total: failedWebhooks.length,
      replayed: failedWebhooks.length,
      succeeded,
      failed,
      errors,
    };
  } catch (error) {
    console.error('[WebhookReplay] Failed to replay failed webhooks:', error);
    return { total: 0, replayed: 0, succeeded: 0, failed: 0, errors: [] };
  }
}

// ===== GET WEBHOOK REPLAY STATUS =====

export async function getWebhookReplayStatus(options?: {
  eventId?: string;
  provider?: 'stripe' | 'razorpay';
  processed?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  webhooks: WebhookReplayStatus[];
  total: number;
}> {
  try {
    const where: Record<string, unknown> = {};

    if (options?.eventId) {
      where.eventId = options.eventId;
    }

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.processed !== undefined) {
      where.processed = options.processed;
    }

    const [webhooks, total] = await Promise.all([
      db.paymentWebhook.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      db.paymentWebhook.count({ where }),
    ]);

    return {
      webhooks: webhooks.map((w) => ({
        eventId: w.eventId,
        provider: w.provider,
        eventType: w.eventType,
        processed: w.processed,
        processingError: w.processingError,
        receivedAt: w.receivedAt,
        processedAt: w.processedAt,
        replayCount: 0, // Could track this separately
      })),
      total,
    };
  } catch (error) {
    console.error('[WebhookReplay] Failed to get webhook replay status:', error);
    return { webhooks: [], total: 0 };
  }
}

// ===== PROCESS STRIPE WEBHOOK EVENT =====

async function processStripeWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
  paymentOrderId?: string | null
): Promise<boolean> {
  try {
    const data = payload.data as Record<string, unknown> | undefined;
    const object = data?.object as Record<string, unknown> | undefined;

    switch (eventType) {
      case 'checkout.session.completed': {
        const orderId = (object?.metadata as Record<string, unknown>)?.orderId as string || paymentOrderId;
        if (orderId) {
          const order = await db.paymentOrder.findUnique({ where: { id: orderId } });
          if (order && order.status === 'pending') {
            await db.paymentOrder.update({
              where: { id: orderId },
              data: {
                status: 'completed',
                providerPaymentId: (object?.payment_intent as string) || object?.id as string,
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const customerId = object?.customer as string;
        if (customerId) {
          const sub = await db.subscription.findFirst({
            where: { stripeCustomerId: customerId },
          });
          if (sub) {
            await db.subscription.update({
              where: { id: sub.id },
              data: {
                status: (object?.status as string) || sub.status,
                cancelAtPeriodEnd: (object?.cancel_at_period_end as boolean) || false,
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = object?.customer as string;
        if (customerId) {
          const sub = await db.subscription.findFirst({
            where: { stripeCustomerId: customerId },
          });
          if (sub) {
            await db.subscription.update({
              where: { id: sub.id },
              data: { status: 'expired' },
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const customerId = object?.customer as string;
        if (customerId) {
          const sub = await db.subscription.findFirst({
            where: { stripeCustomerId: customerId },
          });
          if (sub) {
            await db.subscription.update({
              where: { id: sub.id },
              data: { status: 'past_due' },
            });

            // Log the failure
            await logBillingEvent({
              userId: sub.userId,
              action: 'payment_failed',
              details: 'Stripe invoice payment failed',
              metadata: { subscriptionId: sub.id, customerId },
            });
          }
        }
        break;
      }

      default:
        // Unknown event type — no action needed
        break;
    }

    return true;
  } catch (error) {
    console.error('[WebhookReplay] Failed to process Stripe webhook event:', error);
    return false;
  }
}

// ===== PROCESS RAZORPAY WEBHOOK EVENT =====

async function processRazorpayWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
  paymentOrderId?: string | null
): Promise<boolean> {
  try {
    const paymentEntity = payload.payload?.payment?.entity as Record<string, unknown> | undefined
      || (payload as Record<string, unknown>).entity as Record<string, unknown> | undefined;

    switch (eventType) {
      case 'payment.captured': {
        const razorpayOrderId = paymentEntity?.order_id as string;
        if (razorpayOrderId) {
          const order = await db.paymentOrder.findFirst({
            where: { providerOrderId: razorpayOrderId },
          });
          if (order && order.status === 'pending') {
            await db.paymentOrder.update({
              where: { id: order.id },
              data: {
                status: 'completed',
                providerPaymentId: paymentEntity?.id as string,
              },
            });
          }
        }
        break;
      }

      case 'payment.failed': {
        const razorpayOrderId = paymentEntity?.order_id as string;
        if (razorpayOrderId) {
          const order = await db.paymentOrder.findFirst({
            where: { providerOrderId: razorpayOrderId },
          });
          if (order) {
            await db.paymentOrder.update({
              where: { id: order.id },
              data: { status: 'failed' },
            });

            await logBillingEvent({
              userId: order.userId,
              action: 'payment_failed',
              details: 'Razorpay payment failed',
              metadata: { orderId: order.id, error: paymentEntity?.error_description },
            });
          }
        }
        break;
      }

      case 'subscription.cancelled': {
        const subId = payload.subscription_id as string;
        if (subId) {
          const sub = await db.subscription.findFirst({
            where: { razorpaySubscriptionId: subId },
          });
          if (sub) {
            await db.subscription.update({
              where: { id: sub.id },
              data: { status: 'canceled' },
            });
          }
        }
        break;
      }

      default:
        break;
    }

    return true;
  } catch (error) {
    console.error('[WebhookReplay] Failed to process Razorpay webhook event:', error);
    return false;
  }
}

// ===== CLEANUP OLD WEBHOOKS =====

export async function cleanupOldWebhooks(olderThanDays: number = 90): Promise<{
  success: boolean;
  deleted: number;
}> {
  try {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await db.paymentWebhook.deleteMany({
      where: {
        processed: true,
        receivedAt: { lt: cutoff },
      },
    });

    return { success: true, deleted: result.count };
  } catch (error) {
    console.error('[WebhookReplay] Failed to cleanup old webhooks:', error);
    return { success: false, deleted: 0 };
  }
}
