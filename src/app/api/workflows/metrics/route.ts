// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Metrics API Route
// Phase 12: Execution metrics (success rate, avg duration, etc.)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getExecutionMetrics } from '@/lib/workflow-engine';
import { getWorkflowUsage } from '@/lib/workflow-credits';
import { getDeadLetterStats } from '@/lib/workflow-dead-letter';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const detail = searchParams.get('detail');

      if (detail === 'usage') {
        const usage = await getWorkflowUsage(user.id);
        return NextResponse.json(usage);
      }

      if (detail === 'dead_letter') {
        const dlqStats = await getDeadLetterStats(user.id);
        return NextResponse.json(dlqStats);
      }

      // Default: return execution metrics
      const metrics = await getExecutionMetrics(user.id);
      return NextResponse.json(metrics);
    } catch (error) {
      console.error('[WorkflowMetricsAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }
  });
}
