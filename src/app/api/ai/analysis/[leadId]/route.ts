// ═══════════════════════════════════════════════════════════════════
// GET /api/ai/analysis/[leadId] — Get existing AI analysis for a lead
// Phase 8: Lead Analysis Retrieval API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getLeadAnalysis } from '@/lib/ai/lead-analysis-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { leadId } = await params;

      if (!leadId) {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      const analysis = await getLeadAnalysis(leadId);

      if (!analysis) {
        return NextResponse.json(
          { error: 'No analysis found for this lead', hasAnalysis: false },
          { status: 404 }
        );
      }

      // Also get the lead scores
      const { db } = await import('@/lib/db');
      const scores = await db.leadScore.findMany({
        where: { leadId },
        orderBy: { scoredAt: 'desc' },
        take: 10,
      });

      return NextResponse.json({
        success: true,
        hasAnalysis: true,
        analysis,
        scores: scores.map(s => ({
          type: s.scoreType,
          score: s.score,
          explanation: s.explanation,
          modelVersion: s.modelVersion,
          scoredAt: s.scoredAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('[API /ai/analysis] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get analysis' },
        { status: 500 }
      );
    }
  });
}
