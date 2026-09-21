import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { extractKeywords, getSEORanking, getMetadataEvolution } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // ACCOUNT ISOLATION: the competitor record must belong to the
      // caller before any intelligence data is read from it.
      const owned = await db.competitorAnalysis.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
      }

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
