// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/leads/export
// Phase 7: Export leads as CSV or JSON
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { exportCSV, exportJSON, type LeadFilters } from '@/lib/lead-import-export-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse format
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

      // Export based on format
      let result;
      if (format === 'json') {
        result = await exportJSON(user.id, filters);
      } else {
        result = await exportCSV(user.id, filters);
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Export failed' }, { status: 400 });
      }

      // Return file download
      return new NextResponse(result.data, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Record-Count': String(result.recordCount),
        },
      });
    } catch (error) {
      console.error('[API /leads/export] Error:', error);
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
  });
}
