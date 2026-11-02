// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Leads API
//
// GET /api/admin/crm/leads?stage=&source=&search=&hotOnly=&staleOnly=&hasEmail=&limit=&offset=
// GET /api/admin/crm/leads?id=<leadId>   (single lead detail)
// Read-only. super_admin only.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { getLeads, getLeadDetail } from '@/lib/admin/crm/crm-lead-service';
import type { CanonicalStage } from '@/lib/admin/crm/crm-stage-vocabulary';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    try {
      const url = new URL(request.url);
      const sp = url.searchParams;

      // Single lead detail
      const leadId = sp.get('id');
      if (leadId) {
        const lead = await getLeadDetail(leadId);
        if (!lead) {
          return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: lead });
      }

      // List with filters
      const stage = (sp.get('stage') || undefined) as CanonicalStage | 'all' | undefined;
      const source = sp.get('source') || undefined;
      const search = sp.get('search') || undefined;
      const hotOnly = sp.get('hotOnly') === 'true';
      const staleOnly = sp.get('staleOnly') === 'true';
      const hasEmail = sp.get('hasEmail') === 'true';
      const limit = sp.get('limit') ? parseInt(sp.get('limit')!, 10) : undefined;
      const offset = sp.get('offset') ? parseInt(sp.get('offset')!, 10) : undefined;

      const result = await getLeads({
        stage: stage || 'all',
        source: source || 'all',
        search,
        hotOnly,
        staleOnly,
        hasEmail,
        limit,
        offset,
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      console.error('Admin CRM leads error:', error);
      return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
    }
  });
}
