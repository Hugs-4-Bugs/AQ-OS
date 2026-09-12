// ═══════════════════════════════════════════════════════════════════
// GET /api/analytics — Dashboard analytics
// Phase 13: Aggregated analytics for executive/sales/ai/ops dashboards
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getDashboardMetrics } from '@/lib/analytics-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const dashboard = searchParams.get('dashboard') || 'executive';
      const period = searchParams.get('period') || '30d';
      const start = searchParams.get('start') || undefined;
      const end = searchParams.get('end') || undefined;

      // Validate dashboard type
      const validDashboards = ['executive', 'sales', 'ai', 'ops'];
      if (!validDashboards.includes(dashboard)) {
        return NextResponse.json(
          { error: 'Invalid dashboard type. Must be one of: executive, sales, ai, ops' },
          { status: 400 }
        );
      }

      // Validate period
      const validPeriods = ['7d', '30d', '90d', '1y'];
      if (!validPeriods.includes(period)) {
        return NextResponse.json(
          { error: 'Invalid period. Must be one of: 7d, 30d, 90d, 1y' },
          { status: 400 }
        );
      }

      // Convert period to date range
      const now = new Date();
      let dateRange: { start: Date; end: Date } | undefined;
      if (start && end) {
        dateRange = { start: new Date(start), end: new Date(end) };
      } else {
        const periodMs: Record<string, number> = {
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
          '90d': 90 * 24 * 60 * 60 * 1000,
          '1y': 365 * 24 * 60 * 60 * 1000,
        };
        const ms = periodMs[period] || periodMs['30d'];
        dateRange = { start: new Date(now.getTime() - ms), end: now };
      }

      const metrics = await getDashboardMetrics(
        user.id,
        undefined,
        dashboard as 'executive' | 'sales' | 'ai' | 'ops',
        dateRange
      );

      // Audit log — analytics viewed
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'analytics_viewed',
          details: JSON.stringify({ dashboard, period, start, end }),
          resource: 'analytics',
        },
      }).catch(() => {});

      // Audit log — dashboard opened (tracks which dashboard views)
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'dashboard_opened',
          details: JSON.stringify({ dashboard, period }),
          resource: 'analytics',
        },
      }).catch(() => {});

      return NextResponse.json({
        dashboard,
        period,
        metrics,
      });
    } catch (error) {
      console.error('[GET /api/analytics] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch analytics' },
        { status: 500 }
      );
    }
  });
}
