// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Resume Execution API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { resumeExecution } from '@/lib/workflow-executor';

/** POST /api/workflows/executions/[executionId]/resume — Resume a paused execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const result = await resumeExecution(executionId, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (message.includes('not paused')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      console.error('[Workflows API] Resume error:', error);
      return NextResponse.json(
        { error: 'Failed to resume execution' },
        { status: 500 }
      );
    }
  });
}
