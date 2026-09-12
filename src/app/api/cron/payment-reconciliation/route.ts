// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/cron/payment-reconciliation
// Runs every 6 hours to reconcile missed Stripe payments.
// Queries Stripe for successful payments in the last 24 hours,
// checks if they exist in the local DB, and fulfills any that
// were missed (e.g., server was down during webhook delivery).
// Protected by CRON_SECRET header.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET || 'acquisitionos-cron-dev';
  const authHeader = request.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ success: true, message: 'Stripe not configured, skipping' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey as never);

    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    // Query Stripe for all successful payment intents in the last 24 hours
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: twentyFourHoursAgo },
    });

    let lateFulfillments = 0;
    let alreadyFulfilled = 0;
    let errors = 0;
    const lateFulfillmentDetails: Array<{ paymentIntentId: string; orderId: string; userId: string }> = [];

    for (const pi of paymentIntents.data) {
      if (pi.status !== 'succeeded') continue;

      // Check if this payment intent is already fulfilled in our DB
      const existingOrder = await db.paymentOrder.findFirst({
        where: {
          providerPaymentId: pi.id,
          status: 'completed',
        },
      });

      if (existingOrder) {
        alreadyFulfilled++;
        continue;
      }

      // Find pending order by payment intent ID
      const pendingOrder = await db.paymentOrder.findFirst({
        where: {
          providerPaymentId: pi.id,
          status: 'pending',
        },
      });

      if (pendingOrder) {
        try {
          const result = await confirmPaymentAndActivate(
            pendingOrder.userId,
            pendingOrder.id,
            pi.id
          );

          if (result.success) {
            lateFulfillments++;

            // Log late fulfillment
            await logBillingEvent({
              userId: pendingOrder.userId,
              action: 'late_fulfillment',
              details: `Late fulfillment for order ${pendingOrder.id} via payment reconciliation cron`,
              metadata: {
                paymentIntentId: pi.id,
                orderId: pendingOrder.id,
                amount: pi.amount / 100,
                currency: pi.currency,
              },
            });

            // Generate invoice PDF
            try {
              const pdfResult = await generateInvoicePdf(pendingOrder.id);
              if (pdfResult.success) {
                console.log(`[PaymentReconciliation] ✓ Late invoice PDF generated: ${pdfResult.pdfUrl}`);
              }
            } catch (pdfErr) {
              console.error('[PaymentReconciliation] ✗ Late invoice PDF error:', pdfErr);
            }

            // Send invoice email
            try {
              const emailResult = await sendInvoiceEmail(pendingOrder.userId, pendingOrder.id);
              if (emailResult?.sent) {
                console.log(`[PaymentReconciliation] ✓ Late invoice email sent to user ${pendingOrder.userId}`);
              }
            } catch (emailErr) {
              console.error('[PaymentReconciliation] ✗ Late invoice email error:', emailErr);
            }

            lateFulfillmentDetails.push({
              paymentIntentId: pi.id,
              orderId: pendingOrder.id,
              userId: pendingOrder.userId,
            });
          } else {
            errors++;
            console.error(`[PaymentReconciliation] Failed to fulfill order ${pendingOrder.id}:`, result.error);
          }
        } catch (err) {
          errors++;
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

    for (const session of checkoutSessions.data) {
      // Only process paid sessions
      if (session.payment_status !== 'paid') continue;

      // Check if this session is already fulfilled in our DB
      const existingOrder = await db.paymentOrder.findFirst({
        where: {
          OR: [
            { providerOrderId: session.id, status: 'completed' },
            { providerPaymentId: session.payment_intent?.toString(), status: 'completed' },
          ],
        },
      });

      if (existingOrder) {
        alreadyFulfilled++;
        continue;
      }

      // Try to find a pending order for this session
      const pendingOrder = await db.paymentOrder.findFirst({
        where: {
          OR: [
            { providerOrderId: session.id, status: 'pending' },
            { providerPaymentId: session.payment_intent?.toString(), status: 'pending' },
          ],
        },
      });

      if (pendingOrder) {
        // Fulfill the pending order
        try {
          const providerPaymentId = (session.payment_intent as string) || session.id;
          const result = await confirmPaymentAndActivate(
            pendingOrder.userId,
            pendingOrder.id,
            providerPaymentId
          );

          if (result.success) {
            lateFulfillments++;

            // Log late fulfillment
            await logBillingEvent({
              userId: pendingOrder.userId,
              action: 'late_fulfillment',
              details: `Late fulfillment for order ${pendingOrder.id} via checkout session reconciliation`,
              metadata: {
                sessionId: session.id,
                paymentIntentId: session.payment_intent?.toString(),
                orderId: pendingOrder.id,
                amount: (session.amount_total || 0) / 100,
                currency: session.currency,
              },
            });

            // Generate invoice PDF
            try {
              const pdfResult = await generateInvoicePdf(pendingOrder.id);
              if (pdfResult.success) {
                console.log(`[PaymentReconciliation] ✓ Late invoice PDF generated (session): ${pdfResult.pdfUrl}`);
              }
            } catch (pdfErr) {
              console.error('[PaymentReconciliation] ✗ Late invoice PDF error (session):', pdfErr);
            }

            // Send invoice email
            try {
              const emailResult = await sendInvoiceEmail(pendingOrder.userId, pendingOrder.id);
              if (emailResult?.sent) {
                console.log(`[PaymentReconciliation] ✓ Late invoice email sent (session) to user ${pendingOrder.userId}`);
              }
            } catch (emailErr) {
              console.error('[PaymentReconciliation] ✗ Late invoice email error (session):', emailErr);
            }

            lateFulfillmentDetails.push({
              paymentIntentId: session.payment_intent?.toString() || session.id,
              orderId: pendingOrder.id,
              userId: pendingOrder.userId,
            });
          } else {
            errors++;
            console.error(`[PaymentReconciliation] Failed to fulfill order ${pendingOrder.id} (session):`, result.error);
          }
        } catch (err) {
          errors++;
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

          const result = await confirmPaymentAndActivate(
            session.metadata.user_id,
            retroactiveOrder.id,
            providerPaymentId
          );

          if (result.success) {
            lateFulfillments++;

            await logBillingEvent({
              userId: session.metadata.user_id,
              action: 'late_fulfillment',
              details: `Retroactive order ${retroactiveOrder.id} created and fulfilled via checkout session reconciliation`,
              metadata: {
                sessionId: session.id,
                paymentIntentId: session.payment_intent?.toString(),
                orderId: retroactiveOrder.id,
                amount,
                currency,
                plan,
                billingCycle,
              },
            });

            // Generate invoice PDF
            try {
              const pdfResult = await generateInvoicePdf(retroactiveOrder.id);
              if (pdfResult.success) {
                console.log(`[PaymentReconciliation] ✓ Retroactive invoice PDF generated: ${pdfResult.pdfUrl}`);
              }
            } catch (pdfErr) {
              console.error('[PaymentReconciliation] ✗ Retroactive invoice PDF error:', pdfErr);
            }

            // Send invoice email
            try {
              const emailResult = await sendInvoiceEmail(session.metadata.user_id, retroactiveOrder.id);
              if (emailResult?.sent) {
                console.log(`[PaymentReconciliation] ✓ Retroactive invoice email sent to user ${session.metadata.user_id}`);
              }
            } catch (emailErr) {
              console.error('[PaymentReconciliation] ✗ Retroactive invoice email error:', emailErr);
            }

            lateFulfillmentDetails.push({
              paymentIntentId: providerPaymentId,
              orderId: retroactiveOrder.id,
              userId: session.metadata.user_id,
            });
          } else {
            errors++;
            console.error(`[PaymentReconciliation] Failed to fulfill retroactive order ${retroactiveOrder.id}:`, result.error);
          }
        } catch (err) {
          errors++;
          console.error(`[PaymentReconciliation] Error creating/fulfilling retroactive order for session ${session.id}:`, err);
        }
      }
    }

    // Send admin notification if any late fulfillments were found
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
      checked: paymentIntents.data.length,
      sessionsChecked: checkoutSessions.data.length,
      alreadyFulfilled,
      lateFulfillments,
      errors,
      lateFulfillmentDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PaymentReconciliation] Error:', error);
    return NextResponse.json(
      { error: 'Payment reconciliation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
