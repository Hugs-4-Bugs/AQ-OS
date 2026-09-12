// ═══════════════════════════════════════════════════════════════════
// GET /api/competitors/[id]/insights — AI-generated strategic insights
// Phase 13: Competitor AI Insights
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { generateAIInsights } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const insights = await generateAIInsights(user.id, id);

      return NextResponse.json({ insights });
    } catch (error) {
      console.error('[GET /api/competitors/[id]/insights] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate insights';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
