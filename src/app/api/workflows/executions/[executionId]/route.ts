// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Execution Detail API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getExecution } from '@/lib/workflow-service';

/** GET /api/workflows/executions/[executionId] — Get execution detail with step logs */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { executionId } = await params;
      const execution = await getExecution(executionId, user.id);

      if (!execution) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(execution);
    } catch (error) {
      console.error('[Workflows API] Execution GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get execution' },
        { status: 500 }
      );
    }
  });
}
