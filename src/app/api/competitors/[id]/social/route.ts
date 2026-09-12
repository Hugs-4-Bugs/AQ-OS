import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { trackSocialActivity, getPostingFrequency } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;

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
