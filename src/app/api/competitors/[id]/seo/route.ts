import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { extractKeywords, getSEORanking, getMetadataEvolution } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;

      const [keywords, seoRanking, metadataEvolution] = await Promise.all([
        extractKeywords(id),
        getSEORanking(id),
        getMetadataEvolution(id),
      ]);

      return NextResponse.json({
        competitorId: id,
        competitorName: keywords.competitorName,
        keywords: keywords.keywords,
        seoRanking: {
          score: seoRanking.score,
          breakdown: seoRanking.breakdown,
        },
        metadataEvolution: metadataEvolution.evolution,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get SEO intelligence';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
