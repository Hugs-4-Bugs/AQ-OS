// ═══════════════════════════════════════════════════════════════════
// GET /api/reports/[id]/export — Export report in various formats
// Task 7: Export report data as CSV, JSON, or PDF
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  exportReportCSV,
  exportReportJSON,
  exportReportPDF,
} from '@/lib/advanced-reports-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const format = searchParams.get('format') || 'json';

      // Validate format
      const validFormats = ['csv', 'json', 'pdf'];
      if (!validFormats.includes(format)) {
        return NextResponse.json(
          { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
          { status: 400 }
        );
      }

      switch (format) {
        case 'csv': {
          const result = await exportReportCSV(id, user.id);
          return new NextResponse(result.csv, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="${result.filename}"`,
            },
          });
        }

        case 'json': {
          const result = await exportReportJSON(id, user.id);
          return new NextResponse(result.json, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Content-Disposition': `attachment; filename="${result.filename}"`,
            },
          });
        }

        case 'pdf': {
          const result = await exportReportPDF(id, user.id);
          return NextResponse.json({
            pdfData: result.pdfData,
            filename: result.filename,
            message: 'PDF data structured for client-side rendering. Use a PDF library to generate the actual file.',
          });
        }

        default:
          return NextResponse.json(
            { error: 'Unsupported format' },
            { status: 400 }
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export report';
      console.error('[GET /api/reports/[id]/export] Error:', error);

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('Access denied') || message.includes('owner')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }

      return NextResponse.json(
        { error: 'Failed to export report' },
        { status: 500 }
      );
    }
  });
}
