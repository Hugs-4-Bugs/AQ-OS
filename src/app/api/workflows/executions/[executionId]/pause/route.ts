// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Pause Execution API
// Phase 4: operates on the MAIN workflow engine (same engine that creates
// executions) — the legacy parallel executor is no longer used here, so
// retry/pause/resume/cancel behave consistently with how the execution
// was created and with its persisted step source.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { pauseExecution } from '@/lib/workflow-engine';

/** POST /api/workflows/executions/[executionId]/pause — Pause an execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const result = await pauseExecution(executionId, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json(
          { success: false, error: result.error },
          { status }
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      console.error('[Workflows API] Pause error:', error);
      return NextResponse.json(
        { error: 'Failed to pause execution' },
        { status: 500 }
      );
    }
  });
}
