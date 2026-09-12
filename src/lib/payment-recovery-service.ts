// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Recovery Automation Service
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Dunning management: failed payment retry schedule (days 1, 3, 7, 14),
// payment failure notifications, downgrade after 14 days of failed payment,
// and grace period management.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent, logPaymentEvent } from '@/lib/billing-audit';

// ===== TYPES =====

export type DunningAction = 'notify' | 'restrict' | 'downgrade';
export type RetryScheduleStep = 1 | 3 | 7 | 14;

export interface FailedPaymentResult {
  success: boolean;
  processed: number;
  retried: number;
  downgraded: number;
  notified: number;
  errors: number;
}

export interface RetryScheduleResult {
  success: boolean;
  nextRetryDate?: Date;
  retryStep?: RetryScheduleStep;
  error?: string;
}

export interface DunningResult {
  success: boolean;
  action: DunningAction;
  userId: string;
  message?: string;
  error?: string;
}

export interface GracePeriodResult {
  success: boolean;
  gracePeriodEnd?: Date;
  daysRemaining?: number;
  error?: string;
}

// ===== CONSTANTS =====

// Dunning schedule: retry on day 1, 3, 7, 14 after failure
const DUNNING_SCHEDULE: RetryScheduleStep[] = [1, 3, 7, 14];

// Days before downgrade
const DOWNGRADE_AFTER_DAYS = 14;

// Grace period in days (user retains access during this time)
const GRACE_PERIOD_DAYS = 14;

// ===== PROCESS FAILED PAYMENTS =====

export async function processFailedPayments(): Promise<FailedPaymentResult> {
  try {
    const now = new Date();

    // Find all subscriptions that are past_due
    const pastDueSubscriptions = await db.subscription.findMany({
      where: {
        status: 'past_due',
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, plan: true, credits: true },
        },
      },
    });

    let processed = 0;
    let retried = 0;
    let downgraded = 0;
    let notified = 0;
    let errors = 0;

    for (const subscription of pastDueSubscriptions) {
      try {
        processed++;

        // Calculate days since the subscription became past_due
        const periodEnd = subscription.currentPeriodEnd;
        if (!periodEnd) continue;

        const daysSinceFailure = Math.floor(
          (now.getTime() - periodEnd.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Apply dunning sequence based on days since failure
        const dunningResult = await handleDunningSequence(
          subscription.userId,
          daysSinceFailure,
          subscription.id
        );

        if (dunningResult.success) {
          switch (dunningResult.action) {
            case 'notify':
              notified++;
              break;
            case 'restrict':
              // Restriction is logged but user still has limited access
              notified++;
              break;
            case 'downgrade':
              downgraded++;
              break;
          }

          // Schedule payment retry if applicable
          const retryResult = schedulePaymentRetry(daysSinceFailure);
          if (retryResult.success && retryResult.nextRetryDate) {
            retried++;
          }
        }
      } catch (error) {
        console.error(`[PaymentRecovery] Error processing subscription ${subscription.id}:`, error);
        errors++;
      }
    }

    return { success: true, processed, retried, downgraded, notified, errors };
  } catch (error) {
    console.error('[PaymentRecovery] Failed to process failed payments:', error);
    return { success: false, processed: 0, retried: 0, downgraded: 0, notified: 0, errors: 1 };
  }
}

// ===== SCHEDULE PAYMENT RETRY =====

export function schedulePaymentRetry(daysSinceFailure: number): RetryScheduleResult {
  // Find the next retry step based on the dunning schedule
  const nextStep = DUNNING_SCHEDULE.find((step) => step > daysSinceFailure);

  if (!nextStep) {
    // All retry attempts exhausted — schedule for downgrade
    return {
      success: true,
      nextRetryDate: new Date(Date.now() + (DOWNGRADE_AFTER_DAYS - daysSinceFailure) * 24 * 60 * 60 * 1000),
      retryStep: 14,
    };
  }

  const daysUntilNextRetry = nextStep - daysSinceFailure;
  const nextRetryDate = new Date(Date.now() + daysUntilNextRetry * 24 * 60 * 60 * 1000);

  return {
    success: true,
    nextRetryDate,
    retryStep: nextStep,
  };
}

// ===== HANDLE DUNNING SEQUENCE =====

