// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/create-checkout-session
//
// FIX 12: Canonical checkout-session endpoint matching the documented
// payment contract:
//   1. Client calls POST /api/payments/create-checkout-session
//   2. Server creates a REAL Stripe Checkout Session (no mock/simulation)
//   3. Client receives { url: <stripeCheckoutUrl> } and redirects via
//      window.location.href = url
//   4. User completes payment on Stripe's hosted page
//   5. Stripe redirects back to the success URL and the Stripe webhook
//      (/api/payments/webhook/stripe) is the ONLY path that activates the
//      subscription and updates credits in the database.
//
// This route is a thin alias over the same real-Stripe service used by
// /api/payments/create-order and /api/payments/create-stripe-session —
// it contains no mock, dev-fallback, or simulated payment logic.
//
// TWO REQUEST SHAPES:
//   A) Subscription upgrade/switch (default):
//        body: { plan: 'pro'|'elite', billingCycle: 'monthly'|'yearly',
//                couponCode?, successUrl?, cancelUrl? }
//      → calls createStripeCheckoutSession (mode: 'payment' with price_data)
//   B) Credit add-on one-time purchase:
//        body: { type: 'credits', creditAmount: 100|500|1000,
//                successUrl?, cancelUrl? }
//      → calls createStripeCreditAddonCheckoutSession (mode: 'payment'
//        with line_items: [{ price: <priceId from env>, quantity: 1 }])
//        The priceId is read server-side from STRIPE_PRICE_CREDITS_*
//        env vars — NEVER hardcoded, NEVER trusted from the client.
//
// Auth: Required (withAuth — session cookie)
// Returns: { url, orderId, sessionId, ... }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createStripeCheckoutSession, createStripeCreditAddonCheckoutSession } from '@/lib/payment-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import type { PlanType } from '@/lib/entitlement-service';

interface CreateCheckoutSessionBody {
  // Subscription shape
  plan?: 'pro' | 'elite';
  billingCycle?: 'monthly' | 'yearly';
  // Accepted for contract compatibility. The app's plan catalog maps
  // plans to Stripe Prices server-side; a client-supplied priceId is
  // validated against the configured plan price when provided.
  priceId?: string;
  couponCode?: string;
  successUrl?: string;
  cancelUrl?: string;
  // Credit add-on shape
  type?: 'credits';
  creditAmount?: 100 | 500 | 1000;
}

// Known Stripe Price IDs configured for this app (used to validate the
// client-supplied priceId when present). Empty entries mean the plan price
// is resolved from the plan catalog instead.
const KNOWN_PRICE_IDS = new Set(
  [
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    process.env.STRIPE_PRICE_ID_PRO_YEARLY,
    process.env.STRIPE_PRICE_ID_ELITE_MONTHLY,
    process.env.STRIPE_PRICE_ID_ELITE_YEARLY,
    // Credit add-on price IDs (read from env, never hardcoded). When the
    // client requests type='credits', the server looks up the correct
    // priceId from STRIPE_PRICE_CREDITS_<amount>_ID and ignores any
    // client-supplied priceId for credit add-on requests.
    process.env.STRIPE_PRICE_CREDITS_100_ID,
    process.env.STRIPE_PRICE_CREDITS_500_ID,
    process.env.STRIPE_PRICE_CREDITS_1000_ID,
  ].filter((v): v is string => typeof v === 'string' && v.startsWith('price_'))
);

