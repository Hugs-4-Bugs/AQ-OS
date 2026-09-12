// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Refund Flow Service
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Handles refunds via Stripe and Razorpay, credit reversal,
// refund tracking, and retry on failure.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logPaymentEvent, logBillingEvent } from '@/lib/billing-audit';
import { refundCredits } from '@/lib/credit-service';

// ===== TYPES =====

export type RefundType = 'full' | 'partial';
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';

export interface InitiateRefundParams {
  paymentOrderId: string;
  userId: string;
  refundType: RefundType;
  amount?: number; // Required for partial refund
  reason?: string;
  initiatedBy: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  refundAmount?: number;
  creditsReversed?: number;
  status?: RefundStatus;
  error?: string;
}

export interface RefundWebhookData {
  refundId: string;
  paymentId: string;
  status: 'succeeded' | 'failed' | 'pending' | 'cancelled';
  amount: number;
  currency: string;
  provider: 'stripe' | 'razorpay';
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ===== REFUND INITIATION =====

export async function initiateRefund(params: InitiateRefundParams): Promise<RefundResult> {
  try {
    const { paymentOrderId, userId, refundType, amount, reason, initiatedBy } = params;

    // Fetch the payment order
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    if (order.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user' };
    }

    if (order.status !== 'completed') {
      return { success: false, error: 'Only completed payments can be refunded' };
    }

    if (order.status === 'refunded') {
      return { success: false, error: 'Payment has already been fully refunded' };
    }

    // Calculate refund amount
    const refundAmount = refundType === 'full' ? order.amount : (amount || 0);

    if (refundType === 'partial' && (!amount || amount <= 0)) {
      return { success: false, error: 'Partial refund requires a valid amount' };
    }

    if (refundAmount > order.amount) {
      return { success: false, error: 'Refund amount cannot exceed original payment amount' };
    }

    // Create refund record via payment provider
    let providerRefundId: string | null = null;

    if (order.provider === 'stripe' && order.providerPaymentId) {
      const stripeResult = await initiateStripeRefund({
        paymentIntentId: order.providerPaymentId,
        amount: refundAmount,
        currency: order.currency,
        reason: reason || 'requested_by_customer',
        metadata: {
          paymentOrderId,
          userId,
          refundType,
        },
      });

      if (!stripeResult.success) {
        return { success: false, error: stripeResult.error || 'Stripe refund failed' };
      }
      providerRefundId = stripeResult.refundId || null;
    } else if (order.provider === 'razorpay' && order.providerPaymentId) {
      const razorpayResult = await initiateRazorpayRefund({
        paymentId: order.providerPaymentId,
        amount: refundAmount,
        currency: order.currency,
        reason: reason || 'requested_by_customer',
        notes: {
          paymentOrderId,
          userId,
          refundType,
        },
      });

      if (!razorpayResult.success) {
        return { success: false, error: razorpayResult.error || 'Razorpay refund failed' };
      }
      providerRefundId = razorpayResult.refundId || null;
    }

    // Update payment order status
    await db.paymentOrder.update({
      where: { id: paymentOrderId },
      data: {
        status: refundType === 'full' ? 'refunded' : 'completed', // Keep completed for partial
      },
    });

    // Create audit log for refund
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await logPaymentEvent(userId, 'payment_refunded', {
      amount: refundAmount,
      currency: order.currency,
      provider: order.provider,
      plan: order.plan,
      paymentOrderId,
      reason: reason || `${refundType} refund initiated by ${initiatedBy}`,
    });

    // Reverse credits for full refund
    let creditsReversed = 0;
    if (refundType === 'full') {
      const creditResult = await reverseCreditsOnRefund(userId, order.plan, paymentOrderId);
      if (creditResult.success) {
        creditsReversed = creditResult.creditsReversed;
      }
    }

    return {
      success: true,
      refundId: providerRefundId || refundId,
      refundAmount,
      creditsReversed,
      status: 'processing',
    };
  } catch (error) {
    console.error('[RefundService] Failed to initiate refund:', error);
    return { success: false, error: 'Failed to initiate refund' };
  }
}

// ===== STRIPE REFUND =====

async function initiateStripeRefund(params: {
  paymentIntentId: string;
  amount: number;
  currency: string;
  reason: string;
  metadata: Record<string, unknown>;
}): Promise<{ success: boolean; refundId?: string; error?: string }> {
  try {
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as never,
    });

