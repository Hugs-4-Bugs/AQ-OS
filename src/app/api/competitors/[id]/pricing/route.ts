import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { detectPriceChanges, getHistoricalPricing } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    try {
      const { id } = await params;

      const [priceChanges, historicalPricing] = await Promise.all([
        detectPriceChanges(id),
        getHistoricalPricing(id),
      ]);

      return NextResponse.json({
        competitorId: id,
        competitorName: priceChanges.competitorName,
        priceChanges: priceChanges.changes,
        historicalPricing: historicalPricing.timeline,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get pricing intelligence';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
