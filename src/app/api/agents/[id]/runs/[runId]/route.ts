// GET /api/agents/[id]/runs/[runId] — get run detail with memory
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  return withAuth(request, async (user) => {
    const { id, runId } = await params;
    const run = await db.agentRun.findFirst({
      where: { id: runId, agentId: id, userId: user.id }, // ownership filter
    });
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    const memory = await db.agentMemory.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const approvals = await db.agentApproval.findMany({
      where: { runId: run.id },
      orderBy: { requestedAt: 'desc' },
    });
    return NextResponse.json({ run, memory, approvals });
  });
}
