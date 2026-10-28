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

    // Validate modelStrategy (Phase 26 Extension — parallel multi-model).
    // Accepts: { strategy: 'single'|'sequential'|'parallel'|'fallback',
    //            models?: Array<{ provider?, model?, role? }>,
    //            concurrency?: number (1..4) }
    let modelStrategy: unknown = undefined;
    if (body.modelStrategy && typeof body.modelStrategy === 'object') {
      const ms = body.modelStrategy as Record<string, unknown>;
      const strategy = typeof ms.strategy === 'string'
        ? ms.strategy
        : 'single';
      if (!['single', 'sequential', 'parallel', 'fallback'].includes(strategy)) {
        return NextResponse.json({ error: `Invalid modelStrategy.strategy: ${strategy}` }, { status: 400 });
      }
      let models: unknown = undefined;
      if (Array.isArray(ms.models)) {
        models = ms.models.filter((m): m is Record<string, unknown> =>
          m !== null && typeof m === 'object'
        ).map((m) => ({
          provider: typeof m.provider === 'string' ? m.provider : undefined,
          model: typeof m.model === 'string' ? m.model : undefined,
          role: typeof m.role === 'string' ? m.role : undefined,
        }));
      }
      let concurrency: number | undefined = undefined;
      if (typeof ms.concurrency === 'number' && ms.concurrency >= 1 && ms.concurrency <= 4) {
        concurrency = Math.floor(ms.concurrency);
      }
      modelStrategy = { strategy, ...(models ? { models } : {}), ...(concurrency ? { concurrency } : {}) };
    }

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
        modelStrategy: modelStrategy as never,
      });
      return NextResponse.json({ agent }, { status: 201 });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'create failed',
      }, { status: 400 });
    }
  });
}
