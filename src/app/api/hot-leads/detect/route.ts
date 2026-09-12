// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/hot-leads/detect
// Detect hot leads and optionally generate alert notifications
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { hotLeadDetectionService } from '@/lib/hot-lead-detection';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { generateAlerts = false } = body as {
        generateAlerts?: boolean;
      };

      const detections = await hotLeadDetectionService.detectHotLeads(user.id);

      let alertCount = 0;
      if (generateAlerts) {
        alertCount = await hotLeadDetectionService.generateAlerts(user.id);
      }

      return NextResponse.json({
        success: true,
        data: {
          hotLeads: detections,
          count: detections.length,
          criticalCount: detections.filter(d => d.urgency === 'critical').length,
          alertsGenerated: alertCount,
        },
      });
    } catch (error) {
      console.error('[HotLeads] Detect endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to detect hot leads' },
        { status: 500 }
      );
    }
  });
}
