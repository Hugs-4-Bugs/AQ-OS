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
      // Only allow admin/owner access to billing analytics
      if (!['owner', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Admin access required to view billing analytics' },
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
