// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Run Cancellation API (Phase 18)
// POST /api/autopilot/[id]/cancel-run  body: { runId }
//
// Cancels a QUEUED or RUNNING run of one of the caller's autopilots:
//   QUEUED  → CANCELLED atomically (the runner's claim then loses).
//   RUNNING → CANCELLED + the parent execution stops at the next step
//             boundary (existing engine cancellation machinery); the
//             settle finalizer updates per-lead ledger statuses.
// Terminal runs are rejected — history is never rewritten.
//
// Server-side enforcement chain:
//   auth → ownership (run userId + autopilot match) → state check → cancel.
// Cross-user access is indistinguishable from "not found" (no IDOR leak).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { cancelAutopilotRun } from '@/lib/autopilot/runner';

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

        const result = await cancelAutopilotRun(user.id, runId as string);
        if (!result.ok) {
          const httpStatus =
            result.code === 'NOT_FOUND' ? 404
            : result.code === 'INVALID_STATE' ? 409
            : result.code === 'STATE_CONFLICT' ? 409
            : 400;
          return NextResponse.json(
            { error: result.error, code: result.code },
            { status: httpStatus }
          );
        }
        return NextResponse.json({ run: result.run });
      } catch (error) {
        console.error('[AutopilotAPI] POST [id]/cancel-run error:', error);
        return NextResponse.json({ error: 'Failed to cancel run' }, { status: 500 });
      }
    });
  })(request);
}
