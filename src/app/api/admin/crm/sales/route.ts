// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Sales Command Center API
//
// GET /api/admin/crm/sales?dateRange=30d&source=&channel=&stage=&niche=&country=&hotOnly=
// Read-only. super_admin only (withSuperAdmin).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { getSalesOverview, type DateRange, type SalesQuery } from '@/lib/admin/crm/crm-sales-service';
import type { CanonicalStage } from '@/lib/admin/crm/crm-stage-vocabulary';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_RANGES: DateRange[] = ['today', 'yesterday', '7d', '30d', '90d', '6m', '1y'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    try {
      const sp = new URL(request.url).searchParams;
      const dateRange = (sp.get('dateRange') || '30d') as DateRange;
      if (!VALID_RANGES.includes(dateRange)) {
        return NextResponse.json({ error: 'Invalid dateRange' }, { status: 400 });
      }
      const query: SalesQuery = {
        dateRange,
        source: (sp.get('source') || 'all') as SalesQuery['source'],
        channel: (sp.get('channel') || 'all') as SalesQuery['channel'],
        stage: ((sp.get('stage') || 'all') as CanonicalStage | 'all'),
        niche: sp.get('niche') || 'all',
        country: sp.get('country') || 'all',
        hotOnly: sp.get('hotOnly') === 'true',
      };
      const data = await getSalesOverview(query);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('Admin CRM sales error:', error);
      return NextResponse.json({ error: 'Failed to load sales overview' }, { status: 500 });
    }
  });
}
