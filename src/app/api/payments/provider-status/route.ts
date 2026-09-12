// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/provider-status
// Returns which payment providers are configured and available.
// This is a PUBLIC endpoint (no auth required) — it only reveals
// provider availability, not secrets.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';

export async function GET() {
  const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  const isRazorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

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
  });
}
