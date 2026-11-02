// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Overview API
//
// GET /api/admin/crm/overview
// Aggregated CRM command-center data: KPIs, Needs Attention, funnel,
// pipeline summary, outreach performance, autopilot status, BI status,
// recent activity. Read-only. PLATFORM super_admin only (withSuperAdmin).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { getCrmOverview } from '@/lib/admin/crm/crm-overview-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    try {
      const data = await getCrmOverview();
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('Admin CRM overview error:', error);
      return NextResponse.json(
        { error: 'Failed to load CRM overview' },
        { status: 500 },
      );
    }
  });
}
