// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/invoices
// Phase 5: List invoices for the authenticated user
//
// Auth: Required (withAuth)
// Query: ?limit=20&offset=0
// Returns: { invoices: [], total: number }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getInvoicesForUser } from '@/lib/invoice-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
      const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

      const result = await getInvoicesForUser(user.id, { limit, offset });

      // Log invoice list access
      await logBillingEvent({
        userId: user.id,
        action: 'payment_completed', // Using closest matching event type for "viewed invoices"
        details: `Invoice list accessed (${result.invoices.length} of ${result.total})`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          limit,
          offset,
          total: result.total,
        },
      });

      return NextResponse.json({
        invoices: result.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          currency: inv.currency,
          status: inv.status,
          plan: inv.plan,
          billingCycle: inv.billingCycle,
          createdAt: inv.createdAt.toISOString(),
        })),
        total: result.total,
      });
    } catch (error) {
      console.error('[API] Get invoices error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve invoices' },
        { status: 500 }
      );
    }
  });
}
