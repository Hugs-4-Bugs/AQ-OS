// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/verify-session
// Verifies a Stripe Checkout session after redirect from payment.
// Checks the DB first (PaymentOrder by providerOrderId), then falls
// back to Stripe API for pending orders.
// When a pending order is confirmed as paid via Stripe API, calls
// confirmPaymentAndActivate() to atomically activate the subscription,
// update the user's plan, and reward credits.
// Returns payment status, plan details, credits, and invoice info.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { confirmPaymentAndActivate } from '@/lib/subscription-service';
import { fulfillCreditAddon, isCreditAddonOrder } from '@/lib/credit-addon-fulfillment';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';
import { logPaymentEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { getAppUrl } from '@/lib/app-url';

// Shared verification handler — used by BOTH the GET (query param) and
// POST (JSON body { sessionId }) methods. PART 5 of
// SUBSCRIPTION-PAYMENT-FIX-20260909: the dashboard success handler calls
// POST /api/payments/verify-session with { sessionId } after the Stripe
// redirect; the /payment/success page uses the GET variant.
async function handleVerifySession(request: NextRequest, sessionId: string | null) {
  return withAuth(request, async (user) => {
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    try {
      // ── Step 1: Look up PaymentOrder by providerOrderId (the Stripe session ID) ──
      const order = await db.paymentOrder.findFirst({
        where: { providerOrderId: sessionId },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              pdfUrl: true,
              total: true,
              currency: true,
            },
          },
        },
      });

      // ── Step 2: If order is completed in DB, return success immediately ──
      if (order && order.status === 'completed') {
        // Also fetch the active subscription to include credit info
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
          plan: order.plan,
          billingCycle: order.billingCycle,
          amount: order.amount,
          currency: order.currency,
          credits: subscription?.creditsTotal ?? getCreditsForPlan(order.plan),
          invoiceNumber: order.invoice?.invoiceNumber || null,
          subscriptionStatus: subscription?.status || 'active',
          subscriptionId: subscription?.id || null,
          provider: order.provider,
        });
      }

      // ── Step 3: If order exists but is pending, verify with Stripe and ACTIVATE ──
      if (order && order.status === 'pending') {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (stripeKey) {
          try {
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(stripeKey as never);

            const session = await stripe.checkout.sessions.retrieve(sessionId);

            // Verify ownership
            const sessionUserId = session.metadata?.user_id || session.client_reference_id;
            if (sessionUserId && sessionUserId !== user.id) {
              return NextResponse.json(
                { error: 'Session does not belong to this user' },
                { status: 403 }
              );
            }

            if (session.payment_status === 'paid') {
              // ═══════════════════════════════════════════════════════════
              // CRITICAL FIX: Call confirmPaymentAndActivate() to atomically
              // activate the subscription, update the user's plan, and
              // reward credits. Previously we only updated the order status,
              // which left the user without credits or plan activation.
              // ═══════════════════════════════════════════════════════════
              const providerPaymentId =
                (session.payment_intent as string) ||
                (session as unknown as { latest_charge?: string }).latest_charge ||
                sessionId;

              console.log(
                `[VerifySession] Activating payment for order ${order.id}, ` +
                `user ${user.id}, plan ${order.plan}, providerPaymentId ${providerPaymentId}`
              );

              // Route: credit addon orders go through a separate fulfillment path
              let activateResult: { success: boolean; error?: string };
              if (isCreditAddonOrder(order)) {
                const addonResult = await fulfillCreditAddon(user.id, order.id, providerPaymentId);
                activateResult = { success: addonResult.success, error: addonResult.error };
              } else {
                activateResult = await confirmPaymentAndActivate(
                  user.id,
                  order.id,
                  providerPaymentId
                );
              }

              if (!activateResult.success) {
                console.error('[VerifySession] confirmPaymentAndActivate failed:', activateResult.error);
                // If it says "already completed", that's actually OK — the webhook beat us
                if (activateResult.error === 'Payment already completed') {
                  // Fetch the active subscription (already activated by webhook)
                  const subscription = await db.subscription.findFirst({
                    where: {
                      userId: user.id,
                      status: { in: ['active', 'trialing'] },
                    },
                    orderBy: { createdAt: 'desc' },
                  });

                  const updatedOrder = await db.paymentOrder.findUnique({
                    where: { id: order.id },
                    include: {
                      invoice: {
                        select: {
                          id: true,
                          invoiceNumber: true,
                          pdfUrl: true,
                          total: true,
                          currency: true,
                        },
                      },
                    },
                  });

                  return NextResponse.json({
                    success: true,
                    paid: true,
                    orderStatus: 'completed',
                    activated: false,
                    plan: updatedOrder?.plan || order.plan,
                    billingCycle: updatedOrder?.billingCycle || order.billingCycle,
                    amount: updatedOrder?.amount || order.amount,
                    currency: updatedOrder?.currency || order.currency,
                    credits: subscription?.creditsTotal ?? getCreditsForPlan(order.plan),
                    invoiceNumber: updatedOrder?.invoice?.invoiceNumber || null,
                    subscriptionStatus: subscription?.status || 'active',
                    subscriptionId: subscription?.id || null,
                    provider: order.provider,
                  });
                }
                // Genuine activation failure
                return NextResponse.json({
                  paid: true,
                  orderStatus: 'pending',
                  message: activateResult.error || 'Failed to activate subscription. The confirm-payment endpoint will retry.',
                });
              }

              // Activation succeeded — fetch the newly activated subscription
              const subscription = await db.subscription.findFirst({
                where: {
                  userId: user.id,
                  status: { in: ['active', 'trialing'] },
                },
                orderBy: { createdAt: 'desc' },
              });

              const updatedOrder = await db.paymentOrder.findUnique({
                where: { id: order.id },
                include: {
                  invoice: {
                    select: {
                      id: true,
                      invoiceNumber: true,
                      pdfUrl: true,
                      total: true,
                      currency: true,
                    },
                  },
                },
              });

              // Generate invoice PDF and send email (BLOCKING — must complete before response)
              // This ensures the user always gets their invoice PDF and email
              try {
                console.log(`[VerifySession] Starting invoice PDF generation for order ${order.id}...`);
                const pdfResult = await generateInvoicePdf(order.id);
                if (pdfResult.success) {
                  console.log(`[VerifySession] ✓ Invoice PDF generated: ${pdfResult.pdfUrl}`);
                } else {
                  console.warn('[VerifySession] ✗ Invoice PDF generation failed:', pdfResult.error);
                }
              } catch (pdfErr) {
                console.error('[VerifySession] ✗ Invoice PDF generation error:', pdfErr);
              }

              try {
                console.log(`[VerifySession] Sending invoice email to user ${user.id}...`);
                const emailResult = await sendInvoiceEmail(user.id, order.id);
                if (emailResult?.sent) {
                  console.log(`[VerifySession] ✓ Invoice email sent to user ${user.id}`);
                } else {
                  console.error('[VerifySession] ✗ Invoice email failed:', emailResult?.error);
                }
              } catch (emailErr) {
                console.error('[VerifySession] ✗ Invoice email error:', emailErr);
              }

              // Create notification for the user
              const planCredits = PLAN_CREDITS[order.plan as PlanType] || PLAN_CREDITS.free;
              db.notification.create({
                data: {
                  userId: user.id,
                  type: 'payment_success',
                  title: 'Payment Successful',
                  message: `Your ${order.plan} plan subscription is now active! ${planCredits} credits have been added to your account.`,
                  actionUrl: '/dashboard',
                },
              }).catch(() => {}); // Non-critical

              return NextResponse.json({
                success: true,
                paid: true,
                orderStatus: 'completed',
                activated: true,
                plan: updatedOrder?.plan || order.plan,
                billingCycle: updatedOrder?.billingCycle || order.billingCycle,
                amount: updatedOrder?.amount || order.amount,
                currency: updatedOrder?.currency || order.currency,
                credits: subscription?.creditsTotal ?? getCreditsForPlan(order.plan),
                invoiceNumber: updatedOrder?.invoice?.invoiceNumber || null,
                subscriptionStatus: subscription?.status || 'active',
                subscriptionId: subscription?.id || null,
                provider: order.provider,
              });
            } else {
              // Stripe says not paid yet
              return NextResponse.json({
                paid: false,
                status: session.payment_status,
                message: 'Payment is still being processed. Please wait a moment and try again.',
              });
            }
          } catch (stripeError) {
            console.error('Stripe verification error:', stripeError);
            // Fall through to return pending status
          }
        }

        // No Stripe key or Stripe error — still pending
        return NextResponse.json({
          paid: false,
          status: 'pending',
          message: 'Payment is being processed. Please wait a moment and try again.',
        });
      }

      // ── Step 4: Order exists but is failed or refunded ──
      if (order && (order.status === 'failed' || order.status === 'refunded')) {
        return NextResponse.json({
          paid: false,
          status: order.status,
          message: order.status === 'refunded'
            ? 'This payment has been refunded.'
            : 'This payment has failed. Please try again.',
        });
      }

      // ── Step 5: No order found in DB — try Stripe directly and create order ──
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return NextResponse.json(
          { paid: false, error: 'No payment record found for this session' },
          { status: 404 }
        );
      }

      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey as never);

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Verify ownership
        const sessionUserId = session.metadata?.user_id || session.client_reference_id;
        if (sessionUserId && sessionUserId !== user.id) {
          return NextResponse.json(
            { error: 'Session does not belong to this user' },
            { status: 403 }
          );
        }

        if (session.payment_status === 'paid') {
          // No PaymentOrder in DB but Stripe says paid — create a retroactive order
          // This can happen if the order creation failed before the Stripe redirect
          const plan = (session.metadata?.plan || 'pro') as string;
          const billingCycle = (session.metadata?.billing_cycle || 'monthly') as string;
          const amount = (session.amount_total || 0) / 100;
          const currency = (session.currency || 'inr').toUpperCase();
          const providerPaymentId =
            (session.payment_intent as string) ||
            (session as unknown as { latest_charge?: string }).latest_charge ||
            sessionId;

          console.log(
            `[VerifySession] No order in DB for paid session ${sessionId}. ` +
            `Creating retroactive order for user ${user.id}, plan ${plan}.`
          );

          try {
            // Create the missing PaymentOrder
            const retroactiveOrder = await db.paymentOrder.create({
              data: {
                userId: user.id,
                provider: 'stripe',
                providerOrderId: sessionId,
                providerPaymentId,
                amount,
                currency,
                plan,
                billingCycle,
                status: 'pending', // Will be updated by confirmPaymentAndActivate
                subtotal: amount,
                taxRate: 0,
                taxAmount: 0,
              },
            });

            // Now activate it — route through addon fulfillment if applicable
            let activateResult: { success: boolean; error?: string };
            if (isCreditAddonOrder(retroactiveOrder)) {
              const addonResult = await fulfillCreditAddon(user.id, retroactiveOrder.id, providerPaymentId);
              activateResult = { success: addonResult.success, error: addonResult.error };
            } else {
              activateResult = await confirmPaymentAndActivate(
                user.id,
                retroactiveOrder.id,
                providerPaymentId
              );
            }

            if (activateResult.success) {
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
                activated: true,
                plan,
                billingCycle,
                amount,
                currency,
                credits: subscription?.creditsTotal ?? getCreditsForPlan(plan),
                invoiceNumber: null,
                subscriptionStatus: subscription?.status || 'active',
                subscriptionId: subscription?.id || null,
                provider: 'stripe',
              });
            }
          } catch (retroError) {
            console.error('[VerifySession] Retroactive order creation failed:', retroError);
          }

          // Fallback: return paid status even if retroactive activation failed
          return NextResponse.json({
            success: true,
            paid: true,
            orderStatus: 'pending',
            plan,
            billingCycle,
            amount,
            currency,
            credits: getCreditsForPlan(plan),
            invoiceNumber: null,
            subscriptionStatus: 'active',
            subscriptionId: null,
            provider: 'stripe',
            message: 'Payment confirmed but activation is pending. Please try the confirm-payment endpoint.',
          });
        } else {
          return NextResponse.json({
            paid: false,
            status: session.payment_status,
          });
        }
      } catch (stripeError) {
        console.error('Verify session error:', stripeError);
        return NextResponse.json(
          { paid: false, error: 'Failed to verify payment with provider' },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Verify session error:', error);
      return NextResponse.json(
        { paid: false, error: 'Failed to verify payment' },
        { status: 500 }
      );
    }
  });
}

