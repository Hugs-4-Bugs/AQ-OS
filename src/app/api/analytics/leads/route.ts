// ═══════════════════════════════════════════════════════════════════
// GET /api/analytics/leads — Lead analytics with time series
// Phase 13: Detailed lead metrics and trends
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getLeadMetrics, getTimeSeriesData } from '@/lib/analytics-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30d';
      const start = searchParams.get('start') || undefined;
      const end = searchParams.get('end') || undefined;
      const granularity = searchParams.get('granularity') || 'daily';

      // Validate granularity
      const validGranularities = ['daily', 'weekly', 'monthly'];
      if (!validGranularities.includes(granularity)) {
        return NextResponse.json(
          { error: 'Invalid granularity. Must be one of: daily, weekly, monthly' },
          { status: 400 }
        );
      }

      const dateRange = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
      const [metrics, timeSeries] = await Promise.all([
        getLeadMetrics(user.id, undefined, dateRange),
        getTimeSeriesData(
          user.id,
          'leads_discovered',
          granularity as 'daily' | 'weekly' | 'monthly',
          dateRange ?? { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() }
        ),
      ]);

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'analytics_viewed',
          details: JSON.stringify({ category: 'leads', period, granularity }),
          resource: 'analytics',
        },
      }).catch(() => {});

      return NextResponse.json({
        metrics,
        timeSeries,
      });
    } catch (error) {
      console.error('[GET /api/analytics/leads] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch lead analytics' },
        { status: 500 }
      );
    }
  });
}
