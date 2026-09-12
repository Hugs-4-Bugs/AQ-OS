// ═══════════════════════════════════════════════════════════════════
// GET /api/competitors/[id]/opportunities — Detected opportunities
// Phase 13: Competitor Opportunities
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { detectOpportunities } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const opportunities = await detectOpportunities(user.id, id);

      return NextResponse.json({ opportunities });
    } catch (error) {
      console.error('[GET /api/competitors/[id]/opportunities] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to detect opportunities';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
