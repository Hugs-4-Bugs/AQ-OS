// ═══════════════════════════════════════════════════════════════════
// GET /api/analytics/billing — Billing analytics
// Phase 13: Revenue and billing metrics
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getBillingMetrics } from '@/lib/analytics-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30d';
      const start = searchParams.get('start') || undefined;
      const end = searchParams.get('end') || undefined;

      const metrics = await getBillingMetrics(
        user.id,
        start && end ? { start: new Date(start), end: new Date(end) } : undefined
      );

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'analytics_viewed',
          details: JSON.stringify({ category: 'billing', period }),
          resource: 'analytics',
        },
      }).catch(() => {});

      return NextResponse.json({ metrics });
    } catch (error) {
      console.error('[GET /api/analytics/billing] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch billing analytics' },
        { status: 500 }
      );
    }
  });
}
