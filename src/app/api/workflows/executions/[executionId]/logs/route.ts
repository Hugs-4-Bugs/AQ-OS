// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Execution Logs API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getExecutionLogs } from '@/lib/workflow-service';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

/** GET /api/workflows/executions/[executionId]/logs — Get step logs for an execution */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const { executionId } = await params;
      const logs = await getExecutionLogs(executionId, user.id);

      if (!logs) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ logs });
    } catch (error) {
      console.error('[Workflows API] Logs GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get execution logs' },
        { status: 500 }
      );
    }
  });
}
