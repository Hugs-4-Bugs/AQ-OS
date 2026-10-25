// POST /api/agents/[id]/run — manually trigger an agent run
// The runtime is the bounded reasoning loop in src/lib/ai/agent-runtime.ts.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { runAgent } from '@/lib/ai/agent-runtime';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = await request.json(); }
    catch { /* allow empty body */ }

    // Run the agent. This blocks until completion (or pause/timeout).
    // For long-running agents, the caller should set isCancelled appropriately.
    const result = await runAgent({
      agentId: id,
      userId: user.id,
      triggerSource: 'manual',
      initialPrompt: body.initialPrompt as string | undefined,
      executionId: body.executionId as string | undefined,
      runId: body.runId as string | undefined,
      leadId: body.leadId as string | undefined,
    });

    return NextResponse.json({ run: result });
  });
}
