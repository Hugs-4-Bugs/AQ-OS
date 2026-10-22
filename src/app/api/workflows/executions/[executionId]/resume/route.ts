// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Resume Execution API
// Phase 4: operates on the MAIN workflow engine (same engine that creates
// executions) — the legacy parallel executor is no longer used here, so
// retry/pause/resume/cancel behave consistently with how the execution
// was created and with its persisted step source.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { resumeExecution } from '@/lib/workflow-engine';
import { resumeBatchExecution } from '@/lib/workflow-batch';
import { hasLeadItems } from '@/lib/workflow-execution-leads';

/** POST /api/workflows/executions/[executionId]/resume — Resume an execution.
 *
 * Multi-lead batch executions resume the interrupted lead from its last
 * completed step and continue the still-pending leads; legacy single-lead
 * executions keep the engine's from-current-step resume. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const batch = await hasLeadItems(executionId);
      const result = batch
        ? await resumeBatchExecution(executionId, user.id)
        : await resumeExecution(executionId, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json(
          { success: false, error: result.error },
          { status }
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      console.error('[Workflows API] Resume error:', error);
      return NextResponse.json(
        { error: 'Failed to resume execution' },
        { status: 500 }
      );
    }
  });
}
