// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Eligible-Workflow API (Phase 19)
// GET /api/autopilot/workflows — the authenticated user's dynamically
// eligible workflows for the Autopilot selector.
//
// Eligibility (canonical rule, ONE definition in autopilot/service.ts):
//   the workflow exists AND belongs to the caller AND is active.
// The list is derived LIVE from the workflow system — never a fixed
// list — so newly created active workflows appear automatically.
//
// Entitlement mirrors GET /api/autopilot: free/starter receive 200 with
// an empty list + entitlement.allowed=false (the UI shows the plan
// gate); pro/elite get their real workflows. No workflow rows, charges,
// or executions are produced by this read-only route.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import {
  listEligibleWorkflows,
  checkAutopilotSlot,
  normalizePlan,
} from '@/lib/autopilot/service';

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user) => {
    try {
      const plan = normalizePlan(user.plan);
      const entitlement = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      const workflows = entitlement.allowed ? await listEligibleWorkflows(user.id) : [];
      return NextResponse.json({
        workflows,
        total: workflows.length,
        plan,
        entitlement: entitlement.allowed
          ? await (async () => {
              const slot = await checkAutopilotSlot(user.id, user.plan);
              return { limit: slot.limit, used: slot.used, allowed: true };
            })()
          : { limit: 0, used: 0, allowed: false },
      });
    } catch (error) {
      console.error('[AutopilotAPI] GET workflows error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch eligible workflows' },
        { status: 500 }
      );
    }
  });
}, '/api/autopilot/workflows');
