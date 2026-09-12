// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Analytics API Route
// Phase 10: GET /api/messaging/analytics
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getChannelDeliveryRates,
  getReadRates,
  getResponseMetrics,
  getMessageVolume,
  compareChannelEffectiveness,
  getConversationMetrics,
  getAnalyticsSummary,
} from '@/lib/message-analytics-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const url = new URL(request.url);
      const metric = url.searchParams.get('metric') || 'summary';

      // Parse time range
      const startDate = url.searchParams.get('start');
      const endDate = url.searchParams.get('end');
      const timeRange = startDate && endDate
        ? { start: new Date(startDate), end: new Date(endDate) }
        : undefined;

      switch (metric) {
        case 'delivery_rates': {
          const data = await getChannelDeliveryRates(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'read_rates': {
          const data = await getReadRates(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'response_metrics': {
          const data = await getResponseMetrics(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'message_volume': {
          const data = await getMessageVolume(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'channel_comparison': {
          const data = await compareChannelEffectiveness(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'conversation_metrics': {
          const data = await getConversationMetrics(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }

        case 'summary':
        default: {
          const data = await getAnalyticsSummary(user.id, timeRange);
          return NextResponse.json({ success: true, data });
        }
      }
    } catch (error) {
      console.error('Analytics GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to get analytics' },
        { status: 500 }
      );
    }
  });
}
