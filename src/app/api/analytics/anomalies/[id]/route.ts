// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Anomaly Detail API
// PATCH: Acknowledge or resolve an anomaly
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  acknowledgeAnomaly,
  resolveAnomaly,
} from '@/lib/anomaly-detection-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/analytics/anomalies/[id]
 * Body: { action: 'acknowledge' | 'resolve' }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const action = body.action;

      if (!action) {
        return NextResponse.json(
          { error: 'Action is required. Must be "acknowledge" or "resolve"' },
          { status: 400 }
        );
      }

      if (action === 'acknowledge') {
        try {
          const updated = await acknowledgeAnomaly(id, user.id);
          return NextResponse.json({
            message: 'Anomaly acknowledged',
            anomaly: updated,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to acknowledge anomaly';
          if (message.includes('not found')) {
            return NextResponse.json({ error: message }, { status: 404 });
          }
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }

      if (action === 'resolve') {
        try {
          const updated = await resolveAnomaly(id, user.id);
          return NextResponse.json({
            message: 'Anomaly resolved',
            anomaly: updated,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to resolve anomaly';
          if (message.includes('not found')) {
            return NextResponse.json({ error: message }, { status: 404 });
          }
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }

      return NextResponse.json(
        { error: 'Invalid action. Must be "acknowledge" or "resolve"' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[AnomaliesAPI] PATCH error:', error);
      return NextResponse.json(
        { error: 'Failed to update anomaly' },
        { status: 500 }
      );
    }
  });
}
