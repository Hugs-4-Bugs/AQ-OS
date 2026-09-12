// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/create-stripe-session
// Phase 5: Create a Stripe Checkout Session using payment-service
//
// Auth: Required (withAuth)
// Body: { plan, billingCycle, couponCode?, successUrl?, cancelUrl? }
// Returns: { sessionId, url } for Stripe redirect
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createStripeCheckoutSession } from '@/lib/payment-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import type { PlanType } from '@/lib/entitlement-service';

interface CreateStripeSessionBody {
  plan: 'pro' | 'elite';
  billingCycle: 'monthly' | 'yearly';
  couponCode?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export async function POST(request: NextRequest) {
  // Pre-flight: ensure Stripe is actually configured before delegating to
  // the payment service. This produces a clear, actionable error message
  // instead of the generic "Failed to create Stripe checkout session" that
  // results from the SDK throwing when STRIPE_SECRET_KEY is missing.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' },
      { status: 500 }
    );
  }

  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as CreateStripeSessionBody;
      const { plan, billingCycle, couponCode, successUrl, cancelUrl } = body;

      // Validate required fields
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

      // Validate URLs if provided
      if (successUrl) {
        try {
          new URL(successUrl);
        } catch {
          return NextResponse.json(
            { error: 'Invalid successUrl format.' },
            { status: 400 }
          );
        }
      }

      if (cancelUrl) {
        try {
          new URL(cancelUrl);
        } catch {
          return NextResponse.json(
            { error: 'Invalid cancelUrl format.' },
            { status: 400 }
          );
        }
      }

      const ipAddress = getClientIp(request);
      const userAgent = getUserAgent(request);

      // Delegate to payment-service
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

      // Log the session creation
      await logBillingEvent({
        userId: user.id,
        action: 'payment_initiated',
        details: `Stripe checkout session created for ${plan} plan (${billingCycle})`,
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
        orderId: result.orderId,
        sessionId: result.stripeSessionId,
        url: result.stripeSessionUrl,
        amount: result.amount,
        currency: result.currency,
        subtotal: result.subtotal,
        discountAmount: result.discountAmount,
        taxAmount: result.taxAmount,
        gstRate: result.gstRate,
        plan: result.plan,
        billingCycle: result.billingCycle,
        creditsAllocated: result.creditsAllocated,
      });
    } catch (error) {
      console.error('[API] Create Stripe session error:', error);
      return NextResponse.json(
        { error: 'Failed to create Stripe checkout session' },
        { status: 500 }
      );
    }
  });
}