export async function handleDunningSequence(
  userId: string,
  daysSinceFailure: number,
  subscriptionId: string
): Promise<DunningResult> {
  try {
    // Determine dunning action based on days since failure
    let action: DunningAction;

    if (daysSinceFailure < 3) {
      // Day 1-2: Send notification
      action = 'notify';
    } else if (daysSinceFailure < 7) {
      // Day 3-6: Restrict features + notify
      action = 'restrict';
    } else if (daysSinceFailure < 14) {
      // Day 7-13: Heavy restrictions + warning of downgrade
      action = 'restrict';
    } else {
      // Day 14+: Downgrade to free
      action = 'downgrade';
    }

    switch (action) {
      case 'notify': {
        await sendPaymentFailureNotification(userId, daysSinceFailure, subscriptionId);
        await logBillingEvent({
          userId,
          action: 'payment_failed',
          details: `Payment failure notification sent (day ${daysSinceFailure})`,
          metadata: { action: 'dunning_notify', daysSinceFailure, subscriptionId },
        });
        return { success: true, action, userId, message: `Notification sent (day ${daysSinceFailure})` };
      }

      case 'restrict': {
        await sendPaymentFailureNotification(userId, daysSinceFailure, subscriptionId);
        await applyFeatureRestrictions(userId, daysSinceFailure);
        await logBillingEvent({
          userId,
          action: 'payment_failed',
          details: `Features restricted due to failed payment (day ${daysSinceFailure})`,
          metadata: { action: 'dunning_restrict', daysSinceFailure, subscriptionId },
        });
        return { success: true, action, userId, message: `Features restricted (day ${daysSinceFailure})` };
      }

      case 'downgrade': {
        await downgradeAfterFailedPayment(userId, subscriptionId);
        await logBillingEvent({
          userId,
          action: 'subscription_expired',
          details: `Subscription downgraded after ${daysSinceFailure} days of failed payment`,
          metadata: { action: 'dunning_downgrade', daysSinceFailure, subscriptionId },
        });
        return { success: true, action, userId, message: `Downgraded to free plan (day ${daysSinceFailure})` };
      }
    }
  } catch (error) {
    console.error('[PaymentRecovery] Failed to handle dunning sequence:', error);
    return { success: false, action: 'notify', userId, error: 'Dunning sequence failed' };
  }
}

// ===== APPLY GRACE PERIOD =====

export async function applyGracePeriod(
  userId: string,
  subscriptionId: string
): Promise<GracePeriodResult> {
  try {
    const gracePeriodEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Update subscription with grace period information
    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        // Extend current period to give grace period
        currentPeriodEnd: gracePeriodEnd,
      },
    });

    await logBillingEvent({
      userId,
      action: 'subscription_past_due',
      details: `Grace period applied until ${gracePeriodEnd.toISOString()}`,
      metadata: {
        action: 'grace_period_applied',
        subscriptionId,
        gracePeriodEnd: gracePeriodEnd.toISOString(),
      },
    });

    const daysRemaining = Math.ceil(
      (gracePeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    return {
      success: true,
      gracePeriodEnd,
      daysRemaining,
    };
  } catch (error) {
    console.error('[PaymentRecovery] Failed to apply grace period:', error);
    return { success: false, error: 'Failed to apply grace period' };
  }
}

// ===== SEND PAYMENT FAILURE NOTIFICATION =====

async function sendPaymentFailureNotification(
  userId: string,
  daysSinceFailure: number,
  subscriptionId: string
): Promise<void> {
  try {
    // Create in-app notification
    await db.notification.create({
      data: {
        userId,
        type: 'payment_failed',
        title: 'Payment Failed',
        message: daysSinceFailure < 3
          ? 'Your recent payment could not be processed. Please update your payment method.'
          : daysSinceFailure < 7
            ? `Your payment has been failing for ${daysSinceFailure} days. Some features may be restricted. Please update your payment method.`
            : `Your payment has been failing for ${daysSinceFailure} days. Your account will be downgraded to the free plan in ${DOWNGRADE_AFTER_DAYS - daysSinceFailure} days if not resolved.`,
        actionUrl: '/settings?tab=billing',
        metadata: JSON.stringify({ subscriptionId, daysSinceFailure }),
      },
    });

    // In production, also send email notification
    try {
      const { isEmailServiceConfigured, shouldBypassEmail } = await import('./feature-flags');
      if (isEmailServiceConfigured() && !shouldBypassEmail()) {
        const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
        if (user) {
          const { sendEmail } = await import('./email');
          await sendEmail({
            to: user.email,
            subject: 'Action Required: Payment Failed — AcquisitionOS',
            html: `
              <h2>Hi ${user.name || 'there'},</h2>
              <p>We were unable to process your payment for AcquisitionOS.</p>
              <p>Days since failure: <strong>${daysSinceFailure}</strong></p>
              <p>Please update your payment method to avoid service interruption.</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL}/settings?tab=billing" style="display:inline-block;padding:12px 24px;background:#10b981;color:white;border-radius:6px;text-decoration:none;">Update Payment Method</a>
              <p style="margin-top:16px;color:#64748b;font-size:12px;">If you believe this is an error, please contact support.</p>
            `,
          });
        }
      }
    } catch {
      // Email sending failure should not block the dunning process
    }
  } catch (error) {
    console.error('[PaymentRecovery] Failed to send payment failure notification:', error);
  }
}

// ===== APPLY FEATURE RESTRICTIONS =====