    const refund = await stripeClient.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: Math.round(params.amount * 100), // Convert to cents
      reason: params.reason === 'requested_by_customer' ? 'requested_by_customer' : 'requested_by_customer',
      metadata: params.metadata as Record<string, string>,
    });

    return { success: true, refundId: refund.id };
  } catch (error) {
    console.error('[RefundService] Stripe refund error:', error);
    const message = error instanceof Error ? error.message : 'Stripe refund failed';
    return { success: false, error: message };
  }
}

// ===== RAZORPAY REFUND =====

async function initiateRazorpayRefund(params: {
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
  notes: Record<string, unknown>;
}): Promise<{ success: boolean; refundId?: string; error?: string }> {
  try {
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const refund = await razorpay.payments.refund(params.paymentId, {
      amount: Math.round(params.amount * 100), // Convert to paise
      notes: params.notes as Record<string, string>,
    });

    return { success: true, refundId: refund.id };
  } catch (error) {
    console.error('[RefundService] Razorpay refund error:', error);
    const message = error instanceof Error ? error.message : 'Razorpay refund failed';
    return { success: false, error: message };
  }
}

// ===== PROCESS REFUND =====

export async function processRefund(refundId: string, provider: 'stripe' | 'razorpay'): Promise<RefundResult> {
  try {
    let refundStatus: RefundStatus = 'processing';
    let refundAmount = 0;
    let currency = 'USD';

    if (provider === 'stripe') {
      const stripe = await import('stripe');
      const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as never,
      });

      const refund = await stripeClient.refunds.retrieve(refundId);
      refundAmount = (refund.amount || 0) / 100;
      currency = refund.currency?.toUpperCase() || 'USD';

      if (refund.status === 'succeeded') {
        refundStatus = 'completed';
      } else if (refund.status === 'failed' || refund.status === 'canceled') {
        refundStatus = 'failed';
      }
    } else if (provider === 'razorpay') {
      const Razorpay = (await import('razorpay')).default;
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || '',
        key_secret: process.env.RAZORPAY_KEY_SECRET || '',
      });

      const refund = await razorpay.refunds.fetch(refundId);
      refundAmount = (refund.amount || 0) / 100;
      currency = (refund.currency || 'INR').toUpperCase();

      if (refund.status === 'processed') {
        refundStatus = 'completed';
      } else if (refund.status === 'failed') {
        refundStatus = 'failed';
      }
    }

    return {
      success: true,
      refundId,
      refundAmount,
      status: refundStatus,
    };
  } catch (error) {
    console.error('[RefundService] Failed to process refund:', error);
    return { success: false, error: 'Failed to process refund' };
  }
}

// ===== HANDLE REFUND WEBHOOK =====

