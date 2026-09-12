// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gap Score API
// GET: Get current competitive gap score with trend
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getGapScore } from '@/lib/competitive-gap-analysis-service';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const scoreData = await getGapScore(user.id);

      return NextResponse.json({
        success: true,
        data: {
          score: scoreData.current,
          previous: scoreData.previous,
          change: scoreData.change,
          trend: scoreData.trend,
          interpretation: interpretGapScore(scoreData.current),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load gap score';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}, 'gap-analysis/score');

function interpretGapScore(score: number): string {
  if (score >= 80) return 'Strong competitive position. Few gaps detected.';
  if (score >= 60) return 'Moderate position. Some gaps need attention.';
  if (score >= 40) return 'Vulnerable. Significant gaps require immediate action.';
  return 'Critical. Major competitive disadvantages across multiple dimensions.';
}
