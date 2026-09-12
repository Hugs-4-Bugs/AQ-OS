import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const workflows = await db.workflowDefinition.findMany({
        where: { userId: user.id },
        select: {
          status: true, triggerType: true, runCount: true, successCount: true, failureCount: true,
          avgRuntimeMs: true, lastRunAt: true, createdAt: true,
        },
      });

      const total = workflows.length;
      const active = workflows.filter(w => w.status === 'active').length;
      const totalRuns = workflows.reduce((s, w) => s + w.runCount, 0);
      const totalSuccess = workflows.reduce((s, w) => s + w.successCount, 0);
      const totalFailure = workflows.reduce((s, w) => s + w.failureCount, 0);
      const avgRuntime = totalRuns > 0 ? Math.round(workflows.reduce((s, w) => s + (w.avgRuntimeMs ?? 0), 0) / total) : 0;

      const triggerCounts: Record<string, number> = {};
      for (const w of workflows) {
        triggerCounts[w.triggerType] = (triggerCounts[w.triggerType] || 0) + 1;
      }

      const byTrigger = Object.entries(triggerCounts).map(([trigger, count]) => ({ trigger, count }));

      return NextResponse.json({
        data: {
          summary: {
            total,
            active,
            totalRuns,
            successRate: totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : 0,
            failureRate: totalRuns > 0 ? Math.round((totalFailure / totalRuns) * 100) : 0,
            avgRuntimeMs: avgRuntime,
          },
          byTrigger,
          recentExecutions: [] as Array<{ workflow: string; status: string; duration: number; timestamp: string }>,
          topWorkflows: workflows
            .sort((a, b) => b.runCount - a.runCount)
            .slice(0, 5)
            .map(w => ({
              name: w.triggerType,
              runs: w.runCount,
              successRate: w.runCount > 0 ? Math.round((w.successCount / w.runCount) * 100) : 0,
              avgRuntimeMs: w.avgRuntimeMs,
            })),
        },
      });
    } catch (error) {
      console.error('[API] Workflow analytics error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch workflow analytics' }, { status: 500 });
    }
  });
}
