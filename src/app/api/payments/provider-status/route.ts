// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/provider-status
// Returns which payment providers are configured and available.
// This is a PUBLIC endpoint (no auth required) — it only reveals
// provider availability, not secrets.
//
// FINAL PAYMENT ACTIVATION ARCHITECTURE (Sep 2026):
// Product-plan availability and provider configuration are TWO
// DIFFERENT things:
//
//   • planStatus — every paid plan (Starter/Pro/Elite) is IMPLEMENTED
//     and ACTIVE in the application. This never depends on the
//     environment. The pricing UI no longer renders "Coming Soon" for
//     any paid plan.
//
//   • planAvailability — per plan/cycle checkout capability of the
//     currently configured providers. A paid plan/cycle is purchasable
//     via Stripe when BOTH STRIPE_SECRET_KEY and the plan's Stripe
//     Price ID env var (STRIPE_PRICE_STARTER_MONTHLY_ID,
//     STRIPE_PRICE_STARTER_YEARLY_ID, STRIPE_PRICE_PRO_MONTHLY_ID,
//     STRIPE_PRICE_PRO_YEARLY_ID, STRIPE_PRICE_ELITE_MONTHLY_ID,
//     STRIPE_PRICE_ELITE_YEARLY_ID or a legacy alias) are configured.
//     Razorpay availability depends only on its API keys (one-time
//     order fallback when no Razorpay Plan ID is mapped).
//
// A missing environment variable must NOT make the product UI pretend
// the plan itself is "Coming Soon" — the UI uses planAvailability only
// to decide whether to show the "checkout implemented — payment
// provider configuration required" notice under an ENABLED CTA.
// Admin/developer diagnostics live in GET /api/payments/config-status
// (admin-only). No price IDs or secrets are ever returned here.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { resolvePlanPriceId } from '@/lib/payment-service';
import type { PaidPlan } from '@/lib/payments/plan-config';

export async function GET() {
  const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  const isRazorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

  // ── Plan status: all paid plans are implemented and ACTIVE. ──
  // This is an application-level fact and NEVER depends on provider
  // configuration. Free is active too (non-paid).
  const paidPlans: PaidPlan[] = ['starter', 'pro', 'elite'];
  const planStatus: Record<string, string> = {
    free: 'active',
    starter: 'active',
    pro: 'active',
    elite: 'active',
  };

  // ── Per-plan/cycle provider configuration status (public-safe
  //    booleans only). Drives the config-required notice — NOT plan
  //    availability. ──
  const cycles = ['monthly', 'yearly'] as const;
  const planAvailability: Record<
    string,
    Record<string, { stripe: boolean; razorpay: boolean; available: boolean }>
  > = {};
  for (const plan of paidPlans) {
    planAvailability[plan] = {};
    for (const cycle of cycles) {
      // Reads the plan's Stripe Price ID from env (all supported naming
      // conventions). Returns null when not configured — never throws.
      const { priceId } = resolvePlanPriceId(plan, cycle);
      const stripe = isStripeConfigured && !!priceId;
      planAvailability[plan][cycle] = {
        stripe,
        razorpay: isRazorpayConfigured,
        available: stripe || isRazorpayConfigured,
      };
    }
  }

  return NextResponse.json({
    stripe: {
      available: isStripeConfigured,
      mode: isStripeConfigured
        ? (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
          ? 'test'
          : 'live'
        : null,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
    },
    razorpay: {
      available: isRazorpayConfigured,
      mode: isRazorpayConfigured
        ? (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')
          ? 'test'
          : 'live'
        : null,
      keyId: isRazorpayConfigured
        ? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID
        : null,
    },
    anyAvailable: isStripeConfigured || isRazorpayConfigured,
    planStatus,
    planAvailability,
  });
}
