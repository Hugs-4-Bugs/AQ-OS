// ═══════════════════════════════════════════════════════════════════
// GET + DELETE /api/reports/[id] — Get or delete a single report
// Phase 13: Retrieve and delete reports with ownership verification
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const report = await db.report.findUnique({
        where: { id },
      });

      if (!report) {
        return NextResponse.json(
          { error: 'Report not found' },
          { status: 404 }
        );
      }

      // Verify ownership
      if (report.userId !== user.id) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json({ report });
    } catch (error) {
      console.error('[GET /api/reports/[id]] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch report' },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const report = await db.report.findUnique({
        where: { id },
      });

      if (!report) {
        return NextResponse.json(
          { error: 'Report not found' },
          { status: 404 }
        );
      }

      // Verify ownership
      if (report.userId !== user.id) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      await db.report.delete({
        where: { id },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[DELETE /api/reports/[id]] Error:', error);
      return NextResponse.json(
        { error: 'Failed to delete report' },
        { status: 500 }
      );
    }
  });
}
