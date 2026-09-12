// ═══════════════════════════════════════════════════════════════════
// POST /api/competitors/[id]/compare — Compare competitors
// Phase 13: Competitor Comparison
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { compareCompetitors } from '@/lib/competitor-intelligence-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { competitorIds } = body;

      if (!competitorIds || !Array.isArray(competitorIds) || competitorIds.length < 1) {
        return NextResponse.json(
          { error: 'At least 2 competitor IDs are required for comparison' },
          { status: 400 }
        );
      }

      // Include the current competitor in the comparison
      const allIds = [id, ...competitorIds.filter((cid: string) => cid !== id)];

      const comparison = await compareCompetitors(user.id, allIds);

      return NextResponse.json({ comparison });
    } catch (error) {
      console.error('[POST /api/competitors/[id]/compare] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to compare competitors';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
