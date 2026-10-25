// GET /api/agents/[id]/runs — list runs for an agent
// GET /api/agents/[id]/runs/[runId] — get run detail (with memory)
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; runId?: string[] }> }) {
  return withAuth(request, async (user) => {
    const { id, runId } = await params;

    // If runId in path (e.g. /api/agents/X/runs/Y) — wait, that's not how Next.js dynamic routes work.
    // This route handles /api/agents/[id]/runs (list) — the [runId] detail would be a separate route.
    // For simplicity, return the list.

    const runs = await db.agentRun.findMany({
      where: { agentId: id, userId: user.id }, // ownership filter
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ runs, total: runs.length });
  });
}
