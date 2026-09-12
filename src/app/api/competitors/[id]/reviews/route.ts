import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { analyzeReviewsSentiment, getReviewsTrend } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;

      const [sentiment, reviewsTrend] = await Promise.all([
        analyzeReviewsSentiment(id),
        getReviewsTrend(id),
      ]);

      return NextResponse.json({
        competitorId: id,
        competitorName: sentiment.competitorName,
        sentiment: sentiment.sentiment,
        reviewsTrend: reviewsTrend.trend,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get reviews intelligence';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