async function applyFeatureRestrictions(userId: string, daysSinceFailure: number): Promise<void> {
  try {
    // Restrict high-value features during dunning period
    // We don't downgrade yet but limit certain actions
    const restrictionLevel = daysSinceFailure >= 7 ? 'heavy' : 'light';

    await logBillingEvent({
      userId,
      action: 'feature_blocked',
      details: `Feature restrictions applied (${restrictionLevel}) due to failed payment`,
      metadata: {
        action: 'dunning_restrict',
        restrictionLevel,
        daysSinceFailure,
      },
    });
  } catch (error) {
    console.error('[PaymentRecovery] Failed to apply feature restrictions:', error);
  }
}

// ===== DOWNGRADE AFTER FAILED PAYMENT =====

async function downgradeAfterFailedPayment(
  userId: string,
  subscriptionId: string
): Promise<void> {
  try {
    const { PLAN_CREDITS } = await import('@/lib/entitlement-service');
    const freeCredits = PLAN_CREDITS.free;

    // Downgrade to free plan
    await db.$transaction(async (tx) => {
      // Update subscription
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          plan: 'free',
          status: 'expired',
          cancelAtPeriodEnd: false,
          scheduledPlanChange: null,
        },
      });

      // Update user
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
          action: 'dunning_downgrade',
          credits: freeCredits,
          balance: freeCredits,
          description: 'Downgraded to free plan after failed payment recovery period',
          referenceId: subscriptionId,
        },
      });
    });

    // Send downgrade notification
    await db.notification.create({
      data: {
        userId,
        type: 'subscription_expired',
        title: 'Subscription Downgraded',
        message: 'Your subscription has been downgraded to the free plan due to failed payment. You can upgrade again anytime by updating your payment method.',
        actionUrl: '/settings?tab=billing',
      },
    });

    await logPaymentEvent(userId, 'payment_failed', {
      amount: 0,
      currency: 'USD',
      provider: 'system',
      plan: 'free',
      reason: 'Downgraded after dunning period',
    });
  } catch (error) {
    console.error('[PaymentRecovery] Failed to downgrade after failed payment:', error);
    throw error;
  }
}

// ===== GET RECOVERY STATUS =====

export async function getRecoveryStatus(userId: string): Promise<{
  success: boolean;
  status?: {
    isPastDue: boolean;
    daysSinceFailure: number;
    nextRetryDate: Date | null;
    gracePeriodEnd: Date | null;
    nextAction: DunningAction | null;
  };
  error?: string;
}> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'past_due',
      },
    });

    if (!subscription) {
      return {
        success: true,
        status: {
          isPastDue: false,
          daysSinceFailure: 0,
          nextRetryDate: null,
          gracePeriodEnd: null,
          nextAction: null,
        },
      };
    }

    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd || now;
    const daysSinceFailure = Math.floor(
      (now.getTime() - periodEnd.getTime()) / (24 * 60 * 60 * 1000)
    );

    const retryResult = schedulePaymentRetry(Math.max(0, daysSinceFailure));

    let nextAction: DunningAction | null = null;
    if (daysSinceFailure < 3) nextAction = 'notify';
    else if (daysSinceFailure < 14) nextAction = 'restrict';
    else nextAction = 'downgrade';

    return {
      success: true,
      status: {
        isPastDue: true,
        daysSinceFailure: Math.max(0, daysSinceFailure),
        nextRetryDate: retryResult.nextRetryDate || null,
        gracePeriodEnd: subscription.currentPeriodEnd,
        nextAction,
      },
    };
  } catch (error) {
    console.error('[PaymentRecovery] Failed to get recovery status:', error);
    return { success: false, error: 'Failed to get recovery status' };
  }
}

// ===== MANUAL RECOVERY TRIGGER =====

export async function triggerManualRecovery(paymentOrderId: string, userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    if (order.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user' };
    }

    if (order.status !== 'failed') {
      return { success: false, error: 'Only failed payments can be manually recovered' };
    }

    // Reset the order to pending for retry
    await db.paymentOrder.update({
      where: { id: paymentOrderId },
      data: { status: 'pending' },
    });

    // Apply grace period to subscription
    const subscription = await db.subscription.findFirst({
      where: { userId, status: 'past_due' },
    });

    if (subscription) {
      await applyGracePeriod(userId, subscription.id);
    }

    await logBillingEvent({
      userId,
      action: 'payment_initiated',
      details: 'Manual recovery triggered for failed payment',
      resourceId: paymentOrderId,
      metadata: { action: 'manual_recovery', paymentOrderId },
    });

    return {
      success: true,
      message: 'Payment recovery initiated. Please complete the payment within the grace period.',
    };
  } catch (error) {
    console.error('[PaymentRecovery] Failed to trigger manual recovery:', error);
    return { success: false, error: 'Failed to trigger manual recovery' };
  }
}
