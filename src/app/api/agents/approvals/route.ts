// GET /api/agents/approvals — list ALL pending agent approvals for the authenticated user
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const approvals = await db.agentApproval.findMany({
        where: { userId: user.id, status: 'requested' },
        orderBy: { requestedAt: 'desc' },
        take: 50,
      });
      return NextResponse.json({ approvals, total: approvals.length });
    } catch {
      return NextResponse.json({ approvals: [], total: 0 });
    }
  });
}
