import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// Map triggerType to icon name for the frontend
const TRIGGER_ICON_MAP: Record<string, string> = {
  lead_stage_change: 'ArrowRight',
  lead_reply: 'MessageSquare',
  score_change: 'Sparkles',
  manual: 'Play',
  scheduled: 'Clock',
  payment_received: 'DollarSign',
};

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const workflows = await db.workflowDefinition.findMany({
        where: { userId: user.id },
        include: {
          executions: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              createdAt: true,
              durationMs: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const rules = workflows.map((wf) => {
        const triggerIcon = TRIGGER_ICON_MAP[wf.triggerType] ?? 'Zap';
        const status: 'active' | 'paused' | 'draft' = wf.status === 'active' ? 'active' : wf.status === 'paused' ? 'paused' : 'draft';

        // Parse triggerConfig for conditions
        let conditions: { logic: string; text: string }[] = [];
        try {
          const config = wf.triggerConfig ? JSON.parse(wf.triggerConfig) : {};
          if (config.stage) conditions.push({ logic: 'AND', text: `Lead stage is ${config.stage}` });
          if (config.scoreThreshold) conditions.push({ logic: 'AND', text: `Score threshold: ${config.scoreThreshold}` });
          if (conditions.length === 0) conditions.push({ logic: 'AND', text: `Trigger: ${wf.triggerType}` });
        } catch {
          conditions = [{ logic: 'AND', text: `Trigger: ${wf.triggerType}` }];
        }

        // Parse nodes for action steps
        let actionSteps: string[] = [];
        try {
          const nodes = wf.nodes ? JSON.parse(wf.nodes) : [];
          actionSteps = nodes.map((n: { name?: string; type?: string }, i: number) =>
            n.name ?? `Step ${i + 1}: ${n.type ?? 'action'}`
          );
        } catch {
          actionSteps = ['Execute workflow steps'];
        }

        // Format history from executions
        const history = (wf as any).executions?.map((ex: any) => ({
          id: ex.id,
          timestamp: ex.createdAt.toLocaleString(),
          success: ex.status === 'completed',
          duration: ex.durationMs ? `${(ex.durationMs / 1000).toFixed(1)}s` : 'N/A',
        })) ?? [];

        const lastRunMs = wf.lastRunAt ? Date.now() - wf.lastRunAt.getTime() : null;
        let lastTriggered = 'Never';
        if (lastRunMs !== null) {
          const hours = Math.floor(lastRunMs / (1000 * 60 * 60));
          if (hours < 1) lastTriggered = 'Just now';
          else if (hours < 24) lastTriggered = `${hours}h ago`;
          else lastTriggered = `${Math.floor(hours / 24)}d ago`;
        }

        return {
          id: wf.id,
          name: wf.name,
          description: wf.description ?? '',
          enabled: wf.status === 'active',
          triggerIcon,
          triggerLabel: wf.triggerConfig
            ? `When ${wf.triggerType.replace(/_/g, ' ')}`
            : wf.triggerType,
          actionDescription: actionSteps[0] ?? 'Execute workflow',
          status,
          triggeredThisWeek: wf.runCount,
          conditions,
          actionSteps,
          lastTriggered,
          history,
        };
      });

      return NextResponse.json({ data: rules });
    } catch (error) {
      console.error('[API] Error fetching automation rules:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch automation rules' },
        { status: 500 }
      );
    }
  });
}
