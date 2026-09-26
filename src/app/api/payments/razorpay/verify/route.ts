// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/razorpay/verify
//
// Server-side verification for Razorpay Checkout payments.
//
// SECURITY:
//   • The frontend's payment-success callback is NEVER trusted. This
//     route (1) validates the HMAC signature computed from the Razorpay
//     order/subscription + payment ids, (2) re-fetches the payment from
//     Razorpay's API to confirm status and amount, and (3) activates the
//     subscription / fulfills credits through the SAME shared services
//     used by the Razorpay webhook (confirmPaymentAndActivate /
//     fulfillCreditAddon) — which are idempotent.
//   • Duplicate submissions are deduplicated via PaymentWebhook
//     (eventId = checkout_verify_<paymentId>) and the atomic
//     pending-check inside the activation service.
//   • Razorpay webhooks remain the ultimate source of truth: if the
//     browser dies before calling this route, the webhook still completes
//     activation; if this route runs first, the webhook becomes a no-op.
//
// Body:
//   {
//     orderId: string                // internal PaymentOrder id
//     razorpay_order_id?: string     // one-time order checkout
//     razorpay_payment_id: string
//     razorpay_signature: string
//     razorpay_subscription_id?: string  // recurring subscription checkout
//   }
//
// Auth: Required (withAuth) — the order must belong to the caller.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getPaymentProvider } from '@/lib/payments';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

interface VerifyRazorpayBody {
  orderId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  razorpay_subscription_id?: string;
}

export async function POST(request: NextRequest) {
  if (!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)) {
    return NextResponse.json(
      { error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' },
      { status: 500 }
    );
  }

  return withAuth(request, async (user) => {
    let body: VerifyRazorpayBody;
    try {
      body = (await request.json()) as VerifyRazorpayBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, razorpay_subscription_id } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Missing orderId.' }, { status: 400 });
    }
    if (!razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing razorpay_payment_id or razorpay_signature.' },
        { status: 400 }
      );
    }
    if (!razorpay_order_id && !razorpay_subscription_id) {
      return NextResponse.json(
        { error: 'Missing razorpay_order_id or razorpay_subscription_id.' },
        { status: 400 }
      );
    }

    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    const provider = getPaymentProvider('razorpay');
    const result = await provider.verifyPayment({
      userId: user.id,
      orderId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      razorpaySubscriptionId: razorpay_subscription_id,
      ipAddress,
      userAgent,
    });

    await logBillingEvent({
      userId: user.id,
      action: result.success ? 'payment_completed' : 'payment_verification_failed',
      details: result.success
        ? `Razorpay payment verified server-side (${razorpay_payment_id})${result.alreadyProcessed ? ' — already processed' : ''}`
        : `Razorpay payment verification failed: ${result.error}`,
      ipAddress,
      userAgent,
      metadata: {
        orderId,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySubscriptionId: razorpay_subscription_id,
        alreadyProcessed: result.alreadyProcessed,
        errorCode: result.errorCode,
        provider: 'razorpay',
      },
    });

    if (!result.success) {
      const status =
        result.errorCode === 'SIGNATURE_INVALID' ? 400 :
        result.errorCode === 'ORDER_NOT_FOUND' ? 404 :
        result.errorCode === 'ORDER_NOT_PENDING' ? 409 :
        result.errorCode === 'AMOUNT_MISMATCH' ? 400 :
        result.errorCode === 'NOT_CONFIGURED' ? 500 :
        400;
      return NextResponse.json(
        { success: false, error: result.error, errorCode: result.errorCode },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed || false,
      plan: result.plan,
      creditsAdded: result.creditsAdded,
    });
  });
}
