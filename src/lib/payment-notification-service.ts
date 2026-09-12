// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Notification Service
// Phase 5: Payments System (Hardened — Phase L7)
//
// Handles payment-related notifications across three channels:
//   1. Dashboard notifications (Notification DB records)
//   2. Activity feed (AuditLog entries)
//   3. Email (via existing SMTP/Resend infrastructure in email.ts)
//
// WhatsApp/Telegram delivery are future phases.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';
import { createModuleLogger } from '@/lib/observability/logger';

const notifLogger = createModuleLogger({ module: 'payment-notification' });
import { sendEmail, isEmailServiceConfigured } from '@/lib/email';

// ===== TYPES =====

export type PaymentNotificationType =
  | 'payment_success'
  | 'payment_failed'
  | 'payment_retry'
  | 'invoice_generated'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'subscription_past_due'
  | 'trial_ending'
  | 'trial_expired'
  | 'upgrade_completed'
  | 'downgrade_scheduled'
  | 'refund_processed'
  | 'chargeback_received'
  | 'credits_assigned'
  | 'credits_revoked';

export interface PaymentNotificationParams {
  userId: string;
  type: PaymentNotificationType;
  email: string;
  name?: string;
  plan?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  failureReason?: string;
  retryUrl?: string;
  trialEndsAt?: Date;
  scheduledPlan?: string;
  scheduledDate?: Date;
  refundAmount?: number;
  // Chargeback fields
  chargebackReason?: string;
  chargebackId?: string;
  // Credit fields
  creditsCount?: number;
  creditsNewBalance?: number;
  creditsSource?: string;
}

// ===== NOTIFICATION DISPATCHER =====

/**
 * Send a payment notification via email and in-app.
 * Email sending uses SMTP config from environment.
 * In-app notifications are stored in the Notification table.
 */
export async function sendPaymentNotification(
  params: PaymentNotificationParams
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Create in-app notification
    const inAppResult = await createInAppNotification(params);

    // 2. Queue email notification
    const emailResult = await queueEmailNotification(params);

    // 3. Log to billing audit (resource='billing')
    await logBillingEvent({
      userId: params.userId,
      action: `${params.type}_notification_sent` as any,
      details: `Payment notification sent: ${params.type}`,
      metadata: {
        type: params.type,
        email: params.email,
        inAppCreated: inAppResult,
        emailQueued: emailResult,
      },
    });

    // 4. Create activity feed entry (AuditLog with resource='payment_notification')
    //    This is separate from the billing audit — it appears in the user's activity feed
    try {
      await db.auditLog.create({
        data: {
          userId: params.userId,
          action: params.type,
          details: getNotificationContent(params).message,
          resource: 'payment_notification',
          metadata: JSON.stringify({
            type: params.type,
            plan: params.plan,
            amount: params.amount,
            currency: params.currency,
            invoiceNumber: params.invoiceNumber,
          }),
        },
      });
    } catch (auditError) {
      console.error('[PaymentNotification] Failed to create activity feed entry:', auditError);
      // Non-blocking — activity feed failure should not prevent notification delivery
    }

    return { success: true };
  } catch (error) {
    notifLogger.error('Failed to send notification', { error: error instanceof Error ? error.message : String(error), type: params.type });
    return { success: false, error: 'Failed to send notification' };
  }
}

// ===== IN-APP NOTIFICATION =====

async function createInAppNotification(
  params: PaymentNotificationParams
): Promise<boolean> {
  try {
    const { title, message, actionUrl } = getNotificationContent(params);

    await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title,
        message,
        actionUrl,
        deliveredVia: 'in_app',
        read: false,
      },
    });

    return true;
  } catch (error) {
    notifLogger.error('Failed to create in-app notification', { error: error instanceof Error ? error.message : String(error), type: params.type });
    return false;
  }
}

// ===== EMAIL NOTIFICATION QUEUE =====

