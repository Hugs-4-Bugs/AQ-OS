// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dead Letter Retry API
// Phase 4: re-runs dead-lettered executions through the MAIN workflow
// engine (retryExecution) — the legacy parallel executor is no longer
// involved, so DLQ retries get the same ordering, retry, timeout,
// cancellation and honest-status semantics as every other re-run.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { retryDeadLetter } from '@/lib/workflow-dlq';
import { retryExecution } from '@/lib/workflow-engine';

/** POST /api/workflows/dead-letter/[executionId] — Retry a dead letter execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const reset = await retryDeadLetter(executionId, user.id);

      // Re-run through the main engine — the response reports the ACTUAL
      // outcome of the re-run, not just the reset.
      const result = await retryExecution(executionId, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json(
          { success: false, error: result.error, reset },
          { status }
        );
      }

      return NextResponse.json({ ...result, reset });
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
