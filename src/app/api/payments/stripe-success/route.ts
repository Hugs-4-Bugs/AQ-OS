// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/stripe-success
// Stripe Checkout redirects here after successful payment.
// This route simply redirects to the client-side /payment/success
// page with the session_id so the frontend can verify & activate.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  const sessionId = new URL(request.url).searchParams.get('session_id');

  if (!sessionId) {
    // No session_id — redirect to billing page
    const appUrl = getAppUrl();
    return NextResponse.redirect(`${appUrl}/dashboard/billing?error=no_session`);
  }

  // Redirect to the client-side payment success page
  const appUrl = getAppUrl();
  const redirectUrl = `${appUrl}/payment/success?session_id=${encodeURIComponent(sessionId)}`;
  return NextResponse.redirect(redirectUrl);
}
