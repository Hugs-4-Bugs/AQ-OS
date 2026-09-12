// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/sequences/analytics
// Get analytics for a specific sequence (query param: sequenceId).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getSequenceAnalytics } from '@/lib/email-sequence-service';

// GET /api/sequences/analytics?sequenceId=xxx
export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const sequenceId = searchParams.get('sequenceId');

      if (!sequenceId) {
        return NextResponse.json(
          { error: 'sequenceId query parameter is required' },
          { status: 400 }
        );
      }

      const result = await getSequenceAnalytics(sequenceId, user.id);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json(result.analytics);
    } catch (error) {
      console.error('[API] Sequence analytics error:', error);
      return NextResponse.json({ error: 'Failed to get analytics' }, { status: 500 });
    }
  });
}, 'sequences/analytics');
