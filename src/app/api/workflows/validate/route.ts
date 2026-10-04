import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { executeWorkflow } from '@/lib/workflow-executor';

/**
 * POST /api/workflows/validate
 *
 * Run end-to-end validation of the workflow execution pipeline.
 * Creates a test execution and tracks it through the pipeline.
 *
 * Body: { workflowId: string, testLeadId?: string }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { workflowId, testLeadId } = body;

      if (!workflowId) {
        return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
      }

      // 1. Verify workflow exists and is active
      const workflow = await db.workflowDefinition.findFirst({
        where: { id: workflowId, userId: user.id },
      });

      if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }

      // 2. Verify workflow has valid structure
      const nodes = JSON.parse(workflow.nodes);
      const edges = JSON.parse(workflow.edges);
      const triggerNode = nodes.find((n: { type: string }) => n.type === 'trigger');
      const actionNodes = nodes.filter((n: { type: string }) => n.type !== 'trigger');

      const validationErrors: string[] = [];

      if (!triggerNode) validationErrors.push('No trigger node found');
      if (actionNodes.length === 0) validationErrors.push('No action nodes found');
      if (workflow.triggerType === 'webhook_trigger' && !workflow.webhookPath) {
        validationErrors.push('Webhook trigger but no webhook path configured');
      }

      // Check node connectivity
      const nodeIds = new Set(nodes.map((n: { id: string }) => n.id));
      for (const edge of edges) {
        if (!nodeIds.has(edge.source)) validationErrors.push(`Edge references missing source node: ${edge.source}`);
        if (!nodeIds.has(edge.target)) validationErrors.push(`Edge references missing target node: ${edge.target}`);
      }

      // Check for orphan nodes (nodes not connected from trigger)
      if (triggerNode && actionNodes.length > 0) {
        const reachable = new Set<string>();
        reachable.add(triggerNode.id);
        const edgeMap = new Map<string, string[]>();
        for (const edge of edges) {
          const existing = edgeMap.get(edge.source) || [];
          existing.push(edge.target);
          edgeMap.set(edge.source, existing);
        }
        // BFS from trigger
        const queue = [triggerNode.id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const targets = edgeMap.get(current) || [];
          for (const t of targets) {
            if (!reachable.has(t)) {
              reachable.add(t);
              queue.push(t);
            }
          }
        }
        const orphanNodes = actionNodes.filter((n: { id: string }) => !reachable.has(n.id));
        if (orphanNodes.length > 0) {
          validationErrors.push(`${orphanNodes.length} orphan node(s) not reachable from trigger`);
        }
      }

      // 3. Verify DB tables exist and are accessible
      const dbChecks: Record<string, boolean> = {};
      try {
        await db.workflowDefinition.count({ where: { id: workflowId } });
        dbChecks.workflowDefinitions = true;
      } catch { dbChecks.workflowDefinitions = false; }
      try {
        await db.workflowStep.count({ where: { workflowId } });
        dbChecks.workflowSteps = true;
      } catch { dbChecks.workflowSteps = false; }
      try {
        await db.workflowExecution.count({ where: { workflowId } });
        dbChecks.workflowExecutions = true;
      } catch { dbChecks.workflowExecutions = false; }
      try {
        await db.workflowLog.count({ where: { executionId: 'nonexistent' } });
        dbChecks.workflowLogs = true;
      } catch { dbChecks.workflowLogs = false; }

      // 4. If validation passes, try a test execution
      let executionResult = null;
      if (validationErrors.length === 0) {
        try {
          const triggerData: Record<string, unknown> = {
            source: 'validation_test',
            timestamp: new Date().toISOString(),
          };
          if (testLeadId) triggerData.leadId = testLeadId;

          executionResult = await executeWorkflow(
            workflowId,
            user.id,
            triggerData
          );
        } catch (error) {
          validationErrors.push(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 5. Build result
      const result = {
        valid: validationErrors.length === 0,
        errors: validationErrors,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
          triggerType: workflow.triggerType,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          actionCount: actionNodes.length,
          stepCount: await db.workflowStep.count({ where: { workflowId } }),
        },
        dbChecks,
        execution: executionResult ? {
          id: executionResult.id,
          status: executionResult.status,
          queued: true,
        } : null,
      };

      return NextResponse.json(result);
    } catch (error) {
      console.error('[Workflow Validate] Error:', error);
      return NextResponse.json(
        { error: 'Validation failed', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  });
}
