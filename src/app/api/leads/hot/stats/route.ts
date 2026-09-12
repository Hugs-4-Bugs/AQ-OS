// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Stats API
// GET /api/leads/hot/stats
// Returns aggregate statistics for hot lead detection
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getHotLeadStats } from '@/lib/hot-lead-service';

function handler(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const stats = await getHotLeadStats(user.id);

      return NextResponse.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('[HotLeadStats API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch hot lead stats';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export const GET = withApiLogging(handler, 'leads/hot/stats');
