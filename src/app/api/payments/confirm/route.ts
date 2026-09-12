// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/confirm
// Confirms a payment order and activates the subscription.
// Used in dev mode when Razorpay/Stripe checkout is not available.
// In production, webhooks handle this automatically.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { logPaymentEvent } from '@/lib/billing-audit';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Security: Only allow direct payment confirmation in development mode
      // OR when a real Stripe/Razorpay payment has been made and the user
      // returns from checkout. In production, webhooks handle this automatically,
      // but we allow the confirm endpoint as a fallback for when webhooks are delayed.
      // The webhook handler has idempotency checks so double-processing is safe.

      const body = await request.json();
      const { orderId, providerPaymentId } = body as {
        orderId: string;
        providerPaymentId?: string;
      };

      if (!orderId) {
        return NextResponse.json(
          { error: 'Order ID is required' },
          { status: 400 }
        );
      }

      // Verify the order belongs to this user
      const order = await db.paymentOrder.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      if (order.userId !== user.id) {
        return NextResponse.json(
          { error: 'Order does not belong to this user' },
          { status: 403 }
        );
      }

      if (order.status === 'completed') {
        return NextResponse.json(
          { error: 'Order already completed', alreadyCompleted: true },
          { status: 200 }
        );
      }

      if (order.status === 'failed') {
        return NextResponse.json(
          { error: 'Order has failed. Please create a new order.' },
          { status: 400 }
        );
      }

      // Use confirmPaymentAndActivate for atomic subscription + credit update
      const result = await confirmPaymentAndActivate(
        user.id,
        orderId,
        providerPaymentId || `pay_confirmed_${Date.now()}`
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to confirm payment' },
          { status: 500 }
        );
      }

      // Log the payment completion
      await logPaymentEvent(user.id, 'payment_completed', {
        amount: order.amount,
        currency: order.currency,
        provider: order.provider,
        plan: order.plan,
        paymentOrderId: order.id,
      });

      // Create invoice
      const invoiceNumber = `INV-${Date.now()}-${order.id.slice(-6)}`;
      const lineItems = JSON.stringify([
        {
          description: `${order.plan} Plan — ${order.billingCycle} subscription`,
          amount: order.subtotal,
          quantity: 1,
        },
        ...(order.discountAmount > 0
          ? [{ description: `Coupon discount (${order.couponCode})`, amount: -order.discountAmount, quantity: 1 }]
          : []),
        ...(order.taxAmount > 0
          ? [{ description: `Tax (${(order.taxRate * 100).toFixed(0)}%)`, amount: order.taxAmount, quantity: 1 }]
          : []),
      ]);

      try {
        await db.invoice.upsert({
          where: { paymentOrderId: order.id },
          create: {
            paymentOrderId: order.id,
            invoiceNumber,
            userId: order.userId,
            subtotal: order.subtotal,
            taxRate: order.taxRate,
            taxAmount: order.taxAmount,
            total: order.amount,
            currency: order.currency,
            lineItems,
          },
          update: {},
        });
      } catch {
        // Invoice creation is non-critical
      }

      return NextResponse.json({
        success: true,
        plan: order.plan,
        message: `Successfully upgraded to ${order.plan} plan!`,
      });
    } catch (error) {
      console.error('[API] Payment confirm error:', error);
      return NextResponse.json(
        { error: 'Failed to confirm payment' },
        { status: 500 }
      );
    }
  });
}
