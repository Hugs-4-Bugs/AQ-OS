// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/leads/export
// Phase 7: Export leads as CSV or JSON
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { exportCSV, exportJSON, exportXLSX, type LeadFilters } from '@/lib/lead-import-export-service';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // ── PLAN ENTITLEMENT (server-side, spec §11.2/§11.3) ─────────
      // data_export is disabled for free/starter and unlimited for
      // pro/elite in the existing ENTITLEMENTS matrix. It was previously
      // not enforced here — every plan could export. Authorization check
      // only: no credits are charged and no billing rules change.
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'data_export');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const { searchParams } = new URL(request.url);

      // Parse format (csv | xlsx | json)
      const format = searchParams.get('format') || 'csv';

      // Parse filters
      const filters: LeadFilters = {};
      if (searchParams.get('stage')) filters.stage = searchParams.get('stage')!;
      if (searchParams.get('niche')) filters.niche = searchParams.get('niche')!;
      if (searchParams.get('country')) filters.country = searchParams.get('country')!;
      if (searchParams.get('city')) filters.city = searchParams.get('city')!;
      if (searchParams.get('source')) filters.source = searchParams.get('source')!;
      if (searchParams.get('minRating')) filters.minRating = parseFloat(searchParams.get('minRating')!);
      if (searchParams.get('dateFrom')) filters.dateFrom = searchParams.get('dateFrom')!;
      if (searchParams.get('dateTo')) filters.dateTo = searchParams.get('dateTo')!;
      if (searchParams.get('search')) filters.search = searchParams.get('search')!;
      if (searchParams.get('hasEmail')) filters.hasEmail = searchParams.get('hasEmail')!;
      if (searchParams.get('hasPhone')) filters.hasPhone = searchParams.get('hasPhone')!;
      if (searchParams.get('hasWebsite')) filters.hasWebsite = searchParams.get('hasWebsite')!;
      if (searchParams.get('verificationStatus')) filters.verificationStatus = searchParams.get('verificationStatus')!;
      if (searchParams.get('websiteStatus')) filters.websiteStatus = searchParams.get('websiteStatus')!;

      // Export based on format
      let result;
      if (format === 'json') {
        result = await exportJSON(user.id, filters);
      } else if (format === 'xlsx') {
        result = await exportXLSX(user.id, filters);
      } else {
        result = await exportCSV(user.id, filters);
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Export failed' }, { status: 400 });
      }

      // Return file download. X-Record-Count reports the ACTUAL exported
      // row count; X-Total-Matching + X-Export-Truncated disclose any cap.
      const body: BodyInit =
        Buffer.isBuffer(result.data)
          ? new Uint8Array(result.data)
          : result.data;
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Record-Count': String(result.recordCount),
          'X-Total-Matching': String(result.totalMatching ?? result.recordCount),
          ...(result.error ? { 'X-Export-Truncated': 'true', 'X-Export-Note': encodeURIComponent(result.error) } : {}),
        },
      });
    } catch (error) {
      console.error('[API /leads/export] Error:', error);
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
  });
}
