// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/webhook/stripe
// Handles Stripe payment webhooks:
//   - checkout.session.completed: Confirms payment, activates subscription, adds credits
//   - checkout.session.expired: Marks order as failed
//   - charge.refunded: Handles refunds, downgrades plan on full refund
//   - customer.subscription.updated: Syncs subscription changes from Stripe
//   - customer.subscription.deleted: Handles subscription cancellation
//   - invoice.payment_succeeded: Handles renewal payments
//   - invoice.payment_failed: Handles failed renewal payments
// Uses PaymentWebhook table for idempotency and confirmPaymentAndActivate
// from subscription-service for atomic subscription + credit updates.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { logPaymentEvent, logSubscriptionEvent, logCreditEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { incrementCouponUsage } from '@/lib/coupon-service';
import { resetMonthlyCredits } from '@/lib/credit-service';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';
import {
  notifyPaymentSuccess,
  notifyPaymentFailure,
  notifyRefundProcessed,
  notifySubscriptionRenewed,
  notifySubscriptionCancelling,
  notifySubscriptionExpired,
  notifyCreditAssigned,
  notifyChargebackReceived,
} from '@/lib/notification-service';
import { fulfillCreditAddon, isCreditAddonOrder } from '@/lib/credit-addon-fulfillment';
import logger from '@/lib/logger';
import { generateRequestId } from '@/lib/error-handler';
import { trackError, getErrorCounts } from '@/lib/observability/error-tracker';

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const webhookLogger = logger.createLogger({ service: 'stripe-webhook', requestId });
  const webhookStartTime = performance.now();

  webhookLogger.info('Stripe webhook request received', {
    source: 'stripe-webhook',
    requestId,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  try {
    const body = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    // Verify Stripe webhook signature if secret is configured
    // Detect placeholder secrets like "whsec_YOUR_STRIPE_WEBHOOK_SECRET"
    const isPlaceholderSecret = !process.env.STRIPE_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET.includes('YOUR_') ||
      process.env.STRIPE_WEBHOOK_SECRET === 'whsec_YOUR_STRIPE_WEBHOOK_SECRET';

    let event;
    if (!isPlaceholderSecret && process.env.STRIPE_WEBHOOK_SECRET && sigHeader) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
        event = stripe.webhooks.constructEvent(
          body,
          sigHeader,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        webhookLogger.error('Webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // In production, NEVER process webhooks without signature verification
      webhookLogger.fatal('Webhook signature verification required in production — STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook verification not configured — rejected in production' }, { status: 500 });
    } else {
      // Dev mode only — parse directly without verification
      try {
        event = JSON.parse(body);
      } catch {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
      }
      webhookLogger.warn('DEV MODE: Skipping signature verification. Configure STRIPE_WEBHOOK_SECRET for production.');
    }

    const eventType = event.type;
    const eventId = event.id || `stripe_${Date.now()}`;
    webhookLogger.info('Webhook event received', { eventType, eventId });

    // Idempotency check using PaymentWebhook table
    const existingWebhook = await db.paymentWebhook.findUnique({
      where: { eventId },
    });

    if (existingWebhook) {
      if (existingWebhook.processed) {
        return NextResponse.json({ success: true, message: 'Already processed' });
      }
      // If not processed but exists (errored before), continue processing
    }

    // Record webhook receipt
    await db.paymentWebhook.upsert({
      where: { eventId },
      create: {
        eventId,
        provider: 'stripe',
        eventType,
        payload: body,
        signature: sigHeader || null,
        processed: false,
      },
      update: {
        payload: body,
        signature: sigHeader || null,
      },
    });

    // ═══════════════════════════════════════════════════════════
    // Handle checkout.session.completed
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'checkout.session.completed') {
      const session = event.data.object;

      // Find the order — either by metadata.orderId or by providerOrderId
      let order: Awaited<ReturnType<typeof db.paymentOrder.findUnique>> = null;

      // First try: metadata contains order_id (snake_case as set by create-order)
      if (session.metadata?.order_id) {
        order = await db.paymentOrder.findUnique({
          where: { id: session.metadata.order_id },
        });
      }

      // Second try: find by providerOrderId (checkout session ID)
      if (!order && session.id) {
        order = await db.paymentOrder.findFirst({
          where: { providerOrderId: session.id },
        });
      }

      // Third try: find by user_id + plan + pending status
      if (!order && session.metadata?.user_id && session.metadata?.plan) {
        order = await db.paymentOrder.findFirst({
          where: {
            userId: session.metadata.user_id,
            plan: session.metadata.plan,
            status: 'pending',
            provider: 'stripe',
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      // PART 4 — metadata.type === 'credits' fallback: if the checkout
      // session carries credit add-on metadata but no DB order was found
      // (e.g. the order creation failed after the Stripe session was
      // created, or a manual session was minted), create the credit_addon
      // order retroactively so the standard fulfillment path can run.
      if (!order && session.metadata?.type === 'credits' && session.metadata?.userId) {
        const metaCreditAmount = parseInt(session.metadata.creditAmount || '0', 10);
        if (metaCreditAmount === 100 || metaCreditAmount === 500 || metaCreditAmount === 1000) {
          console.warn('[Stripe Webhook] No order found for credits session — creating retroactive credit_addon order:', session.id);
          order = await db.paymentOrder.create({
            data: {
              userId: session.metadata.userId,
              provider: 'stripe',
              amount: session.amount_total ? session.amount_total / 100 : 0,
              currency: (session.currency || 'inr').toUpperCase(),
              plan: 'credit_addon',
              billingCycle: 'one_time',
              status: 'pending',
              couponCode: `addon:credits_${metaCreditAmount}`,
              providerOrderId: session.id,
              isIndianUser: true,
            },
          });
        }
      }

      if (!order) {
        console.error('[Stripe Webhook] No matching payment order found for session:', session.id);
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processingError: 'No matching payment order found',
            paymentOrderId: null,
          },
        });
        trackError(new Error('No matching payment order found for checkout session'), {
          severity: 'warning',
          source: 'stripe-webhook',
          context: { eventType, eventId, sessionId: session.id, requestId },
        });
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (order.status === 'completed') {
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processed: true,
            processedAt: new Date(),
            paymentOrderId: order.id,
          },
        });
        return NextResponse.json({ success: true, message: 'Already processed' });
      }

      // Verify payment amount matches order amount to prevent amount manipulation.
      // Exception: when a Stripe promotion code / coupon was applied on the
      // hosted checkout page (session.total_details.amount_discount > 0),
      // the session total is legitimately lower than the order's recorded
      // amount — reconcile the order to the actual charged amount instead
      // of rejecting the webhook.
      const sessionAmountTotal = session.amount_total ? session.amount_total / 100 : 0;
      const sessionDiscount = (session as unknown as {
        total_details?: { amount_discount?: number };
      })?.total_details?.amount_discount || 0;
      if (sessionAmountTotal > 0 && Math.abs(sessionAmountTotal - order.amount) > 0.01) {
        if (sessionDiscount > 0) {
          console.warn(
            `[Stripe Webhook] Amount differs by applied promotion (discount=${sessionDiscount / 100}). Reconciling order ${order.id}: ${order.amount} -> ${sessionAmountTotal}`
          );
          await db.paymentOrder.update({
            where: { id: order.id },
            data: {
              amount: sessionAmountTotal,
              subtotal: sessionAmountTotal,
              discountAmount: sessionDiscount / 100,
            },
          });
          order.amount = sessionAmountTotal;
        } else {
          console.error(`[Stripe Webhook] Amount mismatch: session=${sessionAmountTotal}, order=${order.amount}`);
          await db.paymentWebhook.update({
            where: { eventId },
            data: {
              processingError: `Amount mismatch: expected ${order.amount}, got ${sessionAmountTotal}`,
              paymentOrderId: order.id,
            },
          });
          return NextResponse.json({ error: 'Amount verification failed' }, { status: 400 });
        }
      }

      // PART 4 — defensive routing: if the session metadata says this is a
      // credit add-on but the DB order is a plan order (or vice versa),
      // trust the order record when it exists (it was created deliberately
      // by the checkout service); trust metadata when the order is missing.
      // The isCreditAddonOrder() check below already handles the standard
      // path — this block only re-routes mislabeled orders so credits are
      // never granted by the subscription activation path.
      // (No action needed here — routing happens at isCreditAddonOrder.)

      // Route: credit addon orders have a separate fulfillment path
      // that adds credits without changing the user's subscription plan.
      // confirmPaymentAndActivate() would incorrectly set plan='credit_addon'
      // and destroy the user's existing subscription.
      const providerPaymentId = session.payment_intent?.toString() || session.id;

      if (isCreditAddonOrder(order)) {
        const addonResult = await fulfillCreditAddon(order.userId, order.id, providerPaymentId);

        if (!addonResult.success) {
          console.error('[Stripe Webhook] Credit addon fulfillment failed:', addonResult.error);
          await db.paymentWebhook.update({
            where: { eventId },
            data: {
              processingError: addonResult.error || 'Failed to fulfill credit addon',
              paymentOrderId: order.id,
            },
          });
          return NextResponse.json({ error: 'Credit addon fulfillment failed' }, { status: 500 });
        }

        // In-app notification: "₹X credits added to your account"
        // (matches the user's spec — uses the rupee amount paid, not just the
        // raw credit count, so the user sees the monetary value too).
        await notifyCreditAssigned({
          userId: order.userId,
          credits: addonResult.creditsAdded || 0,
          newBalance: addonResult.newBalance || 0,
          source: 'Credit addon purchase',
          description: order.amount > 0
            ? `₹${order.amount.toLocaleString('en-IN')} paid — ${addonResult.creditsAdded || 0} credits added to your account.`
            : `${addonResult.creditsAdded || 0} credits added to your account.`,
        });

        // Email confirmation — fire-and-forget, never blocks the webhook 200.
        // Uses the existing email service (sendEmail + baseHtml template).
        try {
          const { sendCreditAddonConfirmationEmail } = await import('@/lib/email');
          const userForEmail = await db.user.findUnique({
            where: { id: order.userId },
            select: { email: true, name: true },
          });
          if (userForEmail) {
            void sendCreditAddonConfirmationEmail({
              to: userForEmail.email,
              name: userForEmail.name,
              credits: addonResult.creditsAdded || 0,
              amount: order.amount,
              currency: order.currency,
              newBalance: addonResult.newBalance || 0,
              orderId: order.id,
            }).catch((err) => {
              console.error('[Stripe Webhook] Credit addon confirmation email failed:', err);
            });
          }
        } catch (emailImportErr) {
          console.error('[Stripe Webhook] Could not send credit addon confirmation email:', emailImportErr);
        }

        // FIX 4: Generate a PDF invoice and send it to the user with the
        // invoice attached — same flow as subscription orders. This runs
        // after fulfillCreditAddon has marked the order as completed, so
        // generateInvoicePdf can fetch the completed order. Errors here
        // never block the webhook 200.
        try {
          console.log(`[Stripe Webhook] Starting invoice PDF generation for credit addon order ${order.id}...`);
          const pdfResult = await generateInvoicePdf(order.id);
          if (pdfResult.success) {
            console.log(`[Stripe Webhook] ✓ PDF invoice generated: ${pdfResult.pdfUrl}`);
          } else {
            console.error('[Stripe Webhook] ✗ PDF generation failed:', pdfResult.error);
          }
        } catch (pdfErr) {
          console.error('[Stripe Webhook] ✗ Invoice PDF generation error:', pdfErr);
        }

        try {
          console.log(`[Stripe Webhook] Sending invoice email to user ${order.userId} for credit addon order ${order.id}...`);
          const emailResult = await sendInvoiceEmail(order.userId, order.id);
          if (emailResult?.sent) {
            console.log(`[Stripe Webhook] ✓ Invoice email sent to user ${order.userId}`);
          } else {
            console.error('[Stripe Webhook] ✗ Invoice email failed:', emailResult?.error);
          }
        } catch (emailErr) {
          console.error('[Stripe Webhook] ✗ Invoice email error:', emailErr);
        }

        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processed: true,
            processedAt: new Date(),
            paymentOrderId: order.id,
          },
        });

        // Skip the rest of checkout.session.completed processing
      } else {
        // Standard subscription/plan purchase — use confirmPaymentAndActivate
        const result = await confirmPaymentAndActivate(
          order.userId,
          order.id,
          providerPaymentId
        );

        if (!result.success) {
          console.error('[Stripe Webhook] confirmPaymentAndActivate failed:', result.error);
          await db.paymentWebhook.update({
            where: { eventId },
            data: {
              processingError: result.error || 'Failed to confirm payment',
              paymentOrderId: order.id,
            },
          });
          return NextResponse.json({ error: 'Payment activation failed' }, { status: 500 });
        }

        // Increment coupon usage now that payment has succeeded
        if (order.couponCode) {
          try {
            await incrementCouponUsage(order.couponCode);
          } catch (couponErr) {
            // Non-critical — don't block the main flow
            console.error('[Stripe Webhook] Failed to increment coupon usage (non-critical):', couponErr);
          }
        }

        // Update subscription with Stripe-specific fields
        const subscription = await db.subscription.findFirst({
          where: { userId: order.userId, status: 'active' },
        });

        if (subscription && session.subscription) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              stripeSubscriptionId: session.subscription.toString(),
              stripeCustomerId: session.customer?.toString() || null,
            },
          });
        }

        // Generate PDF invoice + create Invoice DB record + send email (BLOCKING)
        try {
          console.log(`[Stripe Webhook] Starting invoice PDF generation for order ${order.id}...`);
          const pdfResult = await generateInvoicePdf(order.id);
          if (pdfResult.success) {
            console.log(`[Stripe Webhook] ✓ PDF invoice generated: ${pdfResult.pdfUrl}`);
          } else {
            console.error('[Stripe Webhook] ✗ PDF generation failed:', pdfResult.error);
          }
        } catch (pdfErr) {
          console.error('[Stripe Webhook] ✗ Invoice PDF generation error (will retry email without PDF):', pdfErr);
        }

        // Send invoice email (with or without PDF attachment)
        try {
          console.log(`[Stripe Webhook] Sending invoice email to user ${order.userId}...`);
          const emailResult = await sendInvoiceEmail(order.userId, order.id);
          if (emailResult?.sent) {
            console.log(`[Stripe Webhook] ✓ Invoice email sent to user ${order.userId}`);
          } else {
            console.error('[Stripe Webhook] ✗ Invoice email failed:', emailResult?.error);
          }
        } catch (emailErr) {
          console.error('[Stripe Webhook] ✗ Invoice email error:', emailErr);
        }

        // Create a notification for the user
        const planCredits = PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free;
        await notifyPaymentSuccess({
          userId: order.userId,
          plan: order.plan,
          amount: order.amount,
          currency: order.currency,
          creditsAdded: planCredits,
          orderId: order.id,
        });

        // Log the payment completion
        await logPaymentEvent(order.userId, 'payment_completed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'stripe',
          plan: order.plan,
          paymentOrderId: order.id,
        });

        // Mark webhook as processed
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processed: true,
            processedAt: new Date(),
            paymentOrderId: order.id,
          },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Handle checkout.session.expired
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'checkout.session.expired') {
      const session = event.data.object;

      // Find the order (metadata uses snake_case as set by create-order)
      let order: Awaited<ReturnType<typeof db.paymentOrder.findUnique>> = null;
      if (session.metadata?.order_id) {
        order = await db.paymentOrder.findUnique({ where: { id: session.metadata.order_id } });
      }
      if (!order && session.id) {
        order = await db.paymentOrder.findFirst({ where: { providerOrderId: session.id } });
      }

      if (order && order.status === 'pending') {
        await db.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'failed' },
        });

        await notifyPaymentFailure({
          userId: order.userId,
          plan: order.plan,
          reason: 'Checkout session expired',
          amount: order.amount,
          currency: order.currency,
        });

        await logPaymentEvent(order.userId, 'payment_failed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'stripe',
          plan: order.plan,
          paymentOrderId: order.id,
          reason: 'Checkout session expired',
        });
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: {
          processed: true,
          processedAt: new Date(),
          paymentOrderId: order?.id || null,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle charge.refunded
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent?.toString();

      if (!paymentIntentId) {
        console.error('[Stripe Webhook] charge.refunded: No payment_intent on charge');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No payment_intent on charge', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Find the payment order by providerPaymentId (which stores the payment_intent)
      const order = await db.paymentOrder.findFirst({
        where: { providerPaymentId: paymentIntentId },
      });

      if (!order) {
        console.error('[Stripe Webhook] charge.refunded: No matching order for payment_intent:', paymentIntentId);
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No matching payment order found', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Idempotency: skip if already refunded
      if (order.status === 'refunded') {
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date(), paymentOrderId: order.id },
        });
        return NextResponse.json({ success: true, message: 'Already processed' });
      }

      // Determine if this is a full or partial refund
      const refundAmount = charge.amount_refunded ? charge.amount_refunded / 100 : order.amount;
      const isFullRefund = refundAmount >= order.amount;

      // Update order status
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'refunded' },
      });

      // Handle refund based on order type
      if (isCreditAddonOrder(order)) {
        // ═══════════════════════════════════════════════════════════
        // Credit addon refund — reverse the addon credits
        // ═══════════════════════════════════════════════════════════
        if (isFullRefund) {
          // Determine addon credits to reverse
          const addonId = order.couponCode?.startsWith('addon:') ? order.couponCode.slice(6) : null;
          const { CREDIT_ADDONS } = await import('@/app/api/payments/credit-addons/route');
          const addon = addonId ? CREDIT_ADDONS.find(a => a.id === addonId) : null;
          const creditsToReverse = addon?.credits || 0;

          if (creditsToReverse > 0) {
            const user = await db.user.findUnique({
              where: { id: order.userId },
              select: { credits: true },
            });

            if (user) {
              const creditsToDeduct = Math.min(creditsToReverse, user.credits);
              const newBalance = user.credits - creditsToDeduct;

              await db.user.update({
                where: { id: order.userId },
                data: { credits: newBalance },
              });

              await db.creditsLedger.create({
                data: {
                  userId: order.userId,
                  action: 'addon_refund_reversal',
                  credits: -creditsToDeduct,
                  balance: newBalance,
                  description: `Reversed ${creditsToDeduct} addon credits due to full refund (addon: ${addonId})`,
                  referenceId: order.id,
                },
              });
            }
          }
        }
      } else if (isFullRefund) {
        // ═══════════════════════════════════════════════════════════
        // Subscription/plan refund — downgrade to free and adjust credits
        // ═══════════════════════════════════════════════════════════
        const subscription = await db.subscription.findFirst({
          where: { userId: order.userId, status: { in: ['active', 'trialing', 'past_due'] } },
        });

        if (subscription) {
          const previousPlan = subscription.plan;
          await db.subscription.update({
            where: { id: subscription.id },
            data: { status: 'expired', plan: 'free' },
          });

          await logSubscriptionEvent(order.userId, 'subscription_expired', {
            fromPlan: previousPlan,
            toPlan: 'free',
            fromStatus: subscription.status,
            toStatus: 'expired',
          });
        }

        // Downgrade user to free plan and reset credits
        const freeCredits = PLAN_CREDITS.free;
        // Calculate the credit amount that was granted for this plan (not monetary amount)
        const planCreditsGranted = PLAN_CREDITS[order.plan as PlanType] || 0;

        await db.user.update({
          where: { id: order.userId },
          data: {
            plan: 'free',
            isTrial: false,
            credits: freeCredits,
            creditsMonthly: freeCredits,
            rolloverCredits: 0,
          },
        });

        // Create credit ledger entry with correct credit amount (not monetary)
        await db.creditsLedger.create({
          data: {
            userId: order.userId,
            action: 'refund_adjustment',
            credits: -planCreditsGranted,
            balance: freeCredits,
            description: `Credits adjusted due to full refund for ${order.plan} plan order (${planCreditsGranted} credits reversed)`,
            referenceId: order.id,
          },
        });

        await logCreditEvent(order.userId, 'credits_refunded', {
          amount: planCreditsGranted,
          balance: freeCredits,
          source: 'stripe_refund',
          referenceId: order.id,
        });
      }

      // Create notification for the user
      await notifyRefundProcessed({
        userId: order.userId,
        plan: order.plan,
        refundAmount,
        currency: order.currency,
        isFullRefund,
        orderId: order.id,
      });

      // Log the refund event
      await logPaymentEvent(order.userId, 'payment_refunded', {
        amount: refundAmount,
        currency: order.currency,
        provider: 'stripe',
        plan: order.plan,
        paymentOrderId: order.id,
        reason: isFullRefund ? 'Full refund' : 'Partial refund',
      });

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), paymentOrderId: order.id },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle customer.subscription.updated
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'customer.subscription.updated') {
      const stripeSub = event.data.object;
      const stripeSubscriptionId = stripeSub.id?.toString();

      if (!stripeSubscriptionId) {
        console.error('[Stripe Webhook] customer.subscription.updated: No subscription ID');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription ID on event', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { stripeSubscriptionId },
      });

      if (!subscription) {
        console.error('[Stripe Webhook] customer.subscription.updated: No matching subscription for stripeSubscriptionId:', stripeSubscriptionId);
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No matching subscription found', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Map Stripe status to our status
      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'expired',
        incomplete: 'past_due',
        incomplete_expired: 'expired',
        paused: 'canceled',
      };
      const newStatus = statusMap[stripeSub.status] || subscription.status;

      // Determine plan from Stripe price/product metadata or items
      // Stripe subscription items contain price info; use metadata.plan if available
      let newPlan = subscription.plan;
      if (stripeSub.metadata?.plan) {
        newPlan = stripeSub.metadata.plan;
      } else if (stripeSub.plan?.metadata?.plan) {
        newPlan = stripeSub.plan.metadata.plan;
      }

      const previousPlan = subscription.plan;
      const previousStatus = subscription.status;

      // Update subscription
      const updateData: Record<string, unknown> = {
        status: newStatus,
        plan: newPlan,
      };

      if (stripeSub.current_period_start) {
        updateData.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
      }
      if (stripeSub.current_period_end) {
        updateData.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
      }
      if (typeof stripeSub.cancel_at_period_end === 'boolean') {
        updateData.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
      }

      await db.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      // If plan changed, update user record
      if (newPlan !== previousPlan) {
        const planCredits = PLAN_CREDITS[newPlan as PlanType] || PLAN_CREDITS.free;
        await db.user.update({
          where: { id: subscription.userId },
          data: { plan: newPlan, creditsMonthly: planCredits },
        });
      }

      // Notify user when subscription is scheduled for cancellation
      if (typeof stripeSub.cancel_at_period_end === 'boolean') {
        const wasCancelling = subscription.cancelAtPeriodEnd === true;
        const isNowCancelling = stripeSub.cancel_at_period_end === true;
        if (!wasCancelling && isNowCancelling && stripeSub.current_period_end) {
          const endDate = new Date(stripeSub.current_period_end * 1000).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          });
          await notifySubscriptionCancelling({
            userId: subscription.userId,
            plan: subscription.plan,
            endDate,
          });
        }
      }

      // Log the subscription update
      await logSubscriptionEvent(subscription.userId, 'plan_change_processed', {
        fromPlan: previousPlan,
        toPlan: newPlan,
        fromStatus: previousStatus,
        toStatus: newStatus,
      });

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle customer.subscription.deleted
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'customer.subscription.deleted') {
      const stripeSub = event.data.object;
      const stripeSubscriptionId = stripeSub.id?.toString();

      if (!stripeSubscriptionId) {
        console.error('[Stripe Webhook] customer.subscription.deleted: No subscription ID');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription ID on event', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { stripeSubscriptionId },
      });

      if (!subscription) {
        console.error('[Stripe Webhook] customer.subscription.deleted: No matching subscription for stripeSubscriptionId:', stripeSubscriptionId);
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No matching subscription found', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Idempotency: skip if already expired
      if (subscription.status === 'expired') {
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true, message: 'Already processed' });
      }

      const previousPlan = subscription.plan;
      const previousStatus = subscription.status;

      // Set subscription status to expired
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });

      // Downgrade user to free plan and reset credits
      const freeCredits = PLAN_CREDITS.free;
      await db.user.update({
        where: { id: subscription.userId },
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
          userId: subscription.userId,
          action: 'subscription_cancelled',
          credits: freeCredits,
          balance: freeCredits,
          description: `Subscription cancelled — credits reset to free tier (${freeCredits})`,
          referenceId: subscription.id,
        },
      });

      // Create notification
      await notifySubscriptionExpired({
        userId: subscription.userId,
        previousPlan,
        reason: 'Subscription cancelled',
      });

      // Log the event
      await logSubscriptionEvent(subscription.userId, 'subscription_expired', {
        fromPlan: previousPlan,
        toPlan: 'free',
        fromStatus: previousStatus,
        toStatus: 'expired',
      });

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle invoice.payment_succeeded (renewal)
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const stripeSubscriptionId = invoice.subscription?.toString();

      // Only process if this is tied to a subscription (not a one-time payment)
      if (!stripeSubscriptionId) {
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { stripeSubscriptionId },
      });

      if (!subscription) {
        console.error('[Stripe Webhook] invoice.payment_succeeded: No matching subscription for stripeSubscriptionId:', stripeSubscriptionId);
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No matching subscription found', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Cross-event dedup: skip credit reset if period already matches
      // (invoice.payment_succeeded and invoice.paid can both fire for the same renewal)
      const incomingPeriodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null;
      const existingPeriodStart = subscription.currentPeriodStart;
      const periodsMatch = incomingPeriodStart && existingPeriodStart &&
        Math.abs(incomingPeriodStart.getTime() - existingPeriodStart.getTime()) < 5000;

      if (!periodsMatch) {
        // Reset credits for the new billing period only if not already done
        await resetMonthlyCredits(subscription.userId, subscription.plan as PlanType);
      } else {
        console.log(`[Stripe Webhook] invoice.payment_succeeded: Skipping credit reset — period_start already matches (${incomingPeriodStart?.toISOString()})`);
      }

      // Update period dates
      const updateData: Record<string, unknown> = {};
      if (invoice.period_start) {
        updateData.currentPeriodStart = new Date(invoice.period_start * 1000);
      }
      if (invoice.period_end) {
        updateData.currentPeriodEnd = new Date(invoice.period_end * 1000);
      }
      // Ensure subscription is active after successful renewal
      updateData.status = 'active';

      await db.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      // Log the renewal
      await logPaymentEvent(subscription.userId, 'payment_completed', {
        amount: invoice.total ? invoice.total / 100 : 0,
        currency: invoice.currency || 'usd',
        provider: 'stripe',
        plan: subscription.plan,
        reason: 'Subscription renewal payment',
      });

      // Create notification for renewal
      const renewalCredits = PLAN_CREDITS[subscription.plan as PlanType] || PLAN_CREDITS.free;
      await notifySubscriptionRenewed({
        userId: subscription.userId,
        plan: subscription.plan,
        amount: invoice.total ? invoice.total / 100 : undefined,
        currency: invoice.currency || 'usd',
        creditsReset: renewalCredits,
        nextBillingDate: invoice.period_end
          ? new Date(invoice.period_end * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : undefined,
      });

      // Try to find associated payment order and generate invoice PDF + email
      try {
        const renewalOrder = await db.paymentOrder.findFirst({
          where: {
            userId: subscription.userId,
            plan: subscription.plan,
            status: 'completed',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (renewalOrder) {
          // Generate renewal invoice PDF (blocking)
          const pdfResult = await generateInvoicePdf(renewalOrder.id);
          if (pdfResult.success) {
            console.log(`[Stripe Webhook] ✓ Renewal invoice PDF generated: ${pdfResult.pdfUrl}`);
          }
          // Send renewal invoice email
          const emailResult = await sendInvoiceEmail(subscription.userId, renewalOrder.id);
          if (emailResult?.sent) {
            console.log(`[Stripe Webhook] ✓ Renewal invoice email sent to user ${subscription.userId}`);
          }
        }
      } catch (invoiceErr) {
        console.error('[Stripe Webhook] Renewal invoice generation failed (non-critical):', invoiceErr);
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle invoice.payment_failed
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const stripeSubscriptionId = invoice.subscription?.toString();

      // Only process if this is tied to a subscription
      if (!stripeSubscriptionId) {
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { stripeSubscriptionId },
      });

      if (!subscription) {
        console.error('[Stripe Webhook] invoice.payment_failed: No matching subscription for stripeSubscriptionId:', stripeSubscriptionId);
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No matching subscription found', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Set subscription status to past_due
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due' },
      });

      // Create notification for the user
      await notifyPaymentFailure({
        userId: subscription.userId,
        plan: subscription.plan,
        reason: 'Renewal payment failed',
        amount: invoice.total ? invoice.total / 100 : undefined,
        currency: invoice.currency || 'usd',
      });

      // Log the event
      await logSubscriptionEvent(subscription.userId, 'subscription_past_due', {
        fromStatus: subscription.status,
        toStatus: 'past_due',
      });

      await logPaymentEvent(subscription.userId, 'payment_failed', {
        amount: invoice.total ? invoice.total / 100 : 0,
        currency: invoice.currency || 'usd',
        provider: 'stripe',
        plan: subscription.plan,
        reason: 'Renewal payment failed',
      });

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle charge.dispute.created (chargeback)
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'charge.dispute.created') {
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent?.toString();
      const chargeId = dispute.charge?.toString();

      console.error(`[Stripe Webhook] ⚠️ CHARGEBACK received: ${dispute.id} for payment_intent=${paymentIntentId}, charge=${chargeId}, reason=${dispute.reason}, status=${dispute.status}`);

      // Try to find the associated payment order
      let order: Awaited<ReturnType<typeof db.paymentOrder.findFirst>> = null;
      if (paymentIntentId) {
        order = await db.paymentOrder.findFirst({
          where: { providerPaymentId: paymentIntentId },
        });
      }
      if (!order && chargeId) {
        // Fallback: search by charge ID in metadata or providerOrderId
        order = await db.paymentOrder.findFirst({
          where: { providerOrderId: chargeId },
        });
      }

      if (order) {
        // If dispute is won (unlikely on create, but handle it), no action needed
        // If dispute is lost or under review, take protective action
        const isLost = dispute.status === 'lost';
        const isUnderReview = dispute.status === 'needs_response' || dispute.status === 'under_review';

        if (isLost || isUnderReview) {
          // For lost disputes or under-review disputes:
          // 1. Mark the order as disputed
          await db.paymentOrder.update({
            where: { id: order.id },
            data: { status: isLost ? 'refunded' : order.status },
          });

          // 2. For lost disputes (chargeback confirmed), immediately downgrade
          if (isLost && !isCreditAddonOrder(order)) {
            const subscription = await db.subscription.findFirst({
              where: { userId: order.userId, status: { in: ['active', 'trialing', 'past_due'] } },
            });

            if (subscription) {
              const previousPlan = subscription.plan;
              await db.subscription.update({
                where: { id: subscription.id },
                data: { status: 'expired', plan: 'free' },
              });

              await logSubscriptionEvent(order.userId, 'subscription_expired', {
                fromPlan: previousPlan,
                toPlan: 'free',
                fromStatus: subscription.status,
                toStatus: 'expired',
                reason: 'chargeback',
              } as Parameters<typeof logSubscriptionEvent>[2]);
            }

            // Downgrade user to free plan
            const freeCredits = PLAN_CREDITS.free;
            await db.user.update({
              where: { id: order.userId },
              data: {
                plan: 'free',
                isTrial: false,
                credits: freeCredits,
                creditsMonthly: freeCredits,
                rolloverCredits: 0,
              },
            });

            // Create credit ledger entry
            const planCreditsGranted = PLAN_CREDITS[order.plan as PlanType] || 0;
            await db.creditsLedger.create({
              data: {
                userId: order.userId,
                action: 'chargeback_adjustment',
                credits: -planCreditsGranted,
                balance: freeCredits,
                description: `Credits revoked due to chargeback for ${order.plan} plan order`,
                referenceId: order.id,
              },
            });
          } else if (isLost && isCreditAddonOrder(order)) {
            // Reverse addon credits on lost chargeback
            const addonId = order.couponCode?.startsWith('addon:') ? order.couponCode.slice(6) : null;
            const { CREDIT_ADDONS } = await import('@/app/api/payments/credit-addons/route');
            const addon = addonId ? CREDIT_ADDONS.find(a => a.id === addonId) : null;
            const creditsToReverse = addon?.credits || 0;

            if (creditsToReverse > 0) {
              const user = await db.user.findUnique({
                where: { id: order.userId },
                select: { credits: true },
              });

              if (user) {
                const creditsToDeduct = Math.min(creditsToReverse, user.credits);
                const newBalance = user.credits - creditsToDeduct;

                await db.user.update({
                  where: { id: order.userId },
                  data: { credits: newBalance },
                });

                await db.creditsLedger.create({
                  data: {
                    userId: order.userId,
                    action: 'chargeback_addon_reversal',
                    credits: -creditsToDeduct,
                    balance: newBalance,
                    description: `Reversed ${creditsToDeduct} addon credits due to chargeback (addon: ${addonId})`,
                    referenceId: order.id,
                  },
                });
              }
            }
          }
        }

        // Notify the user about the chargeback
        await notifyChargebackReceived({
          userId: order.userId,
          plan: order.plan,
          amount: dispute.amount ? dispute.amount / 100 : order.amount,
          currency: dispute.currency?.toUpperCase() || order.currency,
          reason: dispute.reason || 'Unknown',
          chargebackId: dispute.id,
        });

        await logPaymentEvent(order.userId, 'chargeback_received' as Parameters<typeof logPaymentEvent>[1], {
          amount: dispute.amount ? dispute.amount / 100 : order.amount,
          currency: dispute.currency || order.currency,
          provider: 'stripe',
          plan: order.plan,
          paymentOrderId: order.id,
          disputeId: dispute.id,
          disputeStatus: dispute.status,
          disputeReason: dispute.reason,
        } as Parameters<typeof logPaymentEvent>[2]);
      } else {
        console.error(`[Stripe Webhook] charge.dispute.created: No matching order found for payment_intent=${paymentIntentId}, charge=${chargeId}`);
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // For unhandled events, just mark as processed
    const handledEvents = [
      'checkout.session.completed',
      'checkout.session.expired',
      'charge.refunded',
      'charge.dispute.created',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'payment_intent.succeeded',
    ];

    // ═══════════════════════════════════════════════════════════
    // Handle payment_intent.succeeded
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id?.toString();

      if (paymentIntentId) {
        // Find order by providerPaymentId and ensure it's marked completed
        const order = await db.paymentOrder.findFirst({
          where: { providerPaymentId: paymentIntentId },
        });

        if (order && order.status === 'pending') {
          // Route credit addon orders to the addon fulfillment path
          if (isCreditAddonOrder(order)) {
            const addonResult = await fulfillCreditAddon(order.userId, order.id, paymentIntentId);
            if (addonResult.success) {
              await notifyCreditAssigned({
                userId: order.userId,
                credits: addonResult.creditsAdded || 0,
                newBalance: addonResult.newBalance || 0,
                source: 'Credit addon purchase',
              });
            }
          } else {
            // Payment confirmed via payment_intent — activate subscription
            const result = await confirmPaymentAndActivate(
              order.userId,
              order.id,
              paymentIntentId
            );

            if (result.success) {
              // Generate invoice PDF + send email (BLOCKING to ensure delivery)
              try {
                const pdfResult = await generateInvoicePdf(order.id);
                if (pdfResult.success) {
                  console.log(`[Stripe Webhook] ✓ PDF invoice generated via payment_intent: ${pdfResult.pdfUrl}`);
                } else {
                  console.error('[Stripe Webhook] ✗ PDF generation failed via payment_intent:', pdfResult.error);
                }
              } catch (pdfErr) {
                console.error('[Stripe Webhook] ✗ Invoice PDF error (payment_intent):', pdfErr);
              }

              try {
                const emailResult = await sendInvoiceEmail(order.userId, order.id);
                if (emailResult?.sent) {
                  console.log(`[Stripe Webhook] ✓ Invoice email sent via payment_intent to user ${order.userId}`);
                } else {
                  console.error('[Stripe Webhook] ✗ Invoice email failed via payment_intent:', emailResult?.error);
                }
              } catch (emailErr) {
                console.error('[Stripe Webhook] ✗ Invoice email error (payment_intent):', emailErr);
              }

              // Notify payment success (fire-and-forget, won't duplicate checkout.session.completed)
              const piPlanCredits = PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free;
              await notifyPaymentSuccess({
                userId: order.userId,
                plan: order.plan,
                amount: order.amount,
                currency: order.currency,
                creditsAdded: piPlanCredits,
                orderId: order.id,
              });

              await logPaymentEvent(order.userId, 'payment_completed', {
                amount: order.amount,
                currency: order.currency,
                provider: 'stripe',
                plan: order.plan,
                paymentOrderId: order.id,
                source: 'payment_intent.succeeded',
              } as Parameters<typeof logPaymentEvent>[2]);
            }
          }
        }
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle customer.subscription.created
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'customer.subscription.created') {
      const stripeSub = event.data.object;
      const stripeSubscriptionId = stripeSub.id?.toString();
      const stripeCustomerId = stripeSub.customer?.toString();

      if (stripeSubscriptionId && stripeCustomerId) {
        // Find user's existing subscription and update with Stripe IDs
        const userId = stripeSub.metadata?.user_id;
        if (userId) {
          const subscription = await db.subscription.findFirst({
            where: { userId, status: { in: ['trialing', 'active', 'past_due'] } },
          });

          if (subscription) {
            await db.subscription.update({
              where: { id: subscription.id },
              data: {
                stripeSubscriptionId,
                stripeCustomerId,
              },
            });
          }
        }
      }

      await logSubscriptionEvent(stripeSub.metadata?.user_id || 'unknown', 'subscription_created_stripe' as Parameters<typeof logSubscriptionEvent>[1], {
        stripeSubscriptionId,
        status: stripeSub.status,
      } as Parameters<typeof logSubscriptionEvent>[2]);

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle invoice.paid
    // ═══════════════════════════════════════════════════════════
    if (eventType === 'invoice.paid') {
      const stripeInvoice = event.data.object;
      const stripeSubscriptionId = stripeInvoice.subscription?.toString();

      if (stripeSubscriptionId) {
        const subscription = await db.subscription.findFirst({
          where: { stripeSubscriptionId },
        });

        if (subscription) {
          // Cross-event dedup: skip credit reset if period already matches
          // (invoice.payment_succeeded and invoice.paid both fire for the same renewal)
          const incomingPeriodStart = stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000) : null;
          const existingPeriodStart = subscription.currentPeriodStart;
          const periodsMatch = incomingPeriodStart && existingPeriodStart &&
            Math.abs(incomingPeriodStart.getTime() - existingPeriodStart.getTime()) < 5000;

          if (!periodsMatch) {
            // Reset credits only if not already done by the other event
            await resetMonthlyCredits(subscription.userId, subscription.plan as PlanType);
          } else {
            console.log(`[Stripe Webhook] invoice.paid: Skipping credit reset — period_start already matches (${incomingPeriodStart?.toISOString()})`);
          }

          const updateData: Record<string, unknown> = { status: 'active' };
          if (stripeInvoice.period_start) {
            updateData.currentPeriodStart = new Date(stripeInvoice.period_start * 1000);
          }
          if (stripeInvoice.period_end) {
            updateData.currentPeriodEnd = new Date(stripeInvoice.period_end * 1000);
          }

          await db.subscription.update({
            where: { id: subscription.id },
            data: updateData,
          });

          // Log the invoice paid event
          await logPaymentEvent(subscription.userId, 'payment_completed', {
            amount: stripeInvoice.total ? stripeInvoice.total / 100 : 0,
            currency: stripeInvoice.currency || 'usd',
            provider: 'stripe',
            plan: subscription.plan,
            source: 'invoice.paid',
          } as Parameters<typeof logPaymentEvent>[2]);
        }
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }
    if (!handledEvents.includes(eventType)) {
      await db.paymentWebhook.update({
        where: { eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }

    const webhookDurationMs = Math.round(performance.now() - webhookStartTime);
    webhookLogger.info('Stripe webhook processed successfully', {
      eventId,
      eventType,
      webhookDurationMs,
      errorStatus: {
        recentCount: getErrorCounts().recentCount,
        criticalCount: getErrorCounts().criticalCount,
      },
    });

    return NextResponse.json({
      success: true,
      eventId,
      eventType,
      durationMs: webhookDurationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const webhookDurationMs = Math.round(performance.now() - webhookStartTime);

    trackError(error, {
      severity: 'critical',
      source: 'stripe-webhook',
      context: { webhookDurationMs, requestId, eventId: 'unknown' },
    });

    webhookLogger.error('Stripe webhook processing error', {
      webhookDurationMs,
      error: error instanceof Error ? error : new Error(String(error)),
    });
    console.error('[Stripe Webhook] Processing error:', error);
    await db.paymentWebhook.update({
      where: { eventId: 'unknown' },
      data: { processingError: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    return NextResponse.json({
      error: 'Webhook processing failed',
      durationMs: webhookDurationMs,
      errorStatus: {
        recentCount: getErrorCounts().recentCount,
        criticalCount: getErrorCounts().criticalCount,
      },
    }, { status: 500 });
  }
}
