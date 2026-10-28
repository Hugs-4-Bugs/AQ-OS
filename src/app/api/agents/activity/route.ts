// GET /api/agents/activity — recent agent activity for the authenticated user
// Returns AgentActivity rows (tool invocations, runId, leadId, status, duration).
// Optional filters: ?agentId=, ?runId=, ?leadId=, ?limit=20
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const agentId = searchParams.get('agentId');
      const runId = searchParams.get('runId');
      const leadId = searchParams.get('leadId');
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
      const where: Record<string, unknown> = { userId: user.id };
      if (agentId) where.toolName = { contains: agentId };
      if (runId) where.runId = runId;
      if (leadId) where.leadId = leadId;
      let rows: unknown[] = [];
      try {
        rows = await db.agentActivity.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      } catch {
        // Table may not exist or be empty — return empty list
        return NextResponse.json({ activity: [], total: 0 });
      }
      return NextResponse.json({ activity: rows, total: rows.length });
    } catch (e) {
      return NextResponse.json({ activity: [], total: 0, error: e instanceof Error ? e.message : 'unknown' });
    }
  });
}
