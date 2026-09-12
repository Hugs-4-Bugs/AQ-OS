// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow [id] API Route
// Phase 12: Get, Update, Delete a single workflow with real DB
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getWorkflow, updateWorkflow, deleteWorkflow } from '@/lib/workflow-service';

// ─── GET: Get workflow detail ─────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const workflow = await getWorkflow(id, user.id);

      if (!workflow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(workflow);
    } catch (error) {
      console.error('[WorkflowAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workflow' },
        { status: 500 }
      );
    }
  });
}

// ─── PUT: Update a workflow ───────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();

      const result = await updateWorkflow(id, user.id, {
        name: body.name,
        description: body.description,
        triggerType: body.triggerType,
        triggerConfig: body.triggerConfig,
        nodes: body.nodes,
        edges: body.edges,
        steps: body.steps,
        status: body.status,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json(result.workflow);
    } catch (error) {
      console.error('[WorkflowAPI] PUT error:', error);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
  });
}

// ─── DELETE: Delete a workflow ─────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await deleteWorkflow(id, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[WorkflowAPI] DELETE error:', error);
      return NextResponse.json(
        { error: 'Failed to delete workflow' },
        { status: 500 }
      );
    }
  });
}
