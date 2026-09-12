// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Analytics API Route
// Phase 9: Get email analytics data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getEmailMetrics,
  calculateRates,
  getMetricsOverTime,
  getTemplateAnalytics,
  getSequenceAnalytics,
  analyzeBestSendTime,
} from '@/lib/email-analytics-service';
import { getAggregateOpenStats } from '@/lib/email-open-tracking';
import { getAggregateClickStats } from '@/lib/email-click-tracking';
import { getUserBounceSummary } from '@/lib/bounce-intelligence';

/**
 * GET /api/email/analytics — Get email analytics data
 *
 * Query params:
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - period: 'daily' | 'weekly' | 'monthly' (default: 'daily')
 *   - include: 'metrics,rates,overTime,templates,sequences,bestTime,opens,clicks,bounces'
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');
      const period = (searchParams.get('period') as 'daily' | 'weekly' | 'monthly') || 'daily';
      const include = searchParams.get('include') || 'metrics,rates,overTime,bounces';

      const startDate = startDateStr ? new Date(startDateStr) : undefined;
      const endDate = endDateStr ? new Date(endDateStr) : undefined;
      const includeSet = new Set(include.split(','));

      const options = { startDate, endDate };
      const result: Record<string, unknown> = {};

      // Metrics
      if (includeSet.has('metrics') || includeSet.has('rates')) {
        const metrics = await getEmailMetrics(user.id, options);
        result.metrics = metrics;

        if (includeSet.has('rates')) {
          result.rates = calculateRates(metrics);
        }
      }

      // Over time
      if (includeSet.has('overTime')) {
        result.metricsOverTime = await getMetricsOverTime(user.id, period, options);
      }

      // Template analytics
      if (includeSet.has('templates')) {
        result.templateAnalytics = await getTemplateAnalytics(user.id, options);
      }

      // Sequence analytics
      if (includeSet.has('sequences')) {
        result.sequenceAnalytics = await getSequenceAnalytics(user.id, options);
      }

      // Best send time
      if (includeSet.has('bestTime')) {
        result.bestSendTimes = await analyzeBestSendTime(user.id, options);
      }

      // Open stats
      if (includeSet.has('opens')) {
        result.openStats = await getAggregateOpenStats(user.id, options);
      }

      // Click stats
      if (includeSet.has('clicks')) {
        result.clickStats = await getAggregateClickStats(user.id, options);
      }

      // Bounce summary
      if (includeSet.has('bounces')) {
        result.bounceSummary = await getUserBounceSummary(user.id);
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('[AnalyticsAPI] GET error:', error);
      return NextResponse.json({ error: 'Failed to get email analytics' }, { status: 500 });
    }
  });
}
