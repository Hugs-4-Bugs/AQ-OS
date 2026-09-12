// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Cancel Execution API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { cancelExecution } from '@/lib/workflow-executor';

/** POST /api/workflows/executions/[executionId]/cancel — Cancel an execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const result = await cancelExecution(executionId, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (message.includes('cannot be cancelled')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      console.error('[Workflows API] Cancel error:', error);
      return NextResponse.json(
        { error: 'Failed to cancel execution' },
        { status: 500 }
      );
    }
  });
}
