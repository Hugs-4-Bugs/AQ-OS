// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/create-order
// Create a payment order with proper auth, pricing, coupon support,
// idempotency, eligibility checks, and audit logging.
//
// When STRIPE_SECRET_KEY is configured, ALWAYS uses Stripe checkout.
// - If real Stripe Price IDs are set → subscription mode
// - If placeholder Price IDs → one-time payment mode with calculated amount
// Stores providerOrderId for webhook matching.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  type PlanType,
  PLAN_CREDITS,
  getPlanLevel,
  isValidPlanChange,
} from '@/lib/entitlement-service';
import { validateAndApplyCoupon } from '@/lib/coupon-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import { withMonitoring } from '@/lib/observability/middleware';
import { getAppUrl } from '@/lib/app-url';

// Plan pricing configuration (supports both INR and USD)
const PLAN_PRICING: Record<PlanType, Record<string, { monthly: number; yearly: number }>> = {
  free: {
    INR: { monthly: 0, yearly: 0 },
    USD: { monthly: 0, yearly: 0 },
  },
  pro: {
    INR: { monthly: 2499, yearly: 23990 },
    USD: { monthly: 29, yearly: 279 },
  },
  elite: {
    INR: { monthly: 7999, yearly: 76790 },
    USD: { monthly: 89, yearly: 849 },
  },
};

const GST_RATE = 0.18;

// Placeholder price IDs look like "price_pro_monthly" — real Stripe IDs
// contain alphanumeric hashes like "price_1SgkxqQs9KmQ0HIi..."
const PLACEHOLDER_PRICE_RE = /^price_[a-z_]+$/;

interface CreateOrderBody {
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  couponCode?: string;
  currency?: 'INR' | 'USD';
  idempotencyKey?: string;
}

