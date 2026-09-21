// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/webhook/razorpay
// Handles Razorpay payment webhooks:
//   - payment.captured: Confirms payment, activates subscription, adds credits
//   - payment.failed: Marks order as failed, logs event
//   - refund.created / refund.processed: Handles refunds, downgrades plan
//   - subscription.cancelled: Handles Razorpay subscription cancellation
//   - subscription.charged: Handles Razorpay subscription renewal payment
// Uses PaymentWebhook table for idempotency and confirmPaymentAndActivate
// from subscription-service for atomic subscription + credit updates.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHmac, timingSafeEqual } from 'crypto';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { logPaymentEvent, logSubscriptionEvent, logCreditEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { incrementCouponUsage } from '@/lib/coupon-service';
import { resetMonthlyCredits } from '@/lib/credit-service';
import { fulfillCreditAddon, isCreditAddonOrder } from '@/lib/credit-addon-fulfillment';
import {
  notifyPaymentSuccess,
  notifyPaymentFailure,
  notifyRefundProcessed,
  notifySubscriptionExpired,
  notifyCreditAssigned,
} from '@/lib/notification-service';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    // Verify webhook signature using constant-time comparison to prevent timing attacks
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      // Use timing-safe comparison to prevent timing side-channel attacks
      const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuf = Buffer.from(signature, 'utf-8');
      if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
        console.warn('[Razorpay Webhook] Invalid signature — rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } else if (webhookSecret && !signature) {
      console.warn('[Razorpay Webhook] Missing signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    } else if (process.env.NODE_ENV === 'production') {
      // In production, webhooks MUST have signature verification
      console.error('[Razorpay Webhook] CRITICAL: No webhook secret configured in production');
      return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 });
    } else {
      console.warn('[Razorpay Webhook] No webhook secret configured — skipping signature verification (dev mode)');
    }

    const payload = JSON.parse(body);
    const event = payload.event;

    // Idempotency check using PaymentWebhook table
    const paymentId = payload.payload?.payment?.entity?.id;
    const eventId = `${event}_${paymentId || payload.id || Date.now()}`;

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
        provider: 'razorpay',
        eventType: event,
        payload: body,
        signature: signature || null,
        processed: false,
      },
      update: {
        payload: body,
        signature: signature || null,
      },
    });

    // ═══════════════════════════════════════════════════════════
    // Handle payment.captured
    // ═══════════════════════════════════════════════════════════
    if (event === 'payment.captured') {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      // Find the payment order by providerOrderId
      let order = orderId
        ? await db.paymentOrder.findFirst({
            where: { providerOrderId: orderId },
          })
        : null;

      // Fallback 1: if not found by providerOrderId, try to find by recent pending orders
      // This handles dev mode where providerOrderId may be a dev placeholder
      if (!order) {
        console.warn('[Razorpay Webhook] Order not found by providerOrderId, trying fallback lookup');
        // Try to find from the order notes or metadata
        const notes = paymentEntity.notes || {};
        const userId = notes.userId;
        const plan = notes.plan;

        if (userId && plan) {
          order = await db.paymentOrder.findFirst({
            where: {
              userId,
              plan,
              status: 'pending',
              provider: 'razorpay',
            },
            orderBy: { createdAt: 'desc' },
          });
        }
      }

      // Fallback 2: subscription charges (incl. the FIRST charge of a
      // recurring checkout) carry a subscription_id instead of our order id
      // in order_id. Resolve the order via providerSubscriptionId, then via
      // the subscription entity's notes.paymentOrderId.
      const paymentSubscriptionId: string | undefined =
        paymentEntity.subscription_id || payload.payload?.subscription?.entity?.id || undefined;
      if (!order && paymentSubscriptionId) {
        order = await db.paymentOrder.findFirst({
          where: { providerSubscriptionId: paymentSubscriptionId, provider: 'razorpay' },
          orderBy: { createdAt: 'desc' },
        });
        if (!order) {
          const subNotes = payload.payload?.subscription?.entity?.notes || {};
          const notedOrderId = subNotes.paymentOrderId;
          if (notedOrderId) {
            order = await db.paymentOrder.findUnique({ where: { id: notedOrderId } });
          }
        }
        if (order) {
          console.log('[Razorpay Webhook] Resolved subscription charge to payment order:', order.id);
        }
      }

      if (!order) {
        console.error('[Razorpay Webhook] No matching payment order found for orderId:', orderId);
        // Mark webhook as errored
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processingError: 'No matching payment order found',
            paymentOrderId: null,
          },
        });
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (order.status === 'completed') {
        // Already processed — mark webhook as processed
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

      // Verify payment amount matches order amount to prevent amount manipulation
      const razorpayAmount = paymentEntity.amount ? paymentEntity.amount / 100 : 0;
      if (razorpayAmount > 0 && Math.abs(razorpayAmount - order.amount) > 0.01) {
        console.error(`[Razorpay Webhook] Amount mismatch: payment=${razorpayAmount}, order=${order.amount}`);
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processingError: `Amount mismatch: expected ${order.amount}, got ${razorpayAmount}`,
            paymentOrderId: order.id,
          },
        });
        return NextResponse.json({ error: 'Amount verification failed' }, { status: 400 });
      }

      // Route: credit addon orders have a separate fulfillment path
      // that adds credits without changing the user's subscription plan.
      if (isCreditAddonOrder(order)) {
        const addonResult = await fulfillCreditAddon(order.userId, order.id, paymentEntity.id);

        if (!addonResult.success) {
          console.error('[Razorpay Webhook] Credit addon fulfillment failed:', addonResult.error);
          await db.paymentWebhook.update({
            where: { eventId },
            data: {
              processingError: addonResult.error || 'Failed to fulfill credit addon',
              paymentOrderId: order.id,
            },
          });
          return NextResponse.json({ error: 'Credit addon fulfillment failed' }, { status: 500 });
        }

        // Notify user of credit addon purchase
        await notifyCreditAssigned({
          userId: order.userId,
          credits: addonResult.creditsAdded || 0,
          newBalance: addonResult.newBalance || 0,
          source: 'Credit addon purchase',
        });

        // Log the payment completion
        await logPaymentEvent(order.userId, 'payment_completed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: 'credit_addon',
          paymentOrderId: order.id,
          creditsAdded: addonResult.creditsAdded,
        } as Parameters<typeof logPaymentEvent>[2]);

        // Mark webhook as processed
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processed: true,
            processedAt: new Date(),
            paymentOrderId: order.id,
          },
        });
      } else {
        // Standard subscription/plan purchase — use confirmPaymentAndActivate for atomic subscription + credit update.
        // Pass the gateway subscription id (when present) so the local
        // Subscription row is linked to the Razorpay subscription for
        // renewal/cancellation webhooks.
        const result = await confirmPaymentAndActivate(
          order.userId,
          order.id,
          paymentEntity.id,
          paymentSubscriptionId || undefined
        );

        if (!result.success) {
          console.error('[Razorpay Webhook] confirmPaymentAndActivate failed:', result.error);
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
            console.error('[Razorpay Webhook] Failed to increment coupon usage (non-critical):', couponErr);
          }
        }

        // Create invoice for the completed payment (non-blocking)
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
              ? [{ description: `Tax (${(order.taxRate * 100).toFixed(0)}%)`, amount: order.taxAmount, quantity: 1 }]
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
            update: {}, // Already exists
          });
        } catch (invoiceError) {
          // Invoice creation is non-critical — don't block the main flow
          console.error('[Razorpay Webhook] Invoice creation failed (non-critical):', invoiceError);
        }

        // Create a notification for the user using typed helper
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
          provider: 'razorpay',
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
    // Handle payment.failed
    // ═══════════════════════════════════════════════════════════
    if (event === 'payment.failed') {
      const paymentEntity = payload.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      // Find the payment order
      let order = await db.paymentOrder.findFirst({
        where: { providerOrderId: orderId },
      });

      if (!order) {
        const notes = paymentEntity.notes || {};
        const userId = notes.userId;
        const plan = notes.plan;

        if (userId && plan) {
          order = await db.paymentOrder.findFirst({
            where: {
              userId,
              plan,
              status: 'pending',
              provider: 'razorpay',
            },
            orderBy: { createdAt: 'desc' },
          });
        }
      }

      if (order && order.status === 'pending') {
        // Mark order as failed
        await db.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: 'failed',
            providerPaymentId: paymentEntity.id,
          },
        });

        // Create notification using typed helper
        await notifyPaymentFailure({
          userId: order.userId,
          plan: order.plan,
          reason: paymentEntity.error_description || 'Payment failed',
          amount: order.amount,
          currency: order.currency,
        });

        // Log the failure
        await logPaymentEvent(order.userId, 'payment_failed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: order.plan,
          paymentOrderId: order.id,
          reason: paymentEntity.error_description || 'Payment failed',
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
      } else {
        // No matching order found for failed payment — still mark webhook as processed
        await db.paymentWebhook.update({
          where: { eventId },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Handle refund.created / refund.processed
    // ═══════════════════════════════════════════════════════════
    if (event === 'refund.created' || event === 'refund.processed') {
      const refundEntity = payload.payload?.refund?.entity || payload.payload?.payment?.entity;
      if (!refundEntity) {
        console.error('[Razorpay Webhook] refund event: No refund entity in payload');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No refund entity in payload', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Find the payment order by the payment entity's order_id
      const orderId = refundEntity.order_id || refundEntity.receipt;
      let order: Awaited<ReturnType<typeof db.paymentOrder.findFirst>> = null;

      if (orderId) {
        order = await db.paymentOrder.findFirst({
          where: { providerOrderId: orderId },
        });
      }

      // Fallback: try by notes metadata
      if (!order) {
        const notes = refundEntity.notes || {};
        const userId = notes.userId;
        const plan = notes.plan;
        if (userId && plan) {
          order = await db.paymentOrder.findFirst({
            where: { userId, plan, status: { in: ['completed', 'pending'] }, provider: 'razorpay' },
            orderBy: { createdAt: 'desc' },
          });
        }
      }

      if (!order) {
        console.error('[Razorpay Webhook] refund event: No matching order found');
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

      // Determine refund amount and whether it's a full refund
      const refundAmount = refundEntity.amount ? refundEntity.amount / 100 : order.amount;
      const isFullRefund = refundAmount >= order.amount;

      // Update order status
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'refunded' },
      });

      // If full refund, handle credit adjustment and downgrade
      if (isFullRefund) {
        if (isCreditAddonOrder(order)) {
          // ═══════════════════════════════════════════════════════════
          // Credit addon refund — reverse the addon credits
          // ═══════════════════════════════════════════════════════════
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
        } else {
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

          // Downgrade user to free plan
          const freeCredits = PLAN_CREDITS.free;
          // Calculate the credit amount that was granted (not monetary amount)
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
            source: 'razorpay_refund',
            referenceId: order.id,
          });
        }
      }

      // Create notification using typed helper
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
        provider: 'razorpay',
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
    // Handle subscription.cancelled
    // ═══════════════════════════════════════════════════════════
    if (event === 'subscription.cancelled') {
      const subEntity = payload.payload?.subscription?.entity;
      if (!subEntity) {
        console.error('[Razorpay Webhook] subscription.cancelled: No subscription entity in payload');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription entity in payload', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const razorpaySubId = subEntity.id;
      if (!razorpaySubId) {
        console.error('[Razorpay Webhook] subscription.cancelled: No subscription ID');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription ID on entity', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { razorpaySubscriptionId: razorpaySubId.toString() },
      });

      if (!subscription) {
        console.error('[Razorpay Webhook] subscription.cancelled: No matching subscription for razorpaySubscriptionId:', razorpaySubId);
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

      // Create notification using typed helper
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
    // Handle subscription.charged (renewal payment succeeded)
    // ═══════════════════════════════════════════════════════════
    if (event === 'subscription.charged') {
      const subEntity = payload.payload?.subscription?.entity;
      if (!subEntity) {
        console.error('[Razorpay Webhook] subscription.charged: No subscription entity in payload');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription entity in payload', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const razorpaySubId = subEntity.id;
      if (!razorpaySubId) {
        console.error('[Razorpay Webhook] subscription.charged: No subscription ID');
        await db.paymentWebhook.update({
          where: { eventId },
          data: { processingError: 'No subscription ID on entity', processed: true, processedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      const subscription = await db.subscription.findFirst({
        where: { razorpaySubscriptionId: razorpaySubId.toString() },
      });

      if (!subscription) {
        // ── First charge of a NEW recurring checkout: the local
        // Subscription doesn't exist yet. Resolve the pending PaymentOrder
        // (by providerSubscriptionId, then notes.paymentOrderId) and run
        // the SAME idempotent activation path as the checkout verify route.
        const paymentEntity = payload.payload?.payment?.entity;
        const paymentId = paymentEntity?.id;

        let order = await db.paymentOrder.findFirst({
          where: { providerSubscriptionId: razorpaySubId.toString(), provider: 'razorpay' },
          orderBy: { createdAt: 'desc' },
        });
        if (!order) {
          const notedOrderId = subEntity.notes?.paymentOrderId;
          if (notedOrderId) {
            order = await db.paymentOrder.findUnique({ where: { id: notedOrderId } });
          }
        }

        if (!order || order.status !== 'pending') {
          // Nothing to activate (verify route already activated it, or the
          // order is unknown). Ack so Razorpay stops retrying.
          console.warn('[Razorpay Webhook] subscription.charged: no pending order for subscription', razorpaySubId);
          await db.paymentWebhook.update({
            where: { eventId },
            data: { processed: true, processedAt: new Date(), processingError: order ? null : 'No matching payment order for subscription' },
          });
          return NextResponse.json({ success: true, message: order ? 'Already processed' : 'No matching order' });
        }

        if (!paymentId) {
          console.error('[Razorpay Webhook] subscription.charged: no payment id in payload for first charge');
          await db.paymentWebhook.update({
            where: { eventId },
            data: { processingError: 'No payment id in payload', processed: true, processedAt: new Date() },
          });
          return NextResponse.json({ success: true });
        }

        const activation = await confirmPaymentAndActivate(order.userId, order.id, paymentId, razorpaySubId.toString());
        if (!activation.success) {
          console.error('[Razorpay Webhook] subscription.charged activation failed:', activation.error);
          await db.paymentWebhook.update({
            where: { eventId },
            data: { processingError: activation.error || 'Activation failed', paymentOrderId: order.id },
          });
          return NextResponse.json({ error: 'Payment activation failed' }, { status: 500 });
        }

        if (order.couponCode) {
          try {
            await incrementCouponUsage(order.couponCode);
          } catch (couponErr) {
            console.error('[Razorpay Webhook] Failed to increment coupon usage (non-critical):', couponErr);
          }
        }

        const firstChargeCredits = PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free;
        await notifyPaymentSuccess({
          userId: order.userId,
          plan: order.plan,
          amount: order.amount,
          currency: order.currency,
          creditsAdded: firstChargeCredits,
          orderId: order.id,
        });

        await logPaymentEvent(order.userId, 'payment_completed', {
          amount: order.amount,
          currency: order.currency,
          provider: 'razorpay',
          plan: order.plan,
          paymentOrderId: order.id,
          reason: 'Razorpay subscription first charge',
        });

        await db.paymentWebhook.update({
          where: { eventId },
          data: { processed: true, processedAt: new Date(), paymentOrderId: order.id },
        });
        return NextResponse.json({ success: true });
      }

      // Renewal for an existing linked subscription:
      // Reset credits for the new billing period
      await resetMonthlyCredits(subscription.userId, subscription.plan as PlanType);

      // Update period dates from Razorpay subscription entity
      const updateData: Record<string, unknown> = { status: 'active' };
      if (subEntity.current_start) {
        updateData.currentPeriodStart = new Date(subEntity.current_start * 1000);
      }
      if (subEntity.current_end) {
        updateData.currentPeriodEnd = new Date(subEntity.current_end * 1000);
      }

      await db.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      // Log the renewal
      const paymentEntity = payload.payload?.payment?.entity;
      await logPaymentEvent(subscription.userId, 'payment_completed', {
        amount: paymentEntity?.amount ? paymentEntity.amount / 100 : 0,
        currency: paymentEntity?.currency || 'INR',
        provider: 'razorpay',
        plan: subscription.plan,
        reason: 'Subscription renewal payment',
      });

      // Send renewal notification
      const renewalCredits = PLAN_CREDITS[subscription.plan as PlanType] || PLAN_CREDITS.free;
      await notifyPaymentSuccess({
        userId: subscription.userId,
        plan: subscription.plan,
        amount: paymentEntity?.amount ? paymentEntity.amount / 100 : 0,
        currency: paymentEntity?.currency || 'INR',
        creditsAdded: renewalCredits,
        orderId: undefined,
      });

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle subscription.halted (recurring payment failed and the
    // mandate was paused by the bank/customer OR retries exhausted).
    // Keep the plan in a recoverable past_due state — do NOT grant or
    // revoke credits here; dunning/recovery owns the next steps.
    // ═══════════════════════════════════════════════════════════
    if (event === 'subscription.halted') {
      const subEntity = payload.payload?.subscription?.entity;
      const razorpaySubId = subEntity?.id;
      if (razorpaySubId) {
        const subscription = await db.subscription.findFirst({
          where: { razorpaySubscriptionId: razorpaySubId.toString() },
        });

        if (subscription && subscription.status === 'active') {
          await db.subscription.update({
            where: { id: subscription.id },
            data: { status: 'past_due' },
          });

          await logSubscriptionEvent(subscription.userId, 'subscription_past_due', {
            fromStatus: 'active',
            toStatus: 'past_due',
            reason: 'Razorpay subscription halted',
          });

          await notifyPaymentFailure({
            userId: subscription.userId,
            plan: subscription.plan,
            reason: 'Your recurring payment failed and the subscription was halted. Update your payment method to restore access.',
            amount: 0,
            currency: 'INR',
          });
        }
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // Handle subscription.completed (subscription finished its full
    // tenure / reached end of life) — treat as expiration.
    // ═══════════════════════════════════════════════════════════
    if (event === 'subscription.completed') {
      const subEntity = payload.payload?.subscription?.entity;
      const razorpaySubId = subEntity?.id;
      if (razorpaySubId) {
        const subscription = await db.subscription.findFirst({
          where: { razorpaySubscriptionId: razorpaySubId.toString() },
        });

        if (subscription && subscription.status !== 'expired') {
          const previousPlan = subscription.plan;
          await db.subscription.update({
            where: { id: subscription.id },
            data: { status: 'expired' },
          });

          // Downgrade to free with fresh free-tier credits.
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

          await db.creditsLedger.create({
            data: {
              userId: subscription.userId,
              action: 'subscription_cancelled',
              credits: freeCredits,
              balance: freeCredits,
              description: 'Razorpay subscription completed its tenure — reset to free tier',
              referenceId: subscription.id,
            },
          });

          await notifySubscriptionExpired({
            userId: subscription.userId,
            previousPlan,
            reason: 'Subscription tenure completed',
          });

          await logSubscriptionEvent(subscription.userId, 'subscription_expired', {
            fromPlan: previousPlan,
            toPlan: 'free',
            fromStatus: subscription.status,
            toStatus: 'expired',
          });
        }
      }

      await db.paymentWebhook.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() },
      });
    }

    // For unhandled events, just mark as processed
    const handledEvents = [
      'payment.captured',
      'payment.failed',
      'refund.created',
      'refund.processed',
      'subscription.cancelled',
      'subscription.charged',
      'subscription.halted',
      'subscription.completed',
    ];
    if (!handledEvents.includes(event)) {
      await db.paymentWebhook.update({
        where: { eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Razorpay Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
