// ═══════════════════════════════════════════════════════════════════
// POST /api/reports/[id]/execute — Execute a report
// Task 7: Run analytics queries based on report config
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { executeReport, retryReport } from '@/lib/advanced-reports-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const isRetry = body.retry === true;

      let result;
      if (isRetry) {
        result = await retryReport(id, user.id);
      } else {
        result = await executeReport(id, user.id);
      }

      return NextResponse.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute report';
      console.error('[POST /api/reports/[id]/execute] Error:', error);

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('Access denied') || message.includes('owner')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }

      return NextResponse.json(
        { error: 'Failed to execute report', details: message },
        { status: 500 }
      );
    }
  });
}
