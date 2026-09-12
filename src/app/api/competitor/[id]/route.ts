import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/competitor/[id] — get single competitor analysis
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analysis = await db.competitorAnalysis.findUnique({
      where: { id },
    });

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Failed to fetch competitor analysis:', error);
    return NextResponse.json({ error: 'Failed to fetch competitor analysis' }, { status: 500 });
  }
}

// DELETE /api/competitor/[id] — delete competitor analysis
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const analysis = await db.competitorAnalysis.findUnique({
      where: { id },
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
}
