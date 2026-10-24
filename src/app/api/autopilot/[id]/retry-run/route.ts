// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Run Retry API (Phase 24)
// POST /api/autopilot/[id]/retry-run  body: { runId }
//
// Retries the FAILED / CANCELLED / partial leads of one of the caller's
// autopilot runs by delegating to the existing workflow-batch
// retryBatchExecution on the run's underlying WorkflowExecution.
//
// Semantics (preserves all Phase 18–23 invariants):
//   · Only failed lead items are reset to 'pending' — COMPLETED leads
//     are NEVER re-executed (no duplicate outreach, no double-billing).
//   · The underlying WorkflowExecution is REUSED (no new execution row,
//     no new flat 5-credit fee). The original charge is kept.
//   · If the original run was a never-started refund, the underlying
//     engine re-charges exactly once via rechargeWorkflowExecutionFeeOnStart
//     (idempotent on wfexec-started:<executionId>).
//   · Defense-in-depth entitlement gate: the user's CURRENT plan must
//     be Pro/Elite (Phase 23 contract). A user who downgraded cannot
//     retry a previously-eligible run.
//
// Server-side enforcement chain:
//   auth → ownership (run userId + autopilot match) → entitlement gate →
//   state check → batch retry.
// Cross-user access is indistinguishable from "not found" (no IDOR leak).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { retryAutopilotRun } from '@/lib/autopilot/runner';

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

        const result = await retryAutopilotRun(user.id, runId as string);
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
        console.error('[AutopilotAPI] POST [id]/retry-run error:', error);
        return NextResponse.json({ error: 'Failed to retry run' }, { status: 500 });
      }
    });
  })(request);
}
