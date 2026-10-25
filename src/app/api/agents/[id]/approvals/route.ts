// GET /api/agents/[id]/approvals — list pending approvals for an agent
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const approvals = await db.agentApproval.findMany({
      where: { agentId: id, status: 'requested' },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ approvals, total: approvals.length });
  });
}
