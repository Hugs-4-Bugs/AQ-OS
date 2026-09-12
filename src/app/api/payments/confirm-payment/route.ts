// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/confirm-payment
// CRITICAL: Payment Confirmation Fallback Endpoint
//
// This is the client-initiated fallback when Stripe webhooks fail to
// reach the server. After a user completes Stripe checkout and lands
// on the success page, the frontend calls this endpoint with the
// Stripe checkout session ID. It:
//   1. Retrieves the Stripe session via API
//   2. If paid, finds the PaymentOrder by providerOrderId
//   3. If order is still pending, calls confirmPaymentAndActivate
//   4. Generates PDF invoice
//   5. Sends invoice email
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';
import { logPaymentEvent, logSubscriptionEvent, logCreditEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';

// ── Credit map (mirrors entitlement-service) ──

function getCreditsForPlan(plan: string): number {
  const planCredits: Record<string, number> = {
    free: 50,
    pro: 500,
    elite: 2000,
    enterprise: 10000,
  };
  return planCredits[plan] || 50;
}

// ── POST handler ──

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { sessionId } = body;

      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json(
          { error: 'Missing or invalid sessionId' },
          { status: 400 }
        );
      }

      // ── Step 1: Verify Stripe session ──
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return NextResponse.json(
          { error: 'Payment provider not configured' },
          { status: 503 }
        );
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey as never);

      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (stripeError) {
        console.error('[ConfirmPayment] Stripe retrieve error:', stripeError);
        return NextResponse.json(
          { error: 'Failed to verify payment session with Stripe' },
          { status: 502 }
        );
      }

      // Verify session ownership
      const sessionUserId = session.metadata?.user_id || session.client_reference_id;
      if (sessionUserId && sessionUserId !== user.id) {
        return NextResponse.json(
          { error: 'Session does not belong to this user' },
          { status: 403 }
        );
      }

      // ── Step 2: Check payment status ──
      if (session.payment_status !== 'paid') {
        return NextResponse.json({
          success: false,
          paid: false,
          status: session.payment_status,
          message:
            session.payment_status === 'unpaid'
              ? 'Payment has not been completed yet.'
              : `Payment status: ${session.payment_status}`,
        });
      }

      // ── Step 3: Find PaymentOrder by providerOrderId ──
      const order = await db.paymentOrder.findFirst({
        where: { providerOrderId: sessionId },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              pdfUrl: true,
            },
          },
        },
      });

      if (!order) {
        console.error('[ConfirmPayment] No PaymentOrder found for session:', sessionId);
        return NextResponse.json(
          { error: 'Payment order not found for this session. Please contact support.' },
          { status: 404 }
        );
      }

      if (order.userId !== user.id) {
        return NextResponse.json(
          { error: 'Payment order does not belong to this user' },
          { status: 403 }
        );
      }

      // ── Step 4: If already completed, return existing data ──
      if (order.status === 'completed') {
        // Fetch the active subscription for credits info
        const subscription = await db.subscription.findFirst({
          where: {
            userId: user.id,
            status: { in: ['active', 'trialing'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
          success: true,
          paid: true,
          orderStatus: 'completed',
          activated: false,
          message: 'Payment was already confirmed previously.',
          plan: order.plan,
          billingCycle: order.billingCycle,
          amount: order.amount,
          currency: order.currency,
          credits: subscription?.creditsTotal ?? getCreditsForPlan(order.plan),
          invoiceNumber: order.invoice?.invoiceNumber || null,
          subscriptionStatus: subscription?.status || 'active',
          subscriptionId: subscription?.id || null,
        });
      }

      if (order.status === 'failed') {
        return NextResponse.json({
          success: false,
          paid: true,
          orderStatus: 'failed',
          message: 'This payment order has been marked as failed. Please contact support.',
        });
      }

      if (order.status === 'refunded') {
        return NextResponse.json({
          success: false,
          paid: true,
          orderStatus: 'refunded',
          message: 'This payment has been refunded.',
        });
      }

      // ── Step 5: Activate payment (confirmPaymentAndActivate) ──
      const providerPaymentId =
        session.payment_intent as string ||
        session.latest_charge as string ||
        order.providerPaymentId ||
        sessionId;

      console.log(
        `[ConfirmPayment] Activating payment for order ${order.id}, ` +
        `user ${user.id}, plan ${order.plan}, providerPaymentId ${providerPaymentId}`
      );

      const activateResult = await confirmPaymentAndActivate(
        user.id,
        order.id,
        providerPaymentId
      );

      if (!activateResult.success) {
        console.error('[ConfirmPayment] Activation failed:', activateResult.error);
        return NextResponse.json({
          success: false,
          paid: true,
          orderStatus: order.status,
          message: activateResult.error || 'Failed to activate subscription. Please try again or contact support.',
        });
      }

      // ── Step 5b: Link Stripe subscription/customer IDs ──
      try {
        const subscription = await db.subscription.findFirst({
          where: { userId: user.id, status: 'active' },
        });
        if (subscription && session.subscription) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              stripeSubscriptionId: session.subscription.toString(),
              stripeCustomerId: session.customer?.toString() || null,
            },
          });
          console.log(`[ConfirmPayment] Linked Stripe IDs: sub=${session.subscription}, cust=${session.customer}`);
        }
      } catch (linkErr) {
        console.error('[ConfirmPayment] Failed to link Stripe IDs (non-critical):', linkErr);
      }

      // ── Step 5c: Create Invoice DB record (like the webhook handler does) ──
      try {
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
            ? [{ description: `Tax`, amount: order.taxAmount, quantity: 1 }]
            : []),
        ]);

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
        console.log(`[ConfirmPayment] Invoice DB record created: ${invoiceNumber}`);
      } catch (invoiceDbError) {
        console.error('[ConfirmPayment] Invoice DB creation failed (non-critical):', invoiceDbError);
      }

      // ── Step 5d: Create notification for the user ──
      try {
        const planCredits = PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free;
        await db.notification.create({
          data: {
            userId: user.id,
            type: 'payment_success',
            title: 'Payment Successful',
            message: `Your ${order.plan} plan subscription is now active! ${planCredits} credits have been added to your account.`,
            actionUrl: '/dashboard',
          },
        });
      } catch (notifErr) {
        console.error('[ConfirmPayment] Notification creation failed (non-critical):', notifErr);
      }

      // ── Step 6: Generate PDF invoice ──
      let invoiceResult: Awaited<ReturnType<typeof generateInvoicePdf>> | null = null;
      try {
        invoiceResult = await generateInvoicePdf(order.id);
        if (invoiceResult.success) {
          console.log(
            `[ConfirmPayment] Invoice PDF generated: ${invoiceResult.invoiceId}, ` +
            `pdfUrl: ${invoiceResult.pdfUrl}`
          );
        } else {
          console.warn('[ConfirmPayment] Invoice PDF generation failed:', invoiceResult.error);
        }
      } catch (invoiceError) {
        console.error('[ConfirmPayment] Invoice PDF generation error:', invoiceError);
      }

      // ── Step 7: Send invoice email (BLOCKING — must complete before response) ──
      try {
        console.log(`[ConfirmPayment] Sending invoice email to user ${user.id}...`);
        const emailResult = await sendInvoiceEmail(user.id, order.id);
        if (emailResult?.sent) {
          console.log(`[ConfirmPayment] ✓ Invoice email sent to user ${user.id}`);
        } else {
          console.error('[ConfirmPayment] ✗ Invoice email failed:', emailResult?.error);
        }
      } catch (emailError) {
        console.error('[ConfirmPayment] ✗ Invoice email error:', emailError);
      }

      // ── Step 8: Log payment event ──
      await logPaymentEvent(user.id, 'payment_completed', {
        amount: order.amount,
        currency: order.currency,
        provider: order.provider || 'stripe',
        plan: order.plan,
        paymentOrderId: order.id,
      });

      // ── Step 9: Fetch updated subscription and return response ──
      const subscription = await db.subscription.findFirst({
        where: {
          userId: user.id,
          status: { in: ['active', 'trialing'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Fetch the updated invoice
      const updatedInvoice = invoiceResult?.success
        ? { invoiceNumber: invoiceResult.pdfUrl?.split('/').pop()?.replace('.pdf', '') || null }
        : await db.invoice.findUnique({
            where: { paymentOrderId: order.id },
            select: { invoiceNumber: true },
          });

      return NextResponse.json({
        success: true,
        paid: true,
        orderStatus: 'completed',
        activated: true,
        message: 'Payment confirmed and subscription activated successfully!',
        plan: order.plan,
        billingCycle: order.billingCycle,
        amount: order.amount,
        currency: order.currency,
        credits: subscription?.creditsTotal ?? getCreditsForPlan(order.plan),
        invoiceNumber: updatedInvoice?.invoiceNumber || invoiceResult?.pdfUrl?.split('/').pop()?.replace('.pdf', '') || null,
        subscriptionStatus: subscription?.status || 'active',
        subscriptionId: subscription?.id || null,
      });
    } catch (error) {
      console.error('[ConfirmPayment] Unexpected error:', error);
      return NextResponse.json(
        { error: 'An unexpected error occurred while confirming payment' },
        { status: 500 }
      );
    }
  });
}
