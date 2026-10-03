// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Logs API Route
// Phase 12: Get execution logs with step-level detail
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getExecutionDetail } from '@/lib/workflow-engine';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const { searchParams } = new URL(request.url);
      const executionId = searchParams.get('executionId');

      if (!executionId) {
        return NextResponse.json(
          { error: 'executionId query parameter is required' },
          { status: 400 }
        );
      }

      const result = await getExecutionDetail(executionId, user.id);

      if (!result) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('[WorkflowLogsAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch execution logs' },
        { status: 500 }
      );
    }
  });
}
