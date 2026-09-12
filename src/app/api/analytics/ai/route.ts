// ═══════════════════════════════════════════════════════════════════
// GET /api/analytics/ai — AI usage analytics
// Phase 13: AI-specific metrics
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getAIMetrics } from '@/lib/analytics-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '30d';
      const start = searchParams.get('start') || undefined;
      const end = searchParams.get('end') || undefined;

      const metrics = await getAIMetrics(
        user.id,
        start && end ? { start: new Date(start), end: new Date(end) } : undefined
      );

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'analytics_viewed',
          details: JSON.stringify({ category: 'ai', period }),
          resource: 'analytics',
        },
      }).catch(() => {});

      return NextResponse.json({ metrics });
    } catch (error) {
      console.error('[GET /api/analytics/ai] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch AI analytics' },
        { status: 500 }
      );
    }
  });
}
