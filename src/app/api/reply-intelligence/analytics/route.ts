// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence: Analytics API Route
// GET /api/reply-intelligence/analytics
//
// Returns aggregated reply analytics including sentiment breakdown,
// intent distribution, urgency distribution, buying signal counts,
// and top recommended actions.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withRequestLogging } from '@/lib/api-request-logger';
import { getReplyAnalytics } from '@/lib/reply-intelligence-service';

export const GET = withRequestLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30d';
      const channel = searchParams.get('channel') || 'email';

      const analytics = await getReplyAnalytics(user.id, { period, channel });

      return NextResponse.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('[ReplyIntelAPI] GET /analytics error:', error);
      return NextResponse.json(
        { error: 'Failed to get reply analytics' },
        { status: 500 },
      );
    }
  });
}, { service: 'reply-intelligence' });
