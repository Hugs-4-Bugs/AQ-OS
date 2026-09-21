// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Notification Service
// Helper functions for creating notifications from other API routes
// and system processes.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { publishEvent } from '@/lib/realtime-event-bus';

// ---------------------------------------------------------------------------
// Real-time delivery (SSE)
// ---------------------------------------------------------------------------

/**
 * Publish a freshly-created notification row to the `notification_events`
 * channel of the realtime event bus so any connected SSE client
 * (GET /api/events/notifications) receives it instantly, without waiting
 * for the 30s polling fallback.
 *
 * Fire-and-forget by design: real-time delivery must never break the
 * caller's flow, and the DB row is already persisted at this point.
 */
export function publishNotificationCreated(notification: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string | null;
  metadata?: string | null;
  createdAt: Date;
}): void {
  publishEvent({
    channel: 'notification_events',
    eventType: 'notification_created',
    payload: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      actionUrl: notification.actionUrl ?? null,
      metadata: notification.metadata ?? null,
      createdAt: notification.createdAt,
    },
    userId: notification.userId,
  }).catch(() => {
    // Swallow — SSE delivery is best-effort; polling is the fallback.
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  // CRM & Lead notifications
  | 'deal_won'
  | 'lead_reply'
  | 'analysis'
  | 'stage_advanced'
  // Payment notifications
  | 'payment_success'
  | 'payment_failure'
  | 'refund_processed'
  | 'chargeback_received'
  // Subscription notifications
  | 'subscription_renewed'
  | 'subscription_cancelling'
  | 'subscription_expired'
  // Credit notifications
  | 'credit_assigned'
  | 'credit_low'
  // General notifications
  | 'payment'
  | 'team_invite'
  | 'system';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  deliveredVia?: 'in_app' | 'telegram' | 'whatsapp' | 'email';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_NOTIFICATION_TYPES = new Set<NotificationType>([
  // CRM & Lead
  'deal_won',
  'lead_reply',
  'analysis',
  'stage_advanced',
  // Payment
  'payment_success',
  'payment_failure',
  'refund_processed',
  'chargeback_received',
  // Subscription
  'subscription_renewed',
  'subscription_cancelling',
  'subscription_expired',
  // Credit
  'credit_assigned',
  'credit_low',
  // General
  'payment',
  'team_invite',
  'system',
]);

// ---------------------------------------------------------------------------
// Core function: createNotification
// ---------------------------------------------------------------------------

/**
 * Create a notification for a user.
 *
 * This is the primary function to be called from other API routes and
 * server-side processes when an event warrants a notification.
 *
 * @example
 * ```ts
 * import { createNotification } from '@/lib/notification-service';
 *
 * // When a deal is won
 * await createNotification({
 *   userId: deal.userId,
 *   type: 'deal_won',
 *   title: 'Deal Closed!',
 *   message: `${deal.name} — $${deal.value} acquisition deal`,
 *   actionUrl: `/deals/${deal.id}`,
 *   metadata: { dealId: deal.id, value: deal.value },
 * });
 * ```
 */
export async function createNotification(params: CreateNotificationParams) {
  const { userId, type, title, message, actionUrl, metadata, deliveredVia } = params;

  // Validate notification type
  if (!VALID_NOTIFICATION_TYPES.has(type as NotificationType)) {
    console.warn(
      `[notification-service] Unknown notification type "${type}". ` +
      `Valid types: ${[...VALID_NOTIFICATION_TYPES].join(', ')}. Creating anyway.`,
    );
  }

  try {
    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        actionUrl: actionUrl || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        deliveredVia: deliveredVia || 'in_app',
      },
    });

    // Real-time: push to SSE subscribers (fire-and-forget, best-effort).
    publishNotificationCreated(notification);

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
    };
  } catch (error) {
    console.error('[notification-service] Failed to create notification:', error);
    // Don't throw — notification creation should never break the caller's flow
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deduplicated creation (idempotency for retried background jobs)
// ---------------------------------------------------------------------------

/**
 * Create a notification at most once per `dedupeKey` within an optional
 * time window. Used by event producers that may legitimately re-run for the
 * same underlying event (workflow replay/retry, discovery re-poll, recurring
 * credit-threshold checks) so one event never yields duplicate notifications.
 *
 * The dedupe key is embedded in the row's metadata as
 * `"dedupeKey":"<key>"` and looked up with a `contains` match, which keeps
 * the implementation schema-neutral (no new column / migration required).
 *
 * Returns the existing row when a duplicate is detected (`duplicate: true`),
 * or `{ duplicate: false, id }` for a freshly created notification.
 */
export async function createNotificationOnce(
  params: CreateNotificationParams & {
    dedupeKey?: string;
    dedupeWindowMinutes?: number;
  },
): Promise<{ id: string | null; duplicate: boolean }> {
  const { dedupeKey, dedupeWindowMinutes, ...rest } = params;

  if (dedupeKey) {
    try {
      const existing = await db.notification.findFirst({
        where: {
          userId: rest.userId,
          metadata: { contains: `"dedupeKey":"${dedupeKey}"` },
          ...(dedupeWindowMinutes
            ? { createdAt: { gte: new Date(Date.now() - dedupeWindowMinutes * 60 * 1000) } }
            : {}),
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return { id: existing.id, duplicate: true };
      }
    } catch (error) {
      // Lookup failure must never block notification creation.
      console.error('[notification-service] dedupe lookup failed:', error);
    }
  }

  const metadata: Record<string, unknown> = { ...(rest.metadata || {}) };
  if (dedupeKey) metadata.dedupeKey = dedupeKey;

  const created = await createNotification({ ...rest, metadata });
  return { id: created?.id ?? null, duplicate: false };
}

// ---------------------------------------------------------------------------
// Convenience function: notifyUser
// ---------------------------------------------------------------------------

/**
 * Simplified helper to quickly send a notification to a user.
 *
 * @example
 * ```ts
 * import { notifyUser } from '@/lib/notification-service';
 *
 * await notifyUser(user.id, 'lead_reply', 'New Reply', 'John Doe replied to your email');
 * ```
 */
export async function notifyUser(
  userId: string,
  type: NotificationType | string,
  title: string,
  message: string,
  actionUrl?: string,
) {
  return createNotification({
    userId,
    type,
    title,
    message,
    actionUrl,
  });
}

// ---------------------------------------------------------------------------
// Batch function: notifyUsers
// ---------------------------------------------------------------------------

/**
 * Send the same notification to multiple users (e.g., team members).
 * Uses Promise.allSettled so a single failure doesn't block the rest.
 *
 * @example
 * ```ts
 * import { notifyUsers } from '@/lib/notification-service';
 *
 * await notifyUsers(
 *   [user1.id, user2.id, user3.id],
 *   'system',
 *   'Maintenance Scheduled',
 *   'System maintenance on May 20 at 2:00 AM UTC',
 * );
 * ```
 */
export async function notifyUsers(
  userIds: string[],
  type: NotificationType | string,
  title: string,
  message: string,
  actionUrl?: string,
) {
  const results = await Promise.allSettled(
    userIds.map((userId) =>
      createNotification({ userId, type, title, message, actionUrl }),
    ),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
  const failed = results.length - succeeded;

  if (failed > 0) {
    console.warn(
      `[notification-service] notifyUsers: ${failed}/${results.length} notifications failed`,
    );
  }

  return { total: results.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get the unread notification count for a user.
 * Useful for displaying badge counts without fetching all notifications.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: { userId, read: false },
  });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Payment notification helpers
// ---------------------------------------------------------------------------

/**
 * Notify user of successful payment.
 * Creates an in-app notification record. Email delivery would be triggered
 * when SMTP is configured.
 */
export async function notifyPaymentSuccess(params: {
  userId: string;
  plan: string;
  amount: number;
  currency?: string;
  creditsAdded?: number;
  invoiceNumber?: string;
  isRenewal?: boolean;
  orderId?: string;
}) {
  const { userId, plan, amount, currency = 'usd', creditsAdded, invoiceNumber, isRenewal, orderId } = params;
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  const title = isRenewal ? 'Renewal Payment Successful' : 'Payment Successful';
  const message = isRenewal
    ? `Your ${plan} plan subscription has been renewed. ${formattedAmount} has been charged.${creditsAdded ? ` ${creditsAdded} credits reset for the new billing period.` : ''}`
    : `Your ${plan} plan subscription is now active! ${formattedAmount} charged.${creditsAdded ? ` ${creditsAdded} credits have been added.` : ''}`;

  return createNotification({
    userId,
    type: 'payment_success',
    title,
    message,
    actionUrl: '/dashboard',
    metadata: {
      amount,
      currency,
      plan,
      creditsAdded: creditsAdded ?? null,
      invoiceNumber: invoiceNumber ?? null,
      isRenewal: isRenewal ?? false,
      orderId: orderId ?? null,
    },
  });
}

/**
 * Notify user of payment failure.
 */
export async function notifyPaymentFailure(params: {
  userId: string;
  plan: string;
  reason?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
}) {
  const { userId, plan, reason, amount, currency = 'usd', invoiceNumber } = params;
  const formattedAmount = amount
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
    : null;

  const message = reason === 'Checkout session expired'
    ? `Your checkout session for the ${plan} plan has expired. Please try again.`
    : `We were unable to process your ${plan} plan payment.${formattedAmount ? ` Amount: ${formattedAmount}.` : ''} Please update your payment method to avoid service interruption.`;

  return createNotification({
    userId,
    type: 'payment_failure',
    title: 'Payment Failed',
    message,
    actionUrl: '/dashboard',
    metadata: {
      plan,
      reason: reason ?? null,
      amount: amount ?? null,
      currency,
      invoiceNumber: invoiceNumber ?? null,
    },
  });
}

/**
 * Notify user of a subscription renewal.
 */
export async function notifySubscriptionRenewed(params: {
  userId: string;
  plan: string;
  amount?: number;
  currency?: string;
  creditsReset?: number;
  nextBillingDate?: string;
  invoiceNumber?: string;
}) {
  const { userId, plan, amount, currency = 'usd', creditsReset, nextBillingDate, invoiceNumber } = params;
  const formattedAmount = amount
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
    : null;

  const message = `Your ${plan} plan subscription has been renewed.${formattedAmount ? ` ${formattedAmount} charged.` : ''}${creditsReset ? ` ${creditsReset} credits available for the new billing period.` : ''}${nextBillingDate ? ` Next billing date: ${nextBillingDate}.` : ''}`;

  return createNotification({
    userId,
    type: 'subscription_renewed',
    title: 'Subscription Renewed',
    message,
    actionUrl: '/dashboard',
    metadata: {
      plan,
      amount: amount ?? null,
      currency,
      creditsReset: creditsReset ?? null,
      nextBillingDate: nextBillingDate ?? null,
      invoiceNumber: invoiceNumber ?? null,
    },
  });
}

/**
 * Notify user of a refund processed.
 */
export async function notifyRefundProcessed(params: {
  userId: string;
  plan: string;
  refundAmount: number;
  currency?: string;
  isFullRefund: boolean;
  orderId?: string;
}) {
  const { userId, plan, refundAmount, currency = 'usd', isFullRefund, orderId } = params;
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(refundAmount);

  const message = isFullRefund
    ? `A full refund of ${formattedAmount} has been processed for your ${plan} plan subscription. Your account has been downgraded to the free plan.`
    : `A partial refund of ${formattedAmount} has been processed for your ${plan} plan.`;

  return createNotification({
    userId,
    type: 'refund_processed',
    title: 'Refund Processed',
    message,
    actionUrl: '/dashboard',
    metadata: {
      plan,
      refundAmount,
      currency,
      isFullRefund,
      orderId: orderId ?? null,
    },
  });
}

/**
 * Notify user of a chargeback received.
 */
export async function notifyChargebackReceived(params: {
  userId: string;
  plan: string;
  amount: number;
  currency?: string;
  reason?: string;
  chargebackId?: string;
}) {
  const { userId, plan, amount, currency = 'usd', reason, chargebackId } = params;
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const message = `A chargeback of ${formattedAmount} has been received for your ${plan} plan subscription.${reason ? ` Reason: ${reason}.` : ''} Your account may be reviewed. Please contact support if you have questions.`;

  return createNotification({
    userId,
    type: 'chargeback_received',
    title: 'Chargeback Received',
    message,
    actionUrl: '/dashboard',
    metadata: {
      plan,
      amount,
      currency,
      reason: reason ?? null,
      chargebackId: chargebackId ?? null,
    },
  });
}

/**
 * Notify user of credits being added to their account.
 */
export async function notifyCreditAssigned(params: {
  userId: string;
  credits: number;
  newBalance: number;
  source: string;
  description?: string;
}) {
  const { userId, credits, newBalance, source, description } = params;

  const message = `${credits} credits have been added to your account from ${source}. Your new balance is ${newBalance} credits.${description ? ` ${description}` : ''}`;

  return createNotification({
    userId,
    type: 'credit_assigned',
    title: 'Credits Added',
    message,
    actionUrl: '/dashboard',
    metadata: {
      credits,
      newBalance,
      source,
      description: description ?? null,
    },
  });
}

/**
 * Notify user of credits running low.
 */
export async function notifyCreditLow(params: {
  userId: string;
  currentCredits: number;
  monthlyCredits: number;
  plan: string;
  usagePercent?: number;
}) {
  const { userId, currentCredits, monthlyCredits, plan, usagePercent } = params;
  const pct = usagePercent ?? Math.round(((monthlyCredits - currentCredits) / monthlyCredits) * 100);

  const message = `You're running low on credits. ${currentCredits} of ${monthlyCredits} credits remaining on your ${plan} plan (${pct}% used). Consider upgrading for more credits.`;

  return createNotification({
    userId,
    type: 'credit_low',
    title: 'Credits Running Low',
    message,
    actionUrl: '/dashboard',
    metadata: {
      currentCredits,
      monthlyCredits,
      plan,
      usagePercent: pct,
    },
  });
}

/**
 * Notify user that their subscription is scheduled for cancellation (cancel_at_period_end).
 */
export async function notifySubscriptionCancelling(params: {
  userId: string;
  plan: string;
  endDate: string;
}) {
  const { userId, plan, endDate } = params;

  const message = `Your ${plan} plan subscription is scheduled to cancel on ${endDate}. You can reactivate it anytime before then to keep your current plan and data.`;

  return createNotification({
    userId,
    type: 'subscription_cancelling',
    title: 'Subscription Cancellation Scheduled',
    message,
    actionUrl: '/dashboard',
    metadata: {
      plan,
      endDate,
    },
  });
}

/**
 * Notify user that their subscription has expired.
 */
export async function notifySubscriptionExpired(params: {
  userId: string;
  previousPlan: string;
  reason?: string;
}) {
  const { userId, previousPlan, reason } = params;

  const message = `Your ${previousPlan} plan subscription has expired. Your account has been downgraded to the free plan.${reason === 'chargeback' ? ' This was due to a chargeback.' : reason ? ` Reason: ${reason}.` : ''}`;

  return createNotification({
    userId,
    type: 'subscription_expired',
    title: 'Subscription Expired',
    message,
    actionUrl: '/dashboard',
    metadata: {
      previousPlan,
      reason: reason ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Clean up old notifications for a user (e.g., older than 90 days, already read).
 */
export async function cleanupOldNotifications(
  userId: string,
  olderThanDays: number = 90,
): Promise<number> {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await db.notification.deleteMany({
    where: {
      userId,
      read: true,
      createdAt: { lt: cutoffDate },
    },
  });

  return result.count;
}
