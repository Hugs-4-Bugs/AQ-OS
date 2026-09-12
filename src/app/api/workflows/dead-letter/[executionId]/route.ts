// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dead Letter Retry API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { retryDeadLetter } from '@/lib/workflow-dlq';
import { processExecution } from '@/lib/workflow-executor';

/** POST /api/workflows/dead-letter/[executionId] — Retry a dead letter execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const result = await retryDeadLetter(executionId, user.id);

      // Kick off execution processing (non-blocking)
      processExecution(executionId).catch((err) => {
        console.error('[WorkflowService] DLQ retry processExecution error:', err);
      });

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry dead letter';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (message.includes('not in dead letter')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      console.error('[Workflows API] Dead Letter Retry error:', error);
      return NextResponse.json(
        { error: 'Failed to retry dead letter execution' },
        { status: 500 }
      );
    }
  });
}
