import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { trackSocialActivity, getPostingFrequency } from '@/lib/competitor-intelligence-service';

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

      const [socialActivity, postingFrequency] = await Promise.all([
        trackSocialActivity(id),
        getPostingFrequency(id),
      ]);

      return NextResponse.json({
        competitorId: id,
        competitorName: socialActivity.competitorName,
        socialActivity: socialActivity.activity,
        overallActivityScore: socialActivity.overallActivityScore,
        postingFrequency: postingFrequency.frequencies,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get social intelligence';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
