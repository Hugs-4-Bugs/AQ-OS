// GET /api/agents/[id] — get agent
// PUT /api/agents/[id] — update agent
// DELETE /api/agents/[id] — delete agent
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getAgent, updateAgent, deleteAgent } from '@/lib/ai/agent-service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const agent = await getAgent(user.id, id);
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json({ agent });
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    try {
      const agent = await updateAgent(user.id, id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        provider: body.provider as string | undefined,
        model: body.model as string | undefined,
        toolPermissions: body.toolPermissions as Record<string, string> | undefined,
        schedule: body.schedule as never,
        triggers: body.triggers as never,
        approvalPolicy: body.approvalPolicy as never,
        retryPolicy: body.retryPolicy as never,
        memoryConfig: body.memoryConfig as never,
        status: body.status as never,
        maxIterations: body.maxIterations as number | undefined,
        timeoutMs: body.timeoutMs as number | undefined,
      });
      return NextResponse.json({ agent });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'update failed',
      }, { status: 400 });
    }
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const result = await deleteAgent(user.id, id);
    return NextResponse.json(result);
  });
}
