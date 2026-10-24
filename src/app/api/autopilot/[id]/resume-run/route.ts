// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Run Resume API (Phase 24)
// POST /api/autopilot/[id]/resume-run  body: { runId }
//
// Resumes a PAUSED AutopilotRun by delegating to the existing workflow-batch
// resumeBatchExecution on the run's underlying WorkflowExecution.
//
// Semantics (preserves all Phase 18–23 invariants):
//   · Only 'skipped' lead items are reset to 'pending' — completed leads
//     are NEVER re-executed. The interrupted-in-flight lead resumes from
//     its persisted stepSummary at the next-completed-step + 1.
//   · The underlying WorkflowExecution is REUSED (no new execution row,
//     no new flat 5-credit fee). The original charge is kept.
//   · Defense-in-depth entitlement gate: the user's CURRENT plan must
//     be Pro/Elite (Phase 23 contract).
//
// Server-side enforcement chain:
//   auth → ownership (run userId + autopilot match) → entitlement gate →
//   state check → batch resume.
// Cross-user access is indistinguishable from "not found" (no IDOR leak).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { resumeAutopilotRun } from '@/lib/autopilot/runner';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withMonitoring(async (req: NextRequest) => {
    const { id } = await context.params;
    return withDualAuthPermission(req, 'pipeline:write', async (user) => {
      try {
        let runId: string | null = null;
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.runId === 'string' && body.runId.trim()) {
            runId = body.runId.trim();
          }
        } catch {
          // No/invalid body — handled by the validation below.
        }
        if (!runId) {
          return NextResponse.json(
            { error: 'runId is required in the request body', code: 'VALIDATION' },
            { status: 400 }
          );
        }

        // The run must belong to BOTH the caller and this autopilot.
        const run = await db.autopilotRun.findFirst({
          where: { id: runId, userId: user.id, autopilotId: id },
          select: { id: true },
        });
        if (!run) {
          return NextResponse.json(
            { error: 'Run not found for this autopilot', code: 'NOT_FOUND' },
            { status: 404 }
          );
        }

        const result = await resumeAutopilotRun(user.id, runId as string);
        if (!result.ok) {
          const httpStatus =
            result.code === 'NOT_FOUND' ? 404
            : result.code === 'PLAN_INELIGIBLE' ? 403
            : result.code === 'INVALID_STATE' ? 409
            : result.code === 'BATCH_ERROR' ? 422
            : 400;
          return NextResponse.json(
            { error: result.error, code: result.code },
            { status: httpStatus }
          );
        }
        return NextResponse.json({ run: result.run });
      } catch (error) {
        console.error('[AutopilotAPI] POST [id]/resume-run error:', error);
        return NextResponse.json({ error: 'Failed to resume run' }, { status: 500 });
      }
    });
  })(request);
}
