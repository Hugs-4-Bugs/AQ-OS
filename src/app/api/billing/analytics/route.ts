// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/billing/analytics
// Get billing analytics (MRR, ARR, churn, revenue, etc.)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getCompleteAnalytics } from '@/lib/billing-analytics-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // ACCOUNT ISOLATION: this endpoint returns PLATFORM-WIDE billing
      // analytics (all tenants' MRR/ARR/churn/revenue). Only the platform
      // super_admin may see it — org-level owner/admin roles are
      // tenant-scoped and were previously able to read global revenue.
      if (user.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Super admin access required to view billing analytics' },
          { status: 403 }
        );
      }

      const { searchParams } = new URL(request.url);
      const currency = searchParams.get('currency') || 'USD';

      const analytics = await getCompleteAnalytics(currency);

      return NextResponse.json({
        success: true,
        analytics,
      });
    } catch (error) {
      console.error('[API] Billing analytics error:', error);
      return NextResponse.json(
        { error: 'Failed to get billing analytics' },
        { status: 500 }
      );
    }
  });
}
