// ═══════════════════════════════════════════════════════════════════
// GET /api/analytics/workflows — Workflow analytics
// Phase 13: Workflow execution metrics
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getWorkflowMetrics } from '@/lib/analytics-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30d';
      const start = searchParams.get('start') || undefined;
      const end = searchParams.get('end') || undefined;

      const metrics = await getWorkflowMetrics(
        user.id,
        undefined,
        start && end ? { start: new Date(start), end: new Date(end) } : undefined
      );

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'analytics_viewed',
          details: JSON.stringify({ category: 'workflows', period }),
          resource: 'analytics',
        },
      }).catch(() => {});

      return NextResponse.json({ metrics });
    } catch (error) {
      console.error('[GET /api/analytics/workflows] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workflow analytics' },
        { status: 500 }
      );
    }
  });
}