export async function handleRefundWebhook(data: RefundWebhookData): Promise<RefundResult> {
  try {
    const { refundId, status, amount, currency, provider, reason } = data;

    // Log the refund webhook event
    await logBillingEvent({
      userId: 'system',
      action: 'payment_refunded',
      details: `Refund webhook received: ${status}`,
      metadata: {
        refundId,
        status,
        amount,
        currency,
        provider,
        reason,
      },
    });

    if (status === 'succeeded' || status === 'processed') {
      // Find the associated payment order and update
      // The metadata should contain the paymentOrderId
      const metadata = data.metadata || {};
      const paymentOrderId = metadata.paymentOrderId as string | undefined;
      const userId = metadata.userId as string | undefined;

      if (paymentOrderId && userId) {
        // Reverse credits
        const order = await db.paymentOrder.findUnique({
          where: { id: paymentOrderId },
        });

        if (order) {
          await reverseCreditsOnRefund(userId, order.plan, paymentOrderId);
        }

        // Update payment order status
        await db.paymentOrder.update({
          where: { id: paymentOrderId },
          data: { status: 'refunded' },
        });
      }

      return {
        success: true,
        refundId,
        refundAmount: amount,
        status: 'completed',
      };
    }

    if (status === 'failed') {
      return {
        success: false,
        refundId,
        status: 'failed',
        error: reason || 'Refund failed at provider',
      };
    }

    return {
      success: true,
      refundId,
      refundAmount: amount,
      status: 'processing',
    };
  } catch (error) {
    console.error('[RefundService] Failed to handle refund webhook:', error);
    return { success: false, error: 'Failed to handle refund webhook' };
  }
}

// ===== CREDIT REVERSAL ON REFUND =====

export async function reverseCreditsOnRefund(
  userId: string,
  plan: string,
  paymentOrderId: string
): Promise<{ success: boolean; creditsReversed: number; error?: string }> {
  try {
    const { PLAN_CREDITS } = await import('@/lib/entitlement-service');
    const planType = plan as 'free' | 'pro' | 'elite';
    const creditsToReverse = PLAN_CREDITS[planType] || 0;

    if (creditsToReverse <= 0) {
      return { success: true, creditsReversed: 0 };
    }

    // Get current user balance
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true, plan: true },
    });

    if (!user) {
      return { success: false, creditsReversed: 0, error: 'User not found' };
    }

    // Reverse credits: deduct the credits that were added during the upgrade
    const creditsToDeduct = Math.min(creditsToReverse, user.credits);

    const result = await refundCredits({
      userId,
      amount: creditsToDeduct,
      originalAction: `refund_${paymentOrderId}`,
      referenceId: paymentOrderId,
    });

    if (!result.success) {
      return { success: false, creditsReversed: 0, error: result.error };
    }

    // Downgrade to free plan if this was a full refund
    await db.user.update({
      where: { id: userId },
      data: {
        plan: 'free',
        credits: PLAN_CREDITS.free,
        creditsMonthly: PLAN_CREDITS.free,
        rolloverCredits: 0,
      },
    });

    // Also update the subscription
    await db.subscription.updateMany({
      where: { userId, status: 'active' },
      data: {
        plan: 'free',
        status: 'canceled',
      },
    });

    await logBillingEvent({
      userId,
      action: 'payment_refunded',
      details: `Credits reversed: ${creditsToDeduct} for ${plan} plan refund`,
      metadata: {
        creditsReversed: creditsToDeduct,
        plan,
        paymentOrderId,
      },
    });

    return { success: true, creditsReversed: creditsToDeduct };
  } catch (error) {
    console.error('[RefundService] Failed to reverse credits:', error);
    return { success: false, creditsReversed: 0, error: 'Failed to reverse credits on refund' };
  }
}

// ===== REFUND RETRY =====

export async function retryRefund(paymentOrderId: string, userId: string): Promise<RefundResult> {
  try {
    // Re-initiate the refund
    return initiateRefund({
      paymentOrderId,
      userId,
      refundType: 'full',
      reason: 'Retrying failed refund',
      initiatedBy: 'system',
    });
  } catch (error) {
    console.error('[RefundService] Refund retry failed:', error);
    return { success: false, error: 'Refund retry failed' };
  }
}

// ===== GET REFUND STATUS =====

export async function getRefundStatus(paymentOrderId: string): Promise<{
  success: boolean;
  status?: string;
  refundAmount?: number;
  error?: string;
}> {
  try {
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        providerPaymentId: true,
      },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    return {
      success: true,
      status: order.status,
      refundAmount: order.status === 'refunded' ? order.amount : undefined,
    };
  } catch (error) {
    console.error('[RefundService] Failed to get refund status:', error);
    return { success: false, error: 'Failed to get refund status' };
  }
}
