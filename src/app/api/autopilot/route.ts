// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot API
// GET  /api/autopilot — list the caller's autopilots (ownership-scoped)
// POST /api/autopilot — create an autopilot (server-side entitlement)
//
// Entitlement matrix (authoritative source: entitlement-service.ts):
//   free/starter → 403 PLAN_REQUIRED (no row, no work, no credits)
//   pro          → max 3 ACTIVE+RUNNING
//   elite        → max 7 ACTIVE+RUNNING
// DRAFT autopilots do not consume an active slot; RUNNING counts.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import {
  createAutopilot,
  listAutopilots,
  parseAutopilotConfig,
  checkAutopilotSlot,
  normalizePlan,
} from '@/lib/autopilot/service';

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user) => {
    try {
      const plan = normalizePlan(user.plan);
      const entitlement = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      const items = entitlement.allowed ? await listAutopilots(user.id) : [];
      return NextResponse.json({
        autopilots: items,
        plan,
        entitlement: entitlement.allowed
          ? await (async () => {
              const slot = await checkAutopilotSlot(user.id, user.plan);
              return { limit: slot.limit, used: slot.used, allowed: true };
            })()
          : { limit: 0, used: 0, allowed: false },
      });
    } catch (error) {
      console.error('[AutopilotAPI] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch autopilots' }, { status: 500 });
    }
  });
}, '/api/autopilot');

export const POST = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:write', async (user) => {
    try {
      // ── Server-side entitlement: free/starter are rejected BEFORE any
      // row, work, or credit consumption. ──
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const body = await request.json() as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name : '';
      const workflowId = typeof body.workflowId === 'string' ? body.workflowId.trim() : '';
      // Phase 22 — schedule may be a legacy whitelist string OR a
      // canonical {every, unit, timezone, startAt?, enabled?} object;
      // validated server-side by the canonical schedule module.
      const schedule = body.schedule === undefined ? 'daily' : body.schedule;
      const activate = body.activate === true;

      const parsed = parseAutopilotConfig(body.niches, body.geography);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error, code: 'VALIDATION' }, { status: 400 });
      }
      if (!workflowId) {
        return NextResponse.json(
          { error: 'workflowId is required — select the workflow Autopilot should execute', code: 'VALIDATION' },
          { status: 400 }
        );
      }

      const result = await createAutopilot(
        user.id,
        user.orgId || null,
        user.plan,
        {
          name,
          niches: parsed.value.niches,
          geography: parsed.value.geography,
          workflowId,
          schedule,
          activate,
          // Phase 20 — optional niche → Business Profile mapping
          // (validated server-side: shape + selected-niche keys + ownership).
          profileMappings: body.profileMappings,
        }
      );

      if (!result.success) {
        const status =
          result.code === 'PLAN_REQUIRED' ? 403
          : result.code === 'AUTOPILOT_LIMIT_REACHED' ? 403
          : 400;
        return NextResponse.json(
          { error: result.error, code: result.code },
          { status }
        );
      }

      return NextResponse.json(result.autopilot, { status: 201 });
    } catch (error) {
      console.error('[AutopilotAPI] POST error:', error);
      return NextResponse.json({ error: 'Failed to create autopilot' }, { status: 500 });
    }
  });
}, '/api/autopilot');
