// ═══════════════════════════════════════════════════════════════════
// POST + DELETE /api/reports/[id]/schedule — Schedule / Unschedule Report
// Task 7: Set up or remove scheduled report execution
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { scheduleReport, unscheduleReport } from '@/lib/advanced-reports-service';

// POST /api/reports/[id]/schedule — Set up schedule
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { cronExpression } = body;

      if (!cronExpression || typeof cronExpression !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: cronExpression (string)' },
          { status: 400 }
        );
      }

      const result = await scheduleReport(id, user.id, cronExpression);

      return NextResponse.json({ schedule: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to schedule report';
      console.error('[POST /api/reports/[id]/schedule] Error:', error);

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('owner')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      if (message.includes('Invalid cron')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      return NextResponse.json(
        { error: 'Failed to schedule report' },
        { status: 500 }
      );
    }
  });
}

// DELETE /api/reports/[id]/schedule — Remove schedule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await unscheduleReport(id, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unschedule report';
      console.error('[DELETE /api/reports/[id]/schedule] Error:', error);

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes('owner')) {
        return NextResponse.json({ error: message }, { status: 403 });
      }

      return NextResponse.json(
        { error: 'Failed to unschedule report' },
        { status: 500 }
      );
    }
  });
}
