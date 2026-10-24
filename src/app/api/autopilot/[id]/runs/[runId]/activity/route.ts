// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 25 Execution Activity API
// GET /api/autopilot/[id]/runs/[runId]/activity
//
// Returns the execution/activity event log for a specific AutopilotRun.
// The activity log records discrete events (status transitions, retry
// events, cancellations, per-lead outcomes) from the Phase 24 execution
// engine.
//
// Auth: withDualAuthPermission('pipeline:read')
// Ownership: double-scoped (run.userId + autopilot.id must both match)
// Cross-user access: NOT_FOUND (no IDOR leak)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getActivityForRun } from '@/lib/execution-activity';

type RouteContext = { params: Promise<{ id: string; runId: string }> };

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user) => {
    try {
      const { id, runId } = await request.json().then(() => ({})).catch(() => ({}))
        .then(() => {
          // params are in the URL path, not the body
          return { id: '', runId: '' };
        });

      // Extract params from the route context — Next.js 16 async params
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      // /api/autopilot/[id]/runs/[runId]/activity
      //  0    1         2     3      4         5
      const autopilotId = pathParts[2] || '';
      const targetRunId = pathParts[4] || '';

      if (!autopilotId || !targetRunId) {
        return NextResponse.json(
          { error: 'Autopilot ID and Run ID are required', code: 'VALIDATION' },
          { status: 400 }
        );
      }

      // The run must belong to BOTH the caller and this autopilot.
      const run = await db.autopilotRun.findFirst({
        where: { id: targetRunId, userId: user.id, autopilotId },
        select: { id: true, status: true, executionId: true, trigger: true, createdAt: true, startedAt: true, completedAt: true, discovered: true, saved: true, processed: true, executionsCreated: true, leadsCompleted: true, leadsFailed: true, error: true, runKey: true },
      });
      if (!run) {
        return NextResponse.json(
          { error: 'Run not found for this autopilot', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      // Get the activity log for this run (ownership-scoped)
      const activities = await getActivityForRun(targetRunId, user.id);

      return NextResponse.json({
        run: {
          id: run.id,
          status: run.status,
          executionId: run.executionId,
          trigger: run.trigger,
          createdAt: run.createdAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          discovered: run.discovered,
          saved: run.saved,
          processed: run.processed,
          executionsCreated: run.executionsCreated,
          leadsCompleted: run.leadsCompleted,
          leadsFailed: run.leadsFailed,
          error: run.error,
          runKey: run.runKey,
        },
        activities,
      });
    } catch (error) {
      console.error('[AutopilotAPI] GET [id]/runs/[runId]/activity error:', error);
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }
  });
}, '/api/autopilot/[id]/runs/[runId]/activity');
