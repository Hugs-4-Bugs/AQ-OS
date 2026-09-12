// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Feed API
// GET /api/leads/hot?temperature=fire&page=1&limit=20
// Returns paginated hot lead feed with temperature classification
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getHotLeadFeed } from '@/lib/hot-lead-service';
import type { LeadTemperature } from '@/lib/hot-lead-service';

const VALID_TEMPERATURES = new Set<string>(['cold', 'warm', 'hot', 'fire']);

function handler(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const temperatureParam = searchParams.get('temperature');
      const temperature = temperatureParam && VALID_TEMPERATURES.has(temperatureParam)
        ? (temperatureParam as LeadTemperature)
        : undefined;

      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '20', 10);

      const feed = await getHotLeadFeed(user.id, {
        temperature,
        page,
        limit,
      });

      return NextResponse.json({
        success: true,
        data: feed,
      });
    } catch (error) {
      console.error('[HotLeadFeed API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch hot lead feed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export const GET = withApiLogging(handler, 'leads/hot');