export async function POST(request: NextRequest) {
  // Real Stripe only — fail loudly instead of simulating.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' },
      { status: 500 }
    );
  }

  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as CreateCheckoutSessionBody;
      const { type, creditAmount, plan, billingCycle, priceId, couponCode, successUrl, cancelUrl } = body;

      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      // ═════════════════════════════════════════════════════════════
      // BRANCH B — Credit add-on one-time purchase
      // ═════════════════════════════════════════════════════════════
      if (type === 'credits') {
        if (creditAmount !== 100 && creditAmount !== 500 && creditAmount !== 1000) {
          return NextResponse.json(
            { error: 'Invalid creditAmount. Must be 100, 500, or 1000.' },
            { status: 400 }
          );
        }

        if (successUrl) {
          try { new URL(successUrl); } catch {
            return NextResponse.json({ error: 'Invalid successUrl format.' }, { status: 400 });
          }
        }
        if (cancelUrl) {
          try { new URL(cancelUrl); } catch {
            return NextResponse.json({ error: 'Invalid cancelUrl format.' }, { status: 400 });
          }
        }

        const result = await createStripeCreditAddonCheckoutSession({
          userId: user.id,
          creditAmount,
          successUrl,
          cancelUrl,
          ipAddress,
          userAgent,
        });

        if (!result.success) {
          // A missing STRIPE_PRICE_CREDITS_*_ID env var is a 500 (server
          // misconfiguration) — the user message tells the admin exactly
          // which env var to set. There is NO mock fallback.
          const status = result.error?.includes('is not configured') ? 500 : 400;
          return NextResponse.json({ error: result.error }, { status });
        }

        await logBillingEvent({
          userId: user.id,
          action: 'payment_initiated',
          details: `Stripe credit add-on checkout session created for ${creditAmount} credits`,
          ipAddress,
          userAgent,
          metadata: {
            orderId: result.orderId,
            sessionId: result.sessionId,
            amount: result.amount,
            currency: result.currency,
            type: 'credits',
            creditAmount,
            provider: 'stripe',
          },
        });

        return NextResponse.json({
          // Primary contract field: the client MUST redirect immediately:
          //   window.location.href = data.url
          url: result.url,
          orderId: result.orderId,
          sessionId: result.sessionId,
          amount: result.amount,
          currency: result.currency,
          type: 'credits',
          creditAmount,
          credits: result.credits,
        });
      }

      // ═════════════════════════════════════════════════════════════
      // BRANCH A — Subscription upgrade / billing-cycle switch
      // ═════════════════════════════════════════════════════════════
      if (!plan || !['pro', 'elite'].includes(plan)) {
        return NextResponse.json(
          { error: 'Invalid plan. Must be "pro" or "elite".' },
          { status: 400 }
        );
      }

      if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
        return NextResponse.json(
          { error: 'Invalid billing cycle. Must be "monthly" or "yearly".' },
          { status: 400 }
        );
      }

      // If a priceId is supplied it must be one of the configured plan
      // prices — never trust an arbitrary price created outside the app.
      if (priceId && KNOWN_PRICE_IDS.size > 0 && !KNOWN_PRICE_IDS.has(priceId)) {
        return NextResponse.json(
          { error: 'Unknown priceId. Use the plan catalog or a configured Stripe Price ID.' },
          { status: 400 }
        );
      }

      if (successUrl) {
        try { new URL(successUrl); } catch {
          return NextResponse.json({ error: 'Invalid successUrl format.' }, { status: 400 });
        }
      }
      if (cancelUrl) {
        try { new URL(cancelUrl); } catch {
          return NextResponse.json({ error: 'Invalid cancelUrl format.' }, { status: 400 });
        }
      }

      // Delegate to the REAL Stripe checkout service (same used by
      // create-order / create-stripe-session). No mock paths exist here.
      const result = await createStripeCheckoutSession({
        userId: user.id,
        plan: plan as PlanType,
        billingCycle,
        couponCode,
        successUrl,
        cancelUrl,
        ipAddress,
        userAgent,
      });

      if (!result.success) {
        const status = result.error?.includes('Invalid plan change') ? 400
          : result.error?.includes('already completed') ? 409
          : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      await logBillingEvent({
        userId: user.id,
        action: 'payment_initiated',
        details: `Stripe checkout session created via create-checkout-session for ${plan} plan (${billingCycle})`,
        ipAddress,
        userAgent,
        metadata: {
          orderId: result.orderId,
          sessionId: result.stripeSessionId,
          amount: result.amount,
          currency: result.currency,
          plan,
          billingCycle,
          provider: 'stripe',
        },
      });

      return NextResponse.json({
        // Primary contract field: the client MUST redirect immediately:
        //   window.location.href = data.url
        url: result.stripeSessionUrl,
        stripeCheckoutUrl: result.stripeSessionUrl,
        orderId: result.orderId,
        sessionId: result.stripeSessionId,
        amount: result.amount,
        currency: result.currency,
        plan: result.plan,
        billingCycle: result.billingCycle,
        creditsAllocated: result.creditsAllocated,
      });
    } catch (error) {
      console.error('[API] create-checkout-session error:', error);
      return NextResponse.json(
        { error: 'Failed to create Stripe checkout session' },
        { status: 500 }
      );
    }
  });
}
