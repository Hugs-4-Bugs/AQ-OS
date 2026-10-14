// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Detail API
// GET    /api/autopilot/[id] — detail + recent runs (ownership-scoped)
// PATCH  /api/autopilot/[id] — update fields and/or status transition
// DELETE /api/autopilot/[id] — delete autopilot + its runs/ledger rows
//
// Ownership: every lookup is scoped by userId — cross-user access is
// indistinguishable from "not found" (no IDOR/BOLA leak).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import {
  deleteAutopilot,
  getAutopilotForUser,
  transitionAutopilot,
  updateAutopilotFields,
} from '@/lib/autopilot/service';
import { AUTOPILOT_STATUSES, type AutopilotStatus } from '@/lib/autopilot/constants';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return withMonitoring(async (req: NextRequest) => {
    const { id } = await context.params;
    return withDualAuthPermission(req, 'pipeline:read', async (user) => {
      try {
        const autopilot = await getAutopilotForUser(user.id, id);
        if (!autopilot) {
          return NextResponse.json({ error: 'Autopilot not found' }, { status: 404 });
        }
        const runs = await db.autopilotRun.findMany({
          where: { autopilotId: autopilot.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        const ledgerCount = await db.autopilotLead.count({
          where: { autopilotId: autopilot.id },
        });
        let niches: string[] = [];
        let geography: Record<string, string> = {};
        try { niches = JSON.parse(autopilot.niches); } catch { niches = []; }
        try { geography = JSON.parse(autopilot.geography); } catch { geography = {}; }
        return NextResponse.json({
          autopilot: {
            ...autopilot,
            niches,
            geography,
            createdAt: autopilot.createdAt.toISOString(),
            updatedAt: autopilot.updatedAt.toISOString(),
            lastRunAt: autopilot.lastRunAt ? autopilot.lastRunAt.toISOString() : null,
            nextRunAt: autopilot.nextRunAt ? autopilot.nextRunAt.toISOString() : null,
          },
          runs: runs.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            startedAt: r.startedAt ? r.startedAt.toISOString() : null,
            completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          })),
          processedLeads: ledgerCount,
        });
      } catch (error) {
        console.error('[AutopilotAPI] GET [id] error:', error);
        return NextResponse.json({ error: 'Failed to fetch autopilot' }, { status: 500 });
      }
    });
  })(request);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withMonitoring(async (req: NextRequest) => {
    const { id } = await context.params;
    return withDualAuthPermission(req, 'pipeline:write', async (user) => {
      try {
        const body = await request.json() as Record<string, unknown>;
        const status = typeof body.status === 'string' ? body.status.toUpperCase() : undefined;

        // Status transition branch (activate/pause/resume/complete/disable).
        if (status !== undefined) {
          if (!(AUTOPILOT_STATUSES as readonly string[]).includes(status)) {
            return NextResponse.json({ error: 'Invalid status value', code: 'VALIDATION' }, { status: 400 });
          }
          const result = await transitionAutopilot(
            user.id,
            user.plan,
            id,
            status as AutopilotStatus
          );
          if (!result.success) {
            const httpStatus =
              result.code === 'NOT_FOUND' ? 404
              : result.code === 'PLAN_REQUIRED' ? 403
              : result.code === 'AUTOPILOT_LIMIT_REACHED' ? 403
              : result.code === 'INVALID_TRANSITION' ? 409
              : 400;
            return NextResponse.json(
              { error: result.error, code: result.code },
              { status: httpStatus }
            );
          }
          return NextResponse.json(result.autopilot);
        }

        // Field-update branch (name/niches/geography/workflowId/schedule).
        const fields: Parameters<typeof updateAutopilotFields>[2] = {};
        if (body.name !== undefined) fields.name = String(body.name);
        if (body.niches !== undefined) fields.niches = body.niches;
        if (body.geography !== undefined) fields.geography = body.geography;
        if (body.workflowId !== undefined) fields.workflowId = String(body.workflowId);
        if (body.schedule !== undefined) fields.schedule = String(body.schedule);

        const result = await updateAutopilotFields(user.id, id, fields);
        if (!result.success) {
          const httpStatus = result.code === 'NOT_FOUND' ? 404 : 400;
          return NextResponse.json({ error: result.error, code: result.code }, { status: httpStatus });
        }
        return NextResponse.json(result.autopilot);
      } catch (error) {
        console.error('[AutopilotAPI] PATCH [id] error:', error);
        return NextResponse.json({ error: 'Failed to update autopilot' }, { status: 500 });
      }
    });
  })(request);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withMonitoring(async (req: NextRequest) => {
    const { id } = await context.params;
    return withDualAuthPermission(req, 'pipeline:write', async (user) => {
      try {
        const result = await deleteAutopilot(user.id, id);
        if (!result.success) {
          const httpStatus = result.code === 'NOT_FOUND' ? 404 : result.code === 'RUNNING' ? 409 : 400;
          return NextResponse.json({ error: result.error, code: result.code }, { status: httpStatus });
        }
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('[AutopilotAPI] DELETE [id] error:', error);
        return NextResponse.json({ error: 'Failed to delete autopilot' }, { status: 500 });
      }
    });
  })(request);
}
