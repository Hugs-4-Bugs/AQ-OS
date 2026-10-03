// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Pause Execution API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { pauseExecution } from '@/lib/workflow-executor';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

/** POST /api/workflows/executions/[executionId]/pause — Pause a running execution */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const { executionId } = await params;
      const result = await pauseExecution(executionId, user.id);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause execution';

      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 });
      }

      if (message.includes('not running')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      console.error('[Workflows API] Pause error:', error);
      return NextResponse.json(
        { error: 'Failed to pause execution' },
        { status: 500 }
      );
    }
  });
}
