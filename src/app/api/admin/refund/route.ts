// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/admin/refund
// Admin-only endpoint for issuing refunds via Stripe.
// Protected by admin role check.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { logPaymentEvent, logBillingEvent } from '@/lib/billing-audit';
import { sendRefundNotificationEmail } from '@/lib/payment-failure-utils';

interface AdminRefundRequestBody {
  userId: string;
  paymentIntentId: string;
  amount?: number; // In cents. If null, full refund.
  reason: string;
}

export async function POST(request: NextRequest) {
  return withAdmin(request, async (adminUser) => {
    try {
      const body = (await request.json()) as AdminRefundRequestBody;
      const { userId, paymentIntentId, amount, reason } = body;

      // Validate required fields
      if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }
      if (!paymentIntentId) {
        return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: 'reason is required' }, { status: 400 });
      }

      // Find the user
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Find the payment order by providerPaymentId
      const order = await db.paymentOrder.findFirst({
        where: { providerPaymentId: paymentIntentId },
      });

      if (!order) {
        return NextResponse.json({ error: 'Payment order not found for this payment intent' }, { status: 404 });
      }

      // Idempotency: already refunded
      if (order.status === 'refunded') {
        return NextResponse.json({ error: 'This payment has already been refunded' }, { status: 409 });
      }

      // Issue refund via Stripe
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey as never);

      const refundParams: Record<string, unknown> = {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          adminInitiated: 'true',
          adminId: adminUser.id || 'system',
          reason,
          userId,
          orderId: order.id,
        },
      };

      // If amount is specified, partial refund (amount in cents)
      if (amount && amount > 0) {
        refundParams.amount = amount;
      }

      const refund = await stripe.refunds.create(refundParams as Parameters<typeof stripe.refunds.create>[0]);

      // Update payment order status
      const isFullRefund = !amount || amount >= Math.round(order.amount * 100);
      await db.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: isFullRefund ? 'refunded' : order.status,
        },
      });

      // Update invoice status
      const invoiceRecord = await db.invoice.findUnique({
        where: { paymentOrderId: order.id },
      });
      if (invoiceRecord) {
        await db.invoice.update({
          where: { id: invoiceRecord.id },
          data: { status: isFullRefund ? 'refunded' : 'partially_refunded' },
        });
      }

      // If full refund, update invoice and subscription
      if (isFullRefund) {
        // Update subscription
        const subscription = await db.subscription.findFirst({
          where: { userId, status: { in: ['active', 'trialing', 'past_due'] } },
        });

        if (subscription) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: { status: 'expired', plan: 'free' },
          });
        }

        // Downgrade user
        const { PLAN_CREDITS } = await import('@/lib/entitlement-service');
        const freeCredits = PLAN_CREDITS.free;
        await db.user.update({
          where: { id: userId },
          data: {
            plan: 'free',
            isTrial: false,
            credits: freeCredits,
            creditsMonthly: freeCredits,
            rolloverCredits: 0,
          },
        });

        // Create credit ledger entry
        await db.creditsLedger.create({
          data: {
            userId,
            action: 'refund_adjustment',
            credits: -order.amount,
            balance: freeCredits,
            description: `Credits adjusted due to admin refund for ${order.plan} plan order`,
            referenceId: order.id,
          },
        });
      }

      // Create AuditLog
      await logBillingEvent({
        userId,
        action: 'refund_issued',
        details: `Admin refund issued: ${isFullRefund ? 'full' : 'partial'} refund for order ${order.id}`,
        metadata: {
          refundId: refund.id,
          amount: amount ? amount / 100 : order.amount,
          currency: order.currency,
          reason,
          adminId: adminUser.id || 'system',
          orderId: order.id,
          isFullRefund,
        },
      });

      await logPaymentEvent(userId, 'payment_refunded', {
        amount: amount ? amount / 100 : order.amount,
        currency: order.currency,
        provider: 'stripe',
        plan: order.plan,
        paymentOrderId: order.id,
        reason: `Admin refund: ${reason}`,
      });

      // Create notification for the user
      await db.notification.create({
        data: {
          userId,
          type: 'payment_refunded',
          title: 'Refund Processed',
          message: isFullRefund
            ? `A full refund has been processed for your ${order.plan} plan subscription. Your account has been downgraded to the free plan.`
            : `A partial refund of ${(amount ? amount / 100 : order.amount).toFixed(2)} ${order.currency} has been processed.`,
          actionUrl: '/dashboard',
        },
      });

      // Send refund email
      const refundAmount = amount ? amount / 100 : order.amount;
      await sendRefundNotificationEmail(user.email, user.name || 'User', refundAmount, order.currency);

      return NextResponse.json({
        success: true,
        refundId: refund.id,
        refundAmount,
        currency: order.currency,
        isFullRefund,
        orderId: order.id,
      });
    } catch (error) {
      console.error('[Admin Refund] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to process refund';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
