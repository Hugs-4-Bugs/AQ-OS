// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/cron/payment-reconciliation
// Runs on a schedule to reconcile missed payments for BOTH gateways:
//
//   Stripe   : queries successful payment intents / paid checkout sessions
//              from the last 24h and fulfills any the webhook missed
//              (existing behavior, preserved verbatim).
//   Razorpay : for every pending Razorpay order older than 15 minutes,
//              fetches the order's payments from the Razorpay API; a
//              captured payment is activated through the same idempotent
//              path used by the webhook and the checkout verify route.
//              Covers: browser closed after payment, webhook delayed or
//              never delivered, redirect failures after payment.
//
// Protected by CRON_SECRET header.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';

interface ReconciliationOutcome {
  checked?: number;
  sessionsChecked?: number;
  ordersChecked?: number;
  alreadyFulfilled: number;
  lateFulfillments: number;
  errors: number;
  lateFulfillmentDetails: Array<{ paymentId: string; orderId: string; userId: string }>;
}

/** Shared late-fulfillment completion: activate + invoice PDF + email.
 * Activation itself is idempotent (confirmPaymentAndActivate). */
async function fulfillLatePayment(
  userId: string,
  orderId: string,
  providerPaymentId: string,
  source: string
): Promise<boolean> {
  const result = await confirmPaymentAndActivate(userId, orderId, providerPaymentId);
  if (!result.success) {
    console.error(`[PaymentReconciliation] Failed to fulfill order ${orderId}:`, result.error);
    return false;
  }

  await logBillingEvent({
    userId,
    action: 'late_fulfillment',
    details: `Late fulfillment for order ${orderId} via ${source}`,
    metadata: { orderId, providerPaymentId, source },
  });

  try {
    const pdfResult = await generateInvoicePdf(orderId);
    if (pdfResult.success) {
      console.log(`[PaymentReconciliation] ✓ Late invoice PDF generated: ${pdfResult.pdfUrl}`);
    }
  } catch (pdfErr) {
    console.error('[PaymentReconciliation] ✗ Late invoice PDF error:', pdfErr);
  }

  try {
    const emailResult = await sendInvoiceEmail(userId, orderId);
    if (emailResult?.sent) {
      console.log(`[PaymentReconciliation] ✓ Late invoice email sent to user ${userId}`);
    }
  } catch (emailErr) {
    console.error('[PaymentReconciliation] ✗ Late invoice email error:', emailErr);
  }

  return true;
}

// ────────────────────────────────────────────────────────────────────
// Stripe reconciliation — existing logic, preserved.
// ────────────────────────────────────────────────────────────────────
async function reconcileStripe(stripeKey: string): Promise<ReconciliationOutcome> {
  const outcome: ReconciliationOutcome = {
    alreadyFulfilled: 0,
    lateFulfillments: 0,
    errors: 0,
    lateFulfillmentDetails: [],
  };

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey as never);

    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    // Query Stripe for all successful payment intents in the last 24 hours
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: twentyFourHoursAgo },
    });
    outcome.checked = paymentIntents.data.length;

    for (const pi of paymentIntents.data) {
      if (pi.status !== 'succeeded') continue;

      // Check if this payment intent is already fulfilled in our DB
      const existingOrder = await db.paymentOrder.findFirst({
        where: { providerPaymentId: pi.id, status: 'completed' },
      });
      if (existingOrder) {
        outcome.alreadyFulfilled++;
        continue;
      }

      // Find pending order by payment intent ID
      const pendingOrder = await db.paymentOrder.findFirst({
        where: { providerPaymentId: pi.id, status: 'pending' },
      });

      if (pendingOrder) {
        try {
          const fulfilled = await fulfillLatePayment(
            pendingOrder.userId,
            pendingOrder.id,
            pi.id,
            'payment reconciliation cron (payment intent)'
          );
          if (fulfilled) {
            outcome.lateFulfillments++;
            outcome.lateFulfillmentDetails.push({
              paymentId: pi.id,
              orderId: pendingOrder.id,
              userId: pendingOrder.userId,
            });
          } else {
            outcome.errors++;
          }
        } catch (err) {
          outcome.errors++;
          console.error(`[PaymentReconciliation] Error fulfilling order ${pendingOrder.id}:`, err);
        }
      }
    }

    // Also check Checkout Sessions for completed payments not in DB
    // This covers the case where a user completed Stripe Checkout but the
    // webhook was never received (e.g., server was down)
    const checkoutSessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: twentyFourHoursAgo },
    });
    outcome.sessionsChecked = checkoutSessions.data.length;

    for (const session of checkoutSessions.data) {
      if (session.payment_status !== 'paid') continue;

      const existingOrder = await db.paymentOrder.findFirst({
        where: {
          OR: [
            { providerOrderId: session.id, status: 'completed' },
            { providerPaymentId: session.payment_intent?.toString(), status: 'completed' },
          ],
        },
      });
      if (existingOrder) {
        outcome.alreadyFulfilled++;
        continue;
      }

      const pendingOrder = await db.paymentOrder.findFirst({
        where: {
          OR: [
            { providerOrderId: session.id, status: 'pending' },
            { providerPaymentId: session.payment_intent?.toString(), status: 'pending' },
          ],
        },
      });

      if (pendingOrder) {
        try {
          const providerPaymentId = (session.payment_intent as string) || session.id;
          const fulfilled = await fulfillLatePayment(
            pendingOrder.userId,
            pendingOrder.id,
            providerPaymentId,
            'checkout session reconciliation'
          );
          if (fulfilled) {
            outcome.lateFulfillments++;
            outcome.lateFulfillmentDetails.push({
              paymentId: providerPaymentId,
              orderId: pendingOrder.id,
              userId: pendingOrder.userId,
            });
          } else {
            outcome.errors++;
          }
        } catch (err) {
          outcome.errors++;
          console.error(`[PaymentReconciliation] Error fulfilling order ${pendingOrder.id} (session):`, err);
        }
      } else if (session.metadata?.user_id) {
        // No order at all — create retroactive order
        // This handles the case where the order creation failed before the Stripe redirect
        const plan = (session.metadata.plan || 'pro') as string;
        const billingCycle = (session.metadata.billing_cycle || 'monthly') as string;
        const amount = (session.amount_total || 0) / 100;
        const currency = (session.currency || 'usd').toUpperCase();
        const providerPaymentId = (session.payment_intent as string) || session.id;

        try {
          const retroactiveOrder = await db.paymentOrder.create({
            data: {
              userId: session.metadata.user_id,
              provider: 'stripe',
              providerOrderId: session.id,
              providerPaymentId,
              amount,
              currency,
              plan,
              billingCycle,
              status: 'pending',
              subtotal: amount,
              taxRate: 0,
              taxAmount: 0,
            },
          });

          const fulfilled = await fulfillLatePayment(
            session.metadata.user_id,
            retroactiveOrder.id,
            providerPaymentId,
            'retroactive checkout session reconciliation'
          );
          if (fulfilled) {
            outcome.lateFulfillments++;
            outcome.lateFulfillmentDetails.push({
              paymentId: providerPaymentId,
              orderId: retroactiveOrder.id,
              userId: session.metadata.user_id,
            });
          } else {
            outcome.errors++;
          }
        } catch (err) {
          outcome.errors++;
          console.error(`[PaymentReconciliation] Error creating/fulfilling retroactive order for session ${session.id}:`, err);
        }
      }
    }
  } catch (error) {
    outcome.errors++;
    console.error('[PaymentReconciliation] Stripe reconciliation error:', error);
  }

  return outcome;
}