export const POST = withMonitoring(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as CreateOrderBody;
      const {
        plan,
        billingCycle = 'monthly',
        couponCode,
        currency = 'INR',
        idempotencyKey,
      } = body;

      // Validate plan
      if (!plan || !PLAN_PRICING[plan]) {
        return NextResponse.json(
          { error: 'Invalid plan. Must be "pro" or "elite".' },
          { status: 400 }
        );
      }

      if (plan === 'free') {
        return NextResponse.json(
          { error: 'Cannot create payment order for free plan.' },
          { status: 400 }
        );
      }

      // Validate billing cycle
      if (!['monthly', 'yearly'].includes(billingCycle)) {
        return NextResponse.json(
          { error: 'Invalid billing cycle. Must be "monthly" or "yearly".' },
          { status: 400 }
        );
      }

      // Validate plan change is valid
      const currentPlan = (user.plan || 'free') as PlanType;
      if (!isValidPlanChange(currentPlan, plan)) {
        return NextResponse.json(
          { error: `You are already on the ${plan} plan.` },
          { status: 400 }
        );
      }

      // ═══════════════════════════════════════════════════════════════
      // Check eligibility — verify user can change to this plan
      // ═══════════════════════════════════════════════════════════════
      const subscription = await db.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (
        subscription &&
        subscription.status !== 'expired' &&
        subscription.status !== 'canceled' &&
        subscription.plan !== 'free'
      ) {
        const subPlan = subscription.plan;
        const subCycle = subscription.billingCycle;
        const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, elite: 2 };

        // Same plan same cycle
        if (subPlan === plan && subCycle === billingCycle) {
          return NextResponse.json(
            { error: `You already have an active ${subPlan} ${subCycle} plan.` },
            { status: 400 }
          );
        }

        // Yearly to monthly same plan
        if (subPlan === plan && subCycle === 'yearly' && billingCycle === 'monthly') {
          return NextResponse.json(
            { error: 'You already have a yearly plan which is better value.' },
            { status: 400 }
          );
        }

        // Downgrade
        if ((PLAN_RANK[plan] || 0) < (PLAN_RANK[subPlan] || 0)) {
          return NextResponse.json(
            { error: 'To downgrade, please cancel your current plan first.' },
            { status: 400 }
          );
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // Only allow ONE pending checkout at a time per user
      // ═══════════════════════════════════════════════════════════════
      const pendingOrder = await db.paymentOrder.findFirst({
        where: {
          userId: user.id,
          status: 'pending',
          plan,
          billingCycle,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingOrder) {
        const orderAge = Date.now() - new Date(pendingOrder.createdAt).getTime();
        // Allow retry if pending order is older than 30 minutes
        if (orderAge < 30 * 60 * 1000) {
          return NextResponse.json(
            { error: 'You already have a pending order. Please wait or cancel it first.' },
            { status: 409 }
          );
        }
        // Expire the old pending order
        await db.paymentOrder.update({
          where: { id: pendingOrder.id },
          data: { status: 'failed' },
        });
      }

      // Get pricing for the plan and currency
      const planCurrencyPricing = PLAN_PRICING[plan][currency];
      if (!planCurrencyPricing) {
        return NextResponse.json(
          { error: `Invalid currency: ${currency}` },
          { status: 400 }
        );
      }

      const baseAmount = planCurrencyPricing[billingCycle];

      // Idempotency: check if an order with this idempotency key already exists
      if (idempotencyKey) {
        const existingOrder = await db.paymentOrder.findFirst({
          where: {
            userId: user.id,
            status: 'pending',
            idempotencyKey,
          },
        });

        if (existingOrder) {
          return NextResponse.json({
            orderId: existingOrder.id,
            amount: existingOrder.amount,
            currency,
            subtotal: existingOrder.subtotal,
            discountAmount: existingOrder.discountAmount,
            taxAmount: existingOrder.taxAmount,
            gstRate: currency === 'INR' ? GST_RATE : 0,
            plan,
            billingCycle,
            idempotent: true,
            razorpayOrderId: existingOrder.providerOrderId || `order_dev_${existingOrder.id}`,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_dev',
          });
        }
      }

      // Coupon validation and discount calculation using coupon-service
      let discountAmount = 0;
      let finalAmount = baseAmount;
      let couponValid = false;

      if (couponCode) {
        const couponResult = await validateAndApplyCoupon({
          code: couponCode,
          baseAmount,
          plan,
          userId: user.id,
        });

        if (couponResult.valid) {
          couponValid = true;
          discountAmount = couponResult.discountAmount;
          finalAmount = couponResult.finalAmount ?? baseAmount;
        }
      }

      // GST calculation for Indian users
      const subtotal = finalAmount;
      const taxAmount = currency === 'INR' ? Math.round(subtotal * GST_RATE * 100) / 100 : 0;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      // Determine provider — when STRIPE_SECRET_KEY is configured, always use Stripe
      const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;
      const provider = stripeEnabled ? 'stripe' : (currency === 'INR' ? 'razorpay' : 'stripe');

      // ═══════════════════════════════════════════════════════════════
      // Create the payment order in the database FIRST.
      // This ensures the order exists before any webhook can fire,
      // preventing a race condition with Stripe's fast webhook delivery.
      // ═══════════════════════════════════════════════════════════════
      const devPlaceholderOrderId = `order_dev_${Date.now()}`;

      const order = await db.paymentOrder.create({
        data: {
          userId: user.id,
          provider,
          providerOrderId: devPlaceholderOrderId, // Will be updated with real provider ID
          amount: totalAmount,
          currency,
          plan,
          billingCycle,
          status: 'pending',
          subtotal,
          discountAmount,
          taxRate: currency === 'INR' ? GST_RATE : 0,
          taxAmount,
          couponCode: couponCode || null,
          idempotencyKey: idempotencyKey || undefined,
        },
      });

      // Now that we have the order ID, create provider-specific orders
      // and update the payment order with the real provider order ID.
      let providerOrderId = devPlaceholderOrderId;
      let razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_dev';
      let checkoutUrl: string | null = null;

      // ═══════════════════════════════════════════════════════════════
      // STRIPE CHECKOUT — Always used when STRIPE_SECRET_KEY is set
      // ═══════════════════════════════════════════════════════════════
      if (provider === 'stripe' && process.env.STRIPE_SECRET_KEY) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

          // Determine the price ID for this plan/billing cycle
          const priceKey = `STRIPE_${plan.toUpperCase()}_${billingCycle.toUpperCase()}_PRICE_ID` as keyof NodeJS.ProcessEnv;
          const priceId = process.env[priceKey];
          const isPlaceholderPrice = priceId ? PLACEHOLDER_PRICE_RE.test(priceId) : true;

          const appUrl = getAppUrl();

          if (priceId && !isPlaceholderPrice) {
            // ── Real Stripe Price ID → Subscription mode ──────────────
            const session = await stripe.checkout.sessions.create({
              mode: 'subscription',
              payment_method_types: ['card'],
              line_items: [
                {
                  price: priceId,
                  quantity: 1,
                },
              ],
              success_url: `${appUrl}/?payment=success&plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${appUrl}/?payment=cancelled`,
              metadata: {
                user_id: user.id,
                plan,
                billing_cycle: billingCycle,
                order_id: order.id,
                coupon_code: couponCode || '',
              },
              subscription_data: {
                metadata: {
                  user_id: user.id,
                  plan,
                  billing_cycle: billingCycle,
                  order_id: order.id,
                },
              },
            });

            checkoutUrl = session.url ?? null;
            providerOrderId = session.id;
          } else {
            // ── Placeholder Price ID → One-time payment mode ─────────
            // Use calculated amount since we don't have real Stripe prices
            const session = await stripe.checkout.sessions.create({
              mode: 'payment',
              payment_method_types: ['card', 'link'],
              line_items: [
                {
                  price_data: {
                    currency: currency.toLowerCase(),
                    product_data: {
                      name: `AcquisitionOS ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
                      description: `${billingCycle} subscription - ${PLAN_CREDITS[plan]} credits/month`,
                    },
                    unit_amount: Math.round(totalAmount * 100), // Stripe expects cents
                  },
                  quantity: 1,
                },
              ],
              success_url: `${appUrl}/?payment=success&plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${appUrl}/?payment=cancelled`,
              metadata: {
                user_id: user.id,
                plan,
                billing_cycle: billingCycle,
                order_id: order.id,
                coupon_code: couponCode || '',
              },
            });

            checkoutUrl = session.url ?? null;
            providerOrderId = session.id;
          }

          // Update payment order with real Stripe session ID
          await db.paymentOrder.update({
            where: { id: order.id },
            data: { providerOrderId },
          });
        } catch (stripeError) {
          console.error('[API] Stripe checkout session creation failed:', stripeError);
          // Do NOT fall through to a dev placeholder — surface a real error
          // so the frontend can show "Stripe is not configured" instead of
          // silently simulating a successful payment.
          await db.paymentOrder.update({
            where: { id: order.id },
            data: { status: 'failed' },
          });
          return NextResponse.json(
            {
              error: 'Failed to create Stripe checkout session. Please try again or contact support.',
              provider: 'stripe',
              providerConfigured: true,
            },
            { status: 502 }
          );
        }
      } else if (provider === 'razorpay') {
        // ═══════════════════════════════════════════════════════════════
        // RAZORPAY — Fallback when Stripe is not configured (INR only)
        // ═══════════════════════════════════════════════════════════════
        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
          try {
            const Razorpay = (await import('razorpay')).default;
            const razorpay = new Razorpay({
              key_id: process.env.RAZORPAY_KEY_ID,
              key_secret: process.env.RAZORPAY_KEY_SECRET,
            });

            const razorpayOrder = await razorpay.orders.create({
              amount: Math.round(totalAmount * 100), // Razorpay expects amount in paise
              currency,
              receipt: `rcpt_${user.id.slice(0, 10)}_${Date.now()}`,
              notes: {
                orderId: order.id,
                userId: user.id,
                plan,
                billingCycle,
                couponCode: couponCode || '',
              },
            });

            providerOrderId = razorpayOrder.id;
            razorpayKeyId = process.env.RAZORPAY_KEY_ID;

            // Update payment order with real Razorpay order ID
            await db.paymentOrder.update({
              where: { id: order.id },
              data: { providerOrderId },
            });
          } catch (razorpayError) {
            console.error('[API] Razorpay order creation failed:', razorpayError);
            // Do NOT fall through to a dev placeholder — surface a real error
            // so the frontend can show a clean error instead of silently
            // simulating a successful payment.
            await db.paymentOrder.update({
              where: { id: order.id },
              data: { status: 'failed' },
            });
            return NextResponse.json(
              {
                error: 'Failed to create Razorpay order. Please try again or contact support.',
                provider: 'razorpay',
                providerConfigured: true,
              },
              { status: 502 }
            );
          }
        }
      }

      // Coupon usage will be incremented after payment succeeds (in webhook handlers)
      // to prevent counting coupons for abandoned/failed orders.

      // Log payment initiation
      await logBillingEvent({
        userId: user.id,
        action: 'payment_initiated',
        details: `Payment order created for ${plan} plan (${billingCycle})`,
        resourceId: order.id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          amount: totalAmount,
          currency,
          plan,
          billingCycle,
          discountAmount,
          taxAmount,
          couponCode: couponCode || undefined,
          couponValid,
          idempotencyKey: idempotencyKey || undefined,
          planLevel: getPlanLevel(plan),
          creditsAllocated: PLAN_CREDITS[plan],
          provider,
          providerOrderId,
        },
      });

      // Determine if a real payment provider was configured
      const realProviderConfigured =
        (provider === 'razorpay' && providerOrderId !== devPlaceholderOrderId) ||
        (provider === 'stripe' && !!checkoutUrl);

      // Build response
      const responseData: Record<string, unknown> = {
        orderId: order.id,
        amount: totalAmount,
        currency,
        subtotal,
        discountAmount,
        taxAmount,
        gstRate: currency === 'INR' ? GST_RATE : 0,
        plan,
        billingCycle,
        creditsAllocated: PLAN_CREDITS[plan],
        provider,
        providerConfigured: realProviderConfigured,
      };

      // Add provider-specific details
      if (provider === 'stripe' && checkoutUrl) {
        responseData.checkout_url = checkoutUrl;
        responseData.stripeCheckoutUrl = checkoutUrl; // Keep backward compat
      } else if (provider === 'razorpay') {
        responseData.razorpayOrderId = providerOrderId;
        responseData.razorpayKeyId = razorpayKeyId;
        responseData.razorpayCurrency = currency;
        responseData.razorpayAmount = Math.round(totalAmount * 100); // paise
        responseData.userName = user.name;
        responseData.userEmail = user.email;
      }

      return NextResponse.json(responseData);
    } catch (error) {
      console.error('[API] Create order error:', error);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }
  });
}, '/api/payments/create-order');
