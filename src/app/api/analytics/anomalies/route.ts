// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Anomaly Detection API
// GET: Retrieve anomalies with optional filters
// POST: Run anomaly detection checks
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getAnomalies,
  runAllAnomalyChecks,
  cleanupOldAnomalies,
  type AnomalyCategory,
  type AnomalyStatus,
  type AnomalySeverity,
} from '@/lib/anomaly-detection-engine';

/**
 * GET /api/analytics/anomalies
 * Query params: category, status, severity
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const category = searchParams.get('category') as AnomalyCategory | null;
      const status = searchParams.get('status') as AnomalyStatus | null;
      const severity = searchParams.get('severity') as AnomalySeverity | null;

      // Validate category if provided
      const validCategories: AnomalyCategory[] = ['lead', 'ai', 'billing', 'workflow'];
      if (category && !validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate status if provided
      const validStatuses: AnomalyStatus[] = ['active', 'acknowledged', 'resolved'];
      if (status && !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate severity if provided
      const validSeverities: AnomalySeverity[] = ['info', 'warning', 'critical'];
      if (severity && !validSeverities.includes(severity)) {
        return NextResponse.json(
          { error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` },
          { status: 400 }
        );
      }

      const anomalies = await getAnomalies(
        user.id,
        category || undefined,
        status || undefined,
        severity || undefined
      );

      return NextResponse.json({
        anomalies,
        count: anomalies.length,
        filters: {
          category: category || null,
          status: status || null,
          severity: severity || null,
        },
      });
    } catch (error) {
      console.error('[AnomaliesAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve anomalies' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/analytics/anomalies
 * Body: { action: 'detect' | 'cleanup', daysOld?: number }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const action = body.action || 'detect';

      if (action === 'detect') {
        // Run all anomaly detection checks
        const results = await runAllAnomalyChecks(user.id);

        const detected = results.filter(r => r.detected);
        const skipped = results.filter(r => !r.detected);

        return NextResponse.json({
          message: 'Anomaly detection completed',
          totalChecks: results.length,
          anomaliesDetected: detected.length,
          checksPassed: skipped.length,
          results: results.map(r => ({
            detected: r.detected,
            category: r.category,
            anomalyType: r.anomalyType,
            metricName: r.metricName,
            expectedValue: r.expectedValue,
            actualValue: r.actualValue,
            deviation: r.deviation,
            severity: r.severity,
            description: r.description,
          })),
        });
      }

      if (action === 'cleanup') {
        // Cleanup old resolved anomalies
        const daysOld = typeof body.daysOld === 'number' ? body.daysOld : 30;
        const deletedCount = await cleanupOldAnomalies(user.id, daysOld);

        return NextResponse.json({
          message: 'Cleanup completed',
          deletedCount,
          daysOld,
        });
      }

      return NextResponse.json(
        { error: 'Invalid action. Must be "detect" or "cleanup"' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[AnomaliesAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to process anomaly request' },
        { status: 500 }
      );
    }
  });
}
