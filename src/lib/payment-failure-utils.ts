// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Payment Failure Handling Utilities
// Maps Stripe error codes to human-readable messages, tracks
// consecutive payment failures, and sends failure notifications.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logBillingEvent } from '@/lib/billing-audit';
import { sendEmail } from '@/lib/email';

// ===== STRIPE ERROR CODE → HUMAN MESSAGE MAPPING =====

export const STRIPE_ERROR_MESSAGES: Record<string, string> = {
  card_declined: 'Your card was declined. Please try a different card.',
  insufficient_funds: 'Insufficient funds. Please use a different card.',
  incorrect_cvc: 'Incorrect CVC code. Please check and try again.',
  expired_card: 'Your card has expired. Please update your card details.',
  processing_error: 'Payment processing error. Please try again in a moment.',
  card_velocity_exceeded: 'Too many attempts. Please wait 24 hours or use a different card.',
  do_not_honor: 'Your bank declined this payment. Please contact your bank or use a different card.',
  generic_decline: 'Payment declined. Please try a different payment method.',
  authentication_required: 'Your bank requires additional authentication. Please complete the verification.',
  incorrect_number: 'Incorrect card number. Please check and try again.',
  invalid_expiry_month: 'Invalid expiration month.',
  invalid_expiry_year: 'Invalid expiration year.',
  invalid_cvc: 'Invalid CVC code.',
  incorrect_zip: 'ZIP code verification failed. Please check your billing address.',
  charge_disputed: 'This charge has been disputed. Please contact support.',
  balance_insufficient: 'Insufficient balance on the payment method.',
  withdrawal_exceeded: 'Withdrawal limit exceeded. Please use a different payment method.',
  lost_card: 'This card has been reported lost. Please use a different card.',
  stolen_card: 'This card has been reported stolen. Please use a different card.',
};

/**
 * Map a Stripe error code to a human-readable message.
 * Falls back to a generic message if the code is unknown.
 */
export function getStripeErrorMessage(errorCode: string | undefined | null): string {
  if (!errorCode) return 'An unexpected payment error occurred. Please try again.';
  return STRIPE_ERROR_MESSAGES[errorCode] || `Payment failed: ${errorCode}. Please try a different payment method.`;
}

/**
 * Extract Stripe error code from a Stripe error object or string.
 */
export function extractStripeErrorCode(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    // Stripe SDK error structure
    if (err.code && typeof err.code === 'string') return err.code as string;
    if (err.decline_code && typeof err.decline_code === 'string') return err.decline_code as string;
    if (err.type && typeof err.type === 'string') return err.type as string;
    // Nested error
    if (err.error && typeof err.error === 'object') {
      const nested = err.error as Record<string, unknown>;
      if (nested.code && typeof nested.code === 'string') return nested.code as string;
      if (nested.decline_code && typeof nested.decline_code === 'string') return nested.decline_code as string;
    }
  }
  return null;
}

// ===== CONSECUTIVE FAILURE TRACKING =====

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Track a payment failure for a user.
 * Returns the current consecutive failure count.
 * Sends an in-app notification if threshold is reached.
 */
