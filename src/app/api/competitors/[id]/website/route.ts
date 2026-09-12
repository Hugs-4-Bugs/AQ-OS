import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { detectLayoutChanges, detectCTAChanges, detectContentChanges } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;

      const [layoutChanges, ctaChanges, contentChanges] = await Promise.all([
        detectLayoutChanges(id),
        detectCTAChanges(id),
        detectContentChanges(id),
      ]);

      return NextResponse.json({
        competitorId: id,
        competitorName: layoutChanges.competitorName,
        layoutChanges: layoutChanges.changes,
        ctaChanges: ctaChanges.changes,
        contentChanges: contentChanges.metrics,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get website intelligence';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
