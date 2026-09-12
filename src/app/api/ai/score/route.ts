// ═══════════════════════════════════════════════════════════════════
// POST /api/ai/score — AI-powered lead scoring
// Phase 8: AI Scoring API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { scoreLead } from '@/lib/ai/scoring-engine';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId, force } = body;

      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      const result = await scoreLead({
        leadId,
        userId: user.id,
        force: force === true,
      });

      if (!result.success) {
        const statusCode = result.error?.includes('Insufficient credits') ? 402 : 500;
        return NextResponse.json(
          { error: result.error },
          { status: statusCode }
        );
      }

      return NextResponse.json({
        success: true,
        scores: result.scores,
        creditsDeducted: result.creditsDeducted,
        newBalance: result.newBalance,
      });
    } catch (error) {
      console.error('[API /ai/score] Error:', error);
      return NextResponse.json(
        { error: 'Failed to score lead' },
        { status: 500 }
      );
    }
  });
}
