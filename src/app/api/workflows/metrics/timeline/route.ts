// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Metrics Timeline API
// Returns execution counts grouped by day for the last 7 days
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

/** GET /api/workflows/metrics/timeline — Get execution timeline for last 7 days */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userWorkflows = await db.workflowDefinition.findMany({
        where: { userId: user.id, isTemplate: false },
        select: { id: true },
      });
      const workflowIds = userWorkflows.map(w => w.id);

      // Get last 7 days of execution data
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const executions = await db.workflowExecution.findMany({
        where: {
          workflowId: { in: workflowIds },
          createdAt: { gte: sevenDaysAgo },
        },
        select: {
          status: true,
          createdAt: true,
        },
      });

      // Group by day
      const dayMap: Record<string, { completed: number; failed: number; running: number; other: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = date.toISOString().split('T')[0];
        dayMap[key] = { completed: 0, failed: 0, running: 0, other: 0 };
      }

      for (const exec of executions) {
        const key = new Date(exec.createdAt).toISOString().split('T')[0];
        if (dayMap[key]) {
          if (exec.status === 'completed') dayMap[key].completed++;
          else if (exec.status === 'failed' || exec.status === 'dead_letter') dayMap[key].failed++;
          else if (exec.status === 'running' || exec.status === 'queued') dayMap[key].running++;
          else dayMap[key].other++;
        }
      }

      const timeline = Object.entries(dayMap).map(([date, counts]) => ({
        date,
        ...counts,
        total: counts.completed + counts.failed + counts.running + counts.other,
      }));

      return NextResponse.json({ timeline });
    } catch (error) {
      console.error('[Workflows API] Timeline GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
    }
  });
}
