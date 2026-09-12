// ═══════════════════════════════════════════════════════════════════
// GET + DELETE /api/competitors/[id] — Single competitor profile
// Phase 13: Full competitor details with snapshots + delete
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getCompetitorById, deleteCompetitor } from '@/lib/competitor-intelligence-service';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const analysis = await getCompetitorById(id, user.id);

      if (!analysis) {
        return NextResponse.json(
          { error: 'Competitor not found' },
          { status: 404 }
        );
      }

      // Get CompetitorData if linked
      const analysisRecord = await db.competitorAnalysis.findUnique({
        where: { id },
        select: { competitorDataId: true },
      });

      let competitorData: Awaited<ReturnType<typeof db.competitorData.findFirst>> = null;
      if (analysisRecord?.competitorDataId) {
        competitorData = await db.competitorData.findFirst({
          where: { id: analysisRecord.competitorDataId },
        });
      }

      // Get recent snapshots
      const snapshots = await db.competitorSnapshot.findMany({
        where: { competitorId: id, userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return NextResponse.json({
        analysis,
        competitorData,
        snapshots,
      });
    } catch (error) {
      console.error('[GET /api/competitors/[id]] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch competitor' },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      await deleteCompetitor(user.id, id);

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[DELETE /api/competitors/[id]] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete competitor';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