async function queueEmailNotification(
  params: PaymentNotificationParams
): Promise<boolean> {
  try {
    const { title, message } = getNotificationContent(params);

    // Store email notification record in DB for audit trail
    await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title,
        message,
        deliveredVia: 'email',
        read: false,
        metadata: JSON.stringify({
          to: params.email,
          subject: title,
          body: message,
        }),
      },
    });

    // Attempt actual email delivery via the existing SMTP/Resend infrastructure
    if (isEmailServiceConfigured()) {
      try {
        const emailResult = await sendEmail({
          to: params.email,
          subject: title,
          html: buildPaymentEmailHtml(title, message, params),
          text: message,
        });

        if (emailResult.sent) {
          console.log(`[PaymentNotification] Email sent to ${params.email}: ${title}${emailResult.devMode ? ' (dev mode)' : ''}`);
        } else {
          console.error(`[PaymentNotification] Email delivery failed for ${params.email}: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.error('[PaymentNotification] Email delivery exception:', emailError);
        // Non-blocking — email failure should not prevent notification creation
      }
    } else {
      // No email provider configured — log for development
      console.log(`[PaymentNotification] No email provider configured. Email to ${params.email}: ${title}`);
    }

    return true;
  } catch (error) {
    notifLogger.error('Failed to queue email', { error: error instanceof Error ? error.message : String(error), email: params.email });
    return false;
  }
}

// ===== NOTIFICATION CONTENT =====

function getNotificationContent(params: PaymentNotificationParams): {
  title: string;
  message: string;
  actionUrl: string | null;
} {
  switch (params.type) {
    case 'payment_success':
      return {
        title: 'Payment Successful! 🎉',
        message: `Your payment of ${formatAmount(params.amount, params.currency)} for the ${params.plan} plan was successful. ${params.invoiceNumber ? `Invoice: ${params.invoiceNumber}` : ''}`,
        actionUrl: params.invoiceId ? `/billing/invoices/${params.invoiceId}` : '/billing',
      };

    case 'payment_failed':
      return {
        title: 'Payment Failed',
        message: `Your payment of ${formatAmount(params.amount, params.currency)} for the ${params.plan} plan failed. ${params.failureReason || 'Please check your payment method and try again.'}`,
        actionUrl: '/billing?retry=true',
      };

    case 'payment_retry':
      return {
        title: 'Payment Retry Available',
        message: `We were unable to process your payment. Please retry your payment to continue using the ${params.plan} plan.`,
        actionUrl: '/billing?retry=true',
      };

    case 'invoice_generated':
      return {
        title: 'Invoice Generated',
        message: `Invoice ${params.invoiceNumber} has been generated for your ${params.plan} plan subscription.`,
        actionUrl: params.invoiceId ? `/billing/invoices/${params.invoiceId}` : '/billing',
      };

    case 'subscription_renewed':
      return {
        title: 'Subscription Renewed',
        message: `Your ${params.plan} plan subscription has been renewed. ${params.invoiceNumber ? `Invoice: ${params.invoiceNumber}` : ''}`,
        actionUrl: '/billing',
      };

    case 'subscription_cancelled':
      return {
        title: 'Subscription Cancelled',
        message: `Your ${params.plan} plan subscription has been cancelled. You can continue using it until the end of your current billing period.`,
        actionUrl: '/billing',
      };

    case 'subscription_past_due':
      return {
        title: 'Payment Overdue',
        message: `Your ${params.plan} plan subscription payment is overdue. Please update your payment method to avoid service interruption.`,
        actionUrl: '/billing?retry=true',
      };

    case 'trial_ending':
      return {
        title: 'Trial Ending Soon',
        message: `Your trial of the ${params.plan} plan ends ${params.trialEndsAt ? `on ${params.trialEndsAt.toLocaleDateString()}` : 'soon'}. Upgrade now to keep access to all features.`,
        actionUrl: '/billing?upgrade=true',
      };

    case 'trial_expired':
      return {
        title: 'Trial Expired',
        message: `Your trial of the ${params.plan} plan has expired. Upgrade now to regain access to premium features.`,
        actionUrl: '/billing?upgrade=true',
      };

    case 'upgrade_completed':
      return {
        title: 'Upgrade Complete! 🚀',
        message: `You've been upgraded to the ${params.plan} plan. Enjoy your new features!`,
        actionUrl: '/dashboard',
      };

    case 'downgrade_scheduled':
      return {
        title: 'Downgrade Scheduled',
        message: `Your subscription will be downgraded to the ${params.scheduledPlan} plan on ${params.scheduledDate?.toLocaleDateString() || 'your next billing date'}. You can continue using your current plan until then.`,
        actionUrl: '/billing',
      };

    case 'refund_processed':
      return {
        title: 'Refund Processed',
        message: `A refund of ${formatAmount(params.refundAmount, params.currency)} has been processed for your ${params.plan} plan. It may take 5-7 business days to reflect in your account.`,
        actionUrl: '/billing',
      };

    case 'chargeback_received':
      return {
        title: 'Chargeback Received',
        message: `A chargeback of ${formatAmount(params.amount, params.currency)} has been received for your ${params.plan} plan.${params.chargebackReason ? ` Reason: ${params.chargebackReason}.` : ''} Your account may be reviewed. Please contact support if you have questions.`,
        actionUrl: '/billing',
      };

    case 'credits_assigned':
      return {
        title: 'Credits Added',
        message: `${params.creditsCount ?? 0} credits have been added to your account from ${params.creditsSource || 'system'}.${params.creditsNewBalance !== undefined ? ` Your new balance is ${params.creditsNewBalance} credits.` : ''}`,
        actionUrl: '/dashboard',
      };

    case 'credits_revoked':
      return {
        title: 'Credits Revoked',
        message: `${params.creditsCount ?? 0} credits have been removed from your account.${params.creditsSource ? ` Reason: ${params.creditsSource}.` : ''}${params.creditsNewBalance !== undefined ? ` Your new balance is ${params.creditsNewBalance} credits.` : ''}`,
        actionUrl: '/billing',
      };

    default:
      return {
        title: 'Billing Update',
        message: 'There is an update to your billing. Please check your billing page for details.',
        actionUrl: '/billing',
      };
  }
}

// ===== HELPERS =====

function formatAmount(amount?: number, currency?: string): string {
  if (amount === undefined || amount === null) return 'N/A';
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  return `${currency || ''}${amount}`;
}

// ===== EMAIL HTML BUILDER =====

/**
 * Build an HTML email body for payment notifications.
 * Uses a simple, clean template consistent with the AcquisitionOS brand.
 */
function buildPaymentEmailHtml(
  title: string,
  message: string,
  params: PaymentNotificationParams
): string {
  const actionUrl = getNotificationContent(params).actionUrl || '/billing';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.acquisitionos.com';
  const fullActionUrl = actionUrl.startsWith('http') ? actionUrl : `${appUrl}${actionUrl}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtmlSimple(title)}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #f0fdfa; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; }
    .body { padding: 40px; }
    .body p { margin: 0 0 16px; font-size: 15px; line-height: 22px; color: #1e293b; }
    .body .name { font-weight: 600; }
    .cta { display: inline-block; background: linear-gradient(135deg, #0d9488, #0f766e); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 36px; border-radius: 8px; margin: 16px 0; }
    .footer { max-width: 560px; margin: 16px auto; text-align: center; font-size: 12px; color: #64748b; padding: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>AcquisitionOS</h1></div>
    <div class="body">
      ${params.name ? `<p>Hi <span class="name">${escapeHtmlSimple(params.name)}</span>,</p>` : ''}
      <p>${escapeHtmlSimple(message)}</p>
      <a href="${escapeHtmlSimple(fullActionUrl)}" class="cta">View Details</a>
    </div>
  </div>
  <div class="footer">
    &copy; ${new Date().getFullYear()} AcquisitionOS, Inc. All rights reserved.<br />
    This is an automated message — please do not reply directly.
  </div>
</body>
</html>`;
}

function escapeHtmlSimple(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== TRIAL REMINDER SCHEDULER =====

/**
 * Check for trials ending in 3 days and send reminders.
 * Should be called by a cron job daily.
 */
export async function sendTrialEndingReminders(): Promise<{
  checked: number;
  reminded: number;
  errors: number;
}> {
  try {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    // Find users whose trials end within 3-5 days
    const usersWithEndingTrials = await db.user.findMany({
      where: {
        isTrial: true,
        trialEndsAt: {
          gte: threeDaysFromNow,
          lte: fiveDaysFromNow,
        },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        trialEndsAt: true,
      },
    });

    let reminded = 0;
    let errors = 0;

    for (const user of usersWithEndingTrials) {
      try {
        // Check if we already sent a reminder recently (within 24 hours)
        const recentReminder = await db.notification.findFirst({
          where: {
            userId: user.id,
            type: 'trial_ending',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        });

        if (recentReminder) continue; // Already reminded recently

        await sendPaymentNotification({
          userId: user.id,
          type: 'trial_ending',
          email: user.email,
          name: user.name || undefined,
          plan: user.plan,
          trialEndsAt: user.trialEndsAt || undefined,
        });

        reminded++;
      } catch (error) {
        notifLogger.error(`Trial reminder failed for user ${user.id}`, { error: error instanceof Error ? error.message : String(error), userId: user.id });
        errors++;
      }
    }

    return {
      checked: usersWithEndingTrials.length,
      reminded,
      errors,
    };
  } catch (error) {
    notifLogger.error('Failed to send trial ending reminders', { error: error instanceof Error ? error.message : String(error) });
    return { checked: 0, reminded: 0, errors: 1 };
  }
}

/**
 * Check for past-due subscriptions and send payment reminders.
 * Should be called by a cron job daily.
 */
export async function sendPastDueReminders(): Promise<{
  checked: number;
  reminded: number;
  errors: number;
}> {
  try {
    const pastDueSubscriptions = await db.subscription.findMany({
      where: {
        status: 'past_due',
      },
      select: {
        id: true,
        userId: true,
        plan: true,
      },
    });

    let reminded = 0;
    let errors = 0;

    for (const sub of pastDueSubscriptions) {
      try {
        const user = await db.user.findUnique({
          where: { id: sub.userId },
          select: { id: true, email: true, name: true },
        });

        if (!user) continue;

        // Check if we already sent a reminder recently
        const recentReminder = await db.notification.findFirst({
          where: {
            userId: user.id,
            type: 'subscription_past_due',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        });

        if (recentReminder) continue;

        await sendPaymentNotification({
          userId: user.id,
          type: 'subscription_past_due',
          email: user.email,
          name: user.name || undefined,
          plan: sub.plan,
        });

        reminded++;
      } catch (error) {
        notifLogger.error(`Past-due reminder failed for subscription ${sub.id}`, { error: error instanceof Error ? error.message : String(error), subscriptionId: sub.id });
        errors++;
      }
    }

    return {
      checked: pastDueSubscriptions.length,
      reminded,
      errors,
    };
  } catch (error) {
    notifLogger.error('Failed to send past-due reminders', { error: error instanceof Error ? error.message : String(error) });
    return { checked: 0, reminded: 0, errors: 1 };
  }
}
