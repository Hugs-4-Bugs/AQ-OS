// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Stats API
// GET /api/meetings/stats — Get meeting statistics for current user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getMeetingStats } from '@/lib/meeting-orchestration-service';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const stats = await getMeetingStats(user.id);

      return NextResponse.json({ stats });
    } catch (error) {
      console.error('[Meeting Stats API] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meeting statistics' },
        { status: 500 }
      );
    }
  });
}, 'meetings/stats');
