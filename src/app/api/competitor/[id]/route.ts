import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/competitor/[id] — get single competitor analysis
// ACCOUNT ISOLATION: this legacy singular route previously had NO auth
// and NO ownership check — anyone could read/delete any tenant's
// competitor analysis by id. It is now authenticated and owner-scoped,
// mirroring /api/competitors/[id].
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(_request, async (user) => {
    try {
      const { id } = await params;
      const analysis = await db.competitorAnalysis.findFirst({
        where: { id, userId: user.id },
      });

      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }

      return NextResponse.json(analysis);
    } catch (error) {
      console.error('Failed to fetch competitor analysis:', error);
      return NextResponse.json({ error: 'Failed to fetch competitor analysis' }, { status: 500 });
    }
  });
}

// DELETE /api/competitor/[id] — delete competitor analysis
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(_request, async (user) => {
    try {
      const { id } = await params;

      const analysis = await db.competitorAnalysis.findFirst({
        where: { id, userId: user.id },
      });

      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }

      await db.competitorAnalysis.delete({
        where: { id },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to delete competitor analysis:', error);
      return NextResponse.json({ error: 'Failed to delete competitor analysis' }, { status: 500 });
    }
  });
}
