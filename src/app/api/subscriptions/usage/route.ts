// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/subscriptions/usage
// Returns usage summary, quota status, and daily usage for current billing period
// Requires billing:read permission
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getUsageSummary, getQuotaStatus, getDailyUsage } from '@/lib/usage-service';

export async function GET(request: NextRequest) {
  return withPermission(request, 'billing:read', async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const days = parseInt(searchParams.get('days') || '30', 10);

      // Get usage summary for current billing period
      const usageSummary = await getUsageSummary(user.id);

      // Get quota status for all features
      const quotaStatus = await getQuotaStatus(user.id);

      // Get daily usage for charting
      const dailyUsage = await getDailyUsage(user.id, Math.min(days, 90));

      return NextResponse.json({
        usageSummary: {
          totalCreditsUsed: usageSummary.totalCreditsUsed,
          totalActions: usageSummary.totalActions,
          byAction: usageSummary.byAction,
          period: {
            start: usageSummary.period.start.toISOString(),
            end: usageSummary.period.end.toISOString(),
          },
        },
        quotaStatus: {
          plan: quotaStatus.plan,
          quotas: quotaStatus.quotas.map((q) => ({
            feature: q.feature,
            used: q.used,
            limit: q.limit,
            remaining: q.remaining,
            percentage: q.percentage,
            enabled: q.enabled,
          })),
        },
        dailyUsage,
      });
    } catch (error) {
      console.error('[API] Failed to get usage data:', error);
      return NextResponse.json(
        { error: 'Failed to get usage data' },
        { status: 500 }
      );
    }
  });
}
