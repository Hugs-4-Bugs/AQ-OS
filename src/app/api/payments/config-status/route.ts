// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/config-status  (ADMIN ONLY)
//
// FINAL PAYMENT ACTIVATION ARCHITECTURE (Sep 2026) — requirement #19:
// safe provider-configuration diagnostics for admins/developers.
//
//   • Reports CONFIGURED/MISSING for Stripe credentials, all six
//     Stripe plan Price ID mappings, credit-pack Price IDs, Razorpay
//     credentials, and all six Razorpay plan Plan ID mappings.
//   • NEVER returns any secret or ID VALUE — only variable NAMES and
//     booleans (see src/lib/payment-config-validator.ts).
//   • Requires an admin role (withAdmin). Regular users get 403.
//   • Confirms that all paid plans are ACTIVE in the application
//     regardless of provider configuration.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { buildPaymentConfigReport } from '@/lib/payment-config-validator';

export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    const report = buildPaymentConfigReport();
    return NextResponse.json(report);
  });
}
