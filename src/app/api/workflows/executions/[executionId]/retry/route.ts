// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Retry Execution API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { retryExecution } from '@/lib/workflow-executor';

/** POST /api/workflows/executions/[executionId]/retry — Retry a failed execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const result = await retryExecution(executionId, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (message.includes('not in a retryable')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      console.error('[Workflows API] Retry error:', error);
      return NextResponse.json(
        { error: 'Failed to retry execution' },
        { status: 500 }
      );
    }
  });
}
