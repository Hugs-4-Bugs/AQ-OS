// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/verify
// Verify a payment (Razorpay signature or Stripe confirmation)
// and activate subscription
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { verifyPaymentSignature } from '@/lib/razorpay-service';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { generateInvoice } from '@/lib/invoice-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { db } from '@/lib/db';
import { getClientIp, getUserAgent } from '@/lib/auth';

// ===== TYPES =====

interface VerifyPaymentBody {
  provider: 'razorpay' | 'stripe';
  /** For Razorpay: the internal PaymentOrder ID */
  paymentOrderId?: string;
  /** For Razorpay: the Razorpay order ID */
  razorpayOrderId?: string;
  /** For Razorpay: the Razorpay payment ID */
  razorpayPaymentId?: string;
  /** For Razorpay: the signature from frontend callback */
  razorpaySignature?: string;
  /** For Stripe: the checkout session ID */
  sessionId?: string;
}

// ===== HANDLER =====

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as VerifyPaymentBody;
      const {
        provider,
        paymentOrderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        sessionId,
      } = body;

      // ── Validate provider ──
      if (!provider || !['razorpay', 'stripe'].includes(provider)) {
        return NextResponse.json(
          { error: 'Invalid provider. Must be "razorpay" or "stripe".' },
          { status: 400 }
        );
      }

      if (provider === 'razorpay') {
        // ── Razorpay verification ──
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return NextResponse.json(
            { error: 'Missing required Razorpay parameters: razorpayOrderId, razorpayPaymentId, razorpaySignature' },
            { status: 400 }
          );
        }

        // Verify the payment signature
        const verifyResult = verifyPaymentSignature({
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
          signature: razorpaySignature,
        });

        if (!verifyResult.success) {
          // Log payment_failed audit event
          await logBillingEvent({
            userId: user.id,
            action: 'payment_failed',
            details: `Razorpay payment signature verification failed for order ${razorpayOrderId}`,
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
            metadata: {
              provider: 'razorpay',
              razorpayOrderId,
              razorpayPaymentId,
              error: verifyResult.error,
            },
          });

          return NextResponse.json(
            { verified: false, subscriptionActivated: false, error: verifyResult.error || 'Payment verification failed' },
            { status: 400 }
          );
        }

        // Find the internal PaymentOrder by providerOrderId
        let internalOrder = paymentOrderId
          ? await db.paymentOrder.findUnique({ where: { id: paymentOrderId } })
          : null;

        if (!internalOrder) {
          internalOrder = await db.paymentOrder.findFirst({
            where: {
              userId: user.id,
              providerOrderId: razorpayOrderId,
            },
          });
        }

        if (!internalOrder) {
          return NextResponse.json(
            { verified: true, subscriptionActivated: false, error: 'Payment verified but order not found in system' },
            { status: 404 }
          );
        }

        if (internalOrder.userId !== user.id) {
          return NextResponse.json(
            { error: 'Payment order does not belong to this user' },
            { status: 403 }
          );
        }

        // Confirm payment and activate subscription
        const activateResult = await confirmPaymentAndActivate(
          user.id,
          internalOrder.id,
          razorpayPaymentId
        );

        if (!activateResult.success) {
          await logBillingEvent({
            userId: user.id,
            action: 'payment_failed',
            resourceId: internalOrder.id,
            details: `Failed to activate subscription after Razorpay payment verification: ${activateResult.error}`,
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
            metadata: {
              provider: 'razorpay',
              razorpayOrderId,
              razorpayPaymentId,
              paymentOrderId: internalOrder.id,
            },
          });

          return NextResponse.json(
            { verified: true, subscriptionActivated: false, error: activateResult.error },
            { status: 500 }
          );
        }

        // Generate invoice
        await generateInvoice({
          paymentOrderId: internalOrder.id,
          userId: user.id,
        });

        // Log payment_completed audit event
        await logBillingEvent({
          userId: user.id,
          action: 'payment_completed',
          resourceId: internalOrder.id,
          details: `Razorpay payment verified and subscription activated for ${internalOrder.plan} plan`,
          ipAddress: getClientIp(request),
          userAgent: getUserAgent(request),
          metadata: {
            provider: 'razorpay',
            razorpayOrderId,
            razorpayPaymentId,
            paymentOrderId: internalOrder.id,
            plan: internalOrder.plan,
            billingCycle: internalOrder.billingCycle,
            amount: internalOrder.amount,
            currency: internalOrder.currency,
          },
        });

        return NextResponse.json({
          verified: true,
          subscriptionActivated: true,
          plan: internalOrder.plan,
          billingCycle: internalOrder.billingCycle,
        });
      } else {
        // ── Stripe verification ──
        // For Stripe, the webhook handles actual confirmation.
        // This endpoint provides a client-side verification check.
        if (!sessionId && !paymentOrderId) {
          return NextResponse.json(
            { error: 'Missing sessionId or paymentOrderId for Stripe verification' },
            { status: 400 }
          );
        }

        // Find the internal PaymentOrder
        let internalOrder = paymentOrderId
          ? await db.paymentOrder.findUnique({ where: { id: paymentOrderId } })
          : null;

        if (!internalOrder && sessionId) {
          internalOrder = await db.paymentOrder.findFirst({
            where: {
              userId: user.id,
              providerOrderId: sessionId,
            },
          });
        }

        if (!internalOrder) {
          return NextResponse.json(
            { error: 'Payment order not found' },
            { status: 404 }
          );
        }

        if (internalOrder.userId !== user.id) {
          return NextResponse.json(
            { error: 'Payment order does not belong to this user' },
            { status: 403 }
          );
        }

        // Check if the order is already completed (webhook may have processed it)
        if (internalOrder.status === 'completed') {
          return NextResponse.json({
            verified: true,
            subscriptionActivated: true,
            plan: internalOrder.plan,
            billingCycle: internalOrder.billingCycle,
          });
        }

        // For Stripe, we return pending status — webhook handles actual confirmation
        return NextResponse.json({
          verified: false,
          subscriptionActivated: false,
          status: internalOrder.status,
          message: 'Stripe payment is being processed. Subscription will be activated via webhook.',
        });
      }
    } catch (error) {
      console.error('[API] Verify payment error:', error);
      return NextResponse.json(
        { error: 'Failed to verify payment' },
        { status: 500 }
      );
    }
  });
}