// ────────────────────────────────────────────────────────────────────
// Razorpay reconciliation — for every pending Razorpay order older than
// 15 minutes, ask Razorpay whether the order was actually paid.
// ────────────────────────────────────────────────────────────────────
async function reconcileRazorpay(): Promise<ReconciliationOutcome> {
  const outcome: ReconciliationOutcome = {
    ordersChecked: 0,
    alreadyFulfilled: 0,
    lateFulfillments: 0,
    errors: 0,
    lateFulfillmentDetails: [],
  };

  try {
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const staleOrders = await db.paymentOrder.findMany({
      where: {
        provider: 'razorpay',
        status: 'pending',
        createdAt: { lt: fifteenMinutesAgo },
        // Only orders that have a gateway order id (subscription-checkout
        // orders without one are handled via the subscription webhooks).
        providerOrderId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    outcome.ordersChecked = staleOrders.length;

    for (const order of staleOrders) {
      try {
        const payments = await razorpay.orders.fetchPayments(order.providerOrderId!);
        const items = (payments as { items?: Array<{ id: string; status: string }> }).items || [];
        const captured = items.find((p) => p.status === 'captured' || p.status === 'authorized');

        if (!captured) continue; // never paid — stays pending for the user to retry

        const existingCompleted = await db.paymentOrder.findFirst({
          where: { id: order.id, status: 'completed' },
        });
        if (existingCompleted) {
          outcome.alreadyFulfilled++;
          continue;
        }

        const fulfilled = await fulfillLatePayment(
          order.userId,
          order.id,
          captured.id,
          'razorpay payment reconciliation'
        );
        if (fulfilled) {
          outcome.lateFulfillments++;
          outcome.lateFulfillmentDetails.push({
            paymentId: captured.id,
            orderId: order.id,
            userId: order.userId,
          });
        } else {
          outcome.errors++;
        }
      } catch (orderErr) {
        outcome.errors++;
        console.error(`[PaymentReconciliation] Razorpay reconciliation error for order ${order.id}:`, orderErr);
      }
    }
  } catch (error) {
    outcome.errors++;
    console.error('[PaymentReconciliation] Razorpay reconciliation error:', error);
  }

  return outcome;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET || 'acquisitionos-cron-dev';
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const razorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

  if (!stripeKey && !razorpayConfigured) {
    return NextResponse.json({ success: true, message: 'No payment gateways configured, skipping' });
  }

  const stripeResult = stripeKey
    ? await reconcileStripe(stripeKey)
    : { skipped: true, reason: 'Stripe not configured' };
  const razorpayResult = razorpayConfigured
    ? await reconcileRazorpay()
    : { skipped: true, reason: 'Razorpay not configured' };

  const lateFulfillments =
    (('lateFulfillments' in stripeResult && stripeResult.lateFulfillments) || 0) +
    (('lateFulfillments' in razorpayResult && razorpayResult.lateFulfillments) || 0);

  // Notify admins when any late fulfillments were found (either gateway)
  if (lateFulfillments > 0) {
    try {
      const admins = await db.user.findMany({
        where: { role: 'owner' },
        select: { id: true },
        take: 5,
      });

      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            type: 'system_alert',
            title: 'Late Payment Fulfillments Detected',
            message: `Payment reconciliation found ${lateFulfillments} payment(s) that were charged but not fulfilled. These have now been processed.`,
            actionUrl: '/dashboard',
          },
        });
      }
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json({
    success: true,
    stripe: stripeResult,
    razorpay: razorpayResult,
    lateFulfillments,
    timestamp: new Date().toISOString(),
  });
}
