// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflows API Route
// Phase 12: List and Create workflows with real DB
// Updated: Dual auth with permission check + org isolation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { listWorkflows, createWorkflow } from '@/lib/workflow-service';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import { withMonitoring } from '@/lib/observability/middleware';

// Need to import the type
type CreateWorkflowStepInput = {
  type: string;
  name: string;
  config: Record<string, unknown>;
  order: number;
  nextStepId?: string;
};

// ─── GET: List all workflows ──────────────────────────────

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user, apiKeyInfo) => {
    try {
      const { searchParams } = new URL(request.url);
      const filters = {
        status: searchParams.get('status') || undefined,
        triggerType: searchParams.get('triggerType') || undefined,
        search: searchParams.get('search') || undefined,
        page: parseInt(searchParams.get('page') || '1', 10),
        limit: parseInt(searchParams.get('limit') || '20', 10),
      };

      const result = await listWorkflows(user.id, filters);
      return NextResponse.json(result);
    } catch (error) {
      console.error('[WorkflowsAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workflows' },
        { status: 500 }
      );
    }
  });
}, '/api/workflows');

// ─── POST: Create a new workflow ──────────────────────────

export const POST = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:write', async (user, apiKeyInfo) => {
    try {
      // Entitlement check: workflow_access feature
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const body = await request.json();
      const {
        name,
        description,
        triggerType,
        triggerConfig,
        nodes,
        edges,
        steps,
        status,
      } = body as Record<string, unknown>;

      const result = await createWorkflow(user.id, {
        name: String(name || ''),
        description: description ? String(description) : undefined,
        triggerType: String(triggerType || ''),
        triggerConfig: triggerConfig as Record<string, unknown> | undefined,
        nodes: nodes as unknown[] | undefined,
        edges: edges as unknown[] | undefined,
        steps: steps as CreateWorkflowStepInput[] | undefined,
        status: status ? String(status) : undefined,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json(result.workflow, { status: 201 });
    } catch (error) {
      console.error('[WorkflowsAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
  });
}, '/api/workflows');