// GET variant — session_id in the query string:
//   GET /api/payments/verify-session?session_id=cs_live_...
export async function GET(request: NextRequest) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  return handleVerifySession(request, sessionId);
}

// POST variant — sessionId in the JSON body (PART 5 contract):
//   POST /api/payments/verify-session  body: { sessionId: "cs_live_..." }
// Server retrieves the session from Stripe; when payment_status === 'paid'
// the plan is activated (or credits fulfilled) and the updated user state
// is returned so the client can show "Welcome to [Plan Name]!".
export async function POST(request: NextRequest) {
  let bodySessionId: string | null = null;
  try {
    const body = (await request.json()) as { sessionId?: string; session_id?: string };
    bodySessionId = body.sessionId || body.session_id || null;
  } catch {
    bodySessionId = null;
  }
  if (!bodySessionId) {
    return NextResponse.json(
      { paid: false, error: 'Missing sessionId in request body' },
      { status: 400 }
    );
  }
  return handleVerifySession(request, bodySessionId);
}

/** Get the credit allocation for a given plan */
function getCreditsForPlan(plan: string): number {
  const planCredits: Record<string, number> = {
    free: 50,
    pro: 500,
    elite: 2000,
    enterprise: 10000,
  };
  return planCredits[plan] || 50;
}
