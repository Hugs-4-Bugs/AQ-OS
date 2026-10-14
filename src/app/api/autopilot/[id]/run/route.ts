// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Manual Run API
// POST /api/autopilot/[id]/run — trigger one run now (manual)
//
// Server-side enforcement chain:
//   auth → ownership → autopilot_access entitlement → ACTIVE state →
//   no in-flight run → atomic ACTIVE→RUNNING claim → execute.
// A run in progress cannot be double-started; the run row itself is
// claimed QUEUED→RUNNING atomically inside the runner.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import { runAutopilot } from '@/lib/autopilot/runner';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withMonitoring(async (req: NextRequest) => {
    const { id } = await context.params;
    return withDualAuthPermission(req, 'pipeline:write', async (user) => {
      try {
        // Server-side entitlement — free/starter can never run Autopilot.
        const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
        if (!entitlementCheck.allowed) return entitlementCheck.response!;

        const result = await runAutopilot(id, user.id, 'manual');
        if (!result.ok) {
          const httpStatus =
            result.code === 'NOT_FOUND' ? 404
            : result.code === 'INVALID_STATE' ? 409
            : result.code === 'RUN_IN_PROGRESS' ? 409
            : result.code === 'STATE_CONFLICT' ? 409
            : 400;
          return NextResponse.json(
            { error: result.error, code: result.code, runId: result.runId },
            { status: httpStatus }
          );
        }

        return NextResponse.json({
          runId: result.runId,
          status: result.outcome?.status ?? 'UNKNOWN',
          discovered: result.outcome?.discovered ?? 0,
          saved: result.outcome?.saved ?? 0,
          processed: result.outcome?.processed ?? 0,
          executionsCreated: result.outcome?.executionsCreated ?? 0,
          perNiche: result.outcome?.perNiche ?? [],
          ...(result.outcome?.error ? { error: result.outcome.error } : {}),
        });
      } catch (error) {
        console.error('[AutopilotAPI] POST [id]/run error:', error);
        return NextResponse.json({ error: 'Failed to run autopilot' }, { status: 500 });
      }
    });
  })(request);
}
