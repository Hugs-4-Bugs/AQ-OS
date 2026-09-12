// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Analytics Insight Detail API
// PATCH: Mark as read or dismiss an insight
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  markInsightRead,
  dismissInsight,
} from '@/lib/auto-insight-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/analytics/insights/[id]
 * Body: { action: "read" | "dismiss" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      if (!id) {
        return NextResponse.json(
          { error: 'Insight ID is required' },
          { status: 400 },
        );
      }

      const body = await request.json();
      const { action } = body;

      if (!action || !['read', 'dismiss'].includes(action)) {
        return NextResponse.json(
          { error: 'Action must be "read" or "dismiss"' },
          { status: 400 },
        );
      }

      if (action === 'read') {
        const success = await markInsightRead(id, user.id);
        if (!success) {
          return NextResponse.json(
            { error: 'Insight not found' },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, action: 'read' });
      }

      if (action === 'dismiss') {
        const success = await dismissInsight(id, user.id);
        if (!success) {
          return NextResponse.json(
            { error: 'Insight not found' },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, action: 'dismissed' });
      }

      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 },
      );
    } catch (error) {
      console.error('[InsightDetailAPI] PATCH error:', error);
      return NextResponse.json(
        { error: 'Failed to update insight' },
        { status: 500 },
      );
    }
  });
}