export async function trackPaymentFailure(
  userId: string,
  errorCode: string | null,
  last4: string | null
): Promise<{ consecutiveCount: number; thresholdReached: boolean }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        consecutivePaymentFailures: true,
        lastPaymentFailureAt: true,
      },
    });

    if (!user) return { consecutiveCount: 0, thresholdReached: false };

    const now = new Date();
    const lastFailure = user.lastPaymentFailureAt;

    // Reset count if last failure was more than 1 hour ago
    let newCount = 1;
    if (lastFailure && (now.getTime() - lastFailure.getTime()) < FAILURE_WINDOW_MS) {
      newCount = user.consecutivePaymentFailures + 1;
    }

    await db.user.update({
      where: { id: userId },
      data: {
        consecutivePaymentFailures: newCount,
        lastPaymentFailureAt: now,
      },
    });

    // Log the failed attempt
    await logBillingEvent({
      userId,
      action: 'payment_declined',
      details: `Payment declined (attempt ${newCount})`,
      metadata: {
        errorCode: errorCode || 'unknown',
        last4: last4 || 'unknown',
        consecutiveCount: newCount,
      },
    });

    // If threshold reached, send notification
    const thresholdReached = newCount >= CONSECUTIVE_FAILURE_THRESHOLD;
    if (thresholdReached) {
      try {
        await db.notification.create({
          data: {
            userId,
            type: 'payment_failed',
            title: 'Multiple Payment Failures Detected',
            message: 'Multiple payment failures detected. Need help? Contact support.',
            actionUrl: '/dashboard',
          },
        });
      } catch {
        // Non-critical
      }
    }

    return { consecutiveCount: newCount, thresholdReached };
  } catch (error) {
    console.error('[PaymentFailureUtils] Failed to track payment failure:', error);
    return { consecutiveCount: 0, thresholdReached: false };
  }
}

/**
 * Reset the consecutive payment failure counter for a user.
 * Called after a successful payment.
 */
export async function resetPaymentFailureCount(userId: string): Promise<void> {
  try {
    await db.user.update({
      where: { id: userId },
      data: {
        consecutivePaymentFailures: 0,
        lastPaymentFailureAt: null,
      },
    });
  } catch (error) {
    console.error('[PaymentFailureUtils] Failed to reset payment failure count:', error);
  }
}

// ===== PAYMENT FAILURE EMAIL =====

/**
 * Send email notification for subscription renewal failure.
 */
export async function sendPaymentFailureEmail(
  email: string,
  name: string,
  plan: string,
  reason: 'renewal_failed' | '3ds_required' | 'subscription_cancelled'
): Promise<void> {
  try {
    const subjectMap: Record<string, string> = {
      renewal_failed: 'Subscription renewal failed — AcquisitionOS',
      '3ds_required': 'Action required: Complete payment authentication — AcquisitionOS',
      subscription_cancelled: 'Subscription cancelled — AcquisitionOS',
    };

    const messageMap: Record<string, string> = {
      renewal_failed: `We were unable to process your ${plan} plan renewal payment. Please update your payment method to continue service.`,
      '3ds_required': `Your bank requires additional authentication for your ${plan} plan payment. Please complete the verification to avoid service interruption.`,
      subscription_cancelled: `Your ${plan} plan subscription has been cancelled due to payment failure. You can resubscribe anytime from your billing settings.`,
    };

    await sendEmail({
      to: email,
      subject: subjectMap[reason] || 'Payment issue — AcquisitionOS',
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0d9488;">Payment Issue</h2>
        <p>Hi ${name},</p>
        <p>${messageMap[reason]}</p>
        <p style="margin-top:20px;">
          <a href="/dashboard" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">Go to Billing Settings</a>
        </p>
        <p style="margin-top:20px;color:#64748b;font-size:13px;">If you believe this is an error, please contact our support team.</p>
      </div>`,
      text: `Hi ${name}, ${messageMap[reason]} Go to your billing settings to update your payment method.`,
    });
  } catch (error) {
    console.error('[PaymentFailureUtils] Failed to send payment failure email:', error);
  }
}

/**
 * Send refund notification email.
 */
export async function sendRefundNotificationEmail(
  email: string,
  name: string,
  amount: number,
  currency: string
): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: 'Refund Processed — AcquisitionOS',
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0d9488;">Refund Processed</h2>
        <p>Hi ${name},</p>
        <p>A refund of <strong>${currency.toUpperCase()} ${amount.toFixed(2)}</strong> has been issued to your card. It will appear in 5–10 business days.</p>
        <p style="color:#64748b;font-size:13px;margin-top:20px;">If you have any questions, please contact our support team.</p>
      </div>`,
      text: `Hi ${name}, A refund of ${currency.toUpperCase()} ${amount.toFixed(2)} has been issued to your card. It will appear in 5–10 business days.`,
    });
  } catch (error) {
    console.error('[PaymentFailureUtils] Failed to send refund email:', error);
  }
}
