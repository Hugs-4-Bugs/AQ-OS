// Agents API — POST/GET (already created above)
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createAgent, listAgents } from '@/lib/ai/agent-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const agents = await listAgents(user.id);
    return NextResponse.json({ agents, total: agents.length });
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    try {
      const agent = await createAgent(user.id, user.orgId || null, {
        name: body.name as string,
        description: body.description as string | undefined,
        provider: body.provider as string | undefined,
        model: body.model as string | undefined,
        toolPermissions: body.toolPermissions as Record<string, string> | undefined,
        schedule: body.schedule as never,
        triggers: body.triggers as never,
        approvalPolicy: body.approvalPolicy as never,
        retryPolicy: body.retryPolicy as never,
        memoryConfig: body.memoryConfig as never,
        maxIterations: body.maxIterations as number | undefined,
        timeoutMs: body.timeoutMs as number | undefined,
      });
      return NextResponse.json({ agent }, { status: 201 });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'create failed',
      }, { status: 400 });
    }
  });
}
