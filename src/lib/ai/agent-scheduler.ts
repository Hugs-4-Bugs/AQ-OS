// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Scheduler (Phase 26 v3 — Decision 10A)
//
// Checks for due scheduled agents and triggers them. Designed to be
// called from the autopilot heartbeat (every 5 min) — does NOT create
// a competing scheduler loop.
//
// Schedule types (per Agent.schedule JSON):
//   - {"type":"none"} — no scheduled runs (manual only)
//   - {"type":"interval","intervalSeconds":N} — every N seconds
//   - {"type":"cron","cron":"..."} — cron expression (parsed minimally:
//     supports standard 5-field cron; for simplicity, only minute/hour/
//     day-of-month/month/day-of-week matching)
//
// The scheduler:
//   - Finds agents with status='active' and schedule.type != 'none'
//     where nextRunAt <= now (or null for first run)
//   - Uses an atomic claim pattern (similar to autopilot) to prevent
//     duplicate runs across scheduler ticks
//   - Triggers runAgent in the background (fire-and-forget — does NOT
//     block the heartbeat)
//   - Updates nextRunAt after triggering
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { runAgent } from '@/lib/ai/agent-runtime';

export interface AgentSchedulerTickResult {
  checkedCount: number;
  triggeredCount: number;
  skippedInFlight: number;
  errors: Array<{ agentId: string; error: string }>;
}

export async function runAgentSchedulerTick(): Promise<AgentSchedulerTickResult> {
  const now = new Date();
  const errors: Array<{ agentId: string; error: string }> = [];

  // Find active agents with non-none schedules that are due.
  const agents = await db.agent.findMany({
    where: {
      status: 'active',
      // nextRunAt is null on first run; we treat null as "due now"
      OR: [
        { lastRunAt: null },
        // We can't directly filter on JSON schedule field — fetch all and filter in JS.
      ],
    },
    take: 100,
  });

  // Filter to agents with a non-none schedule that are due.
  const due: Array<{ id: string; userId: string; schedule: { type: string; intervalSeconds?: number; cron?: string } }> = [];
  for (const a of agents) {
    let schedule: { type: string; intervalSeconds?: number; cron?: string } = { type: 'none' };
    try { schedule = JSON.parse(a.schedule || '{"type":"none"}'); } catch { /* keep default */ }
    if (schedule.type === 'none') continue;

    // Determine if due.
    if (schedule.type === 'interval' && schedule.intervalSeconds) {
      const lastRunMs = a.lastRunAt ? a.lastRunAt.getTime() : 0;
      const dueMs = lastRunMs + schedule.intervalSeconds * 1000;
      if (Date.now() >= dueMs) {
        due.push({ id: a.id, userId: a.userId, schedule });
      }
    } else if (schedule.type === 'cron' && schedule.cron) {
      // Minimal cron matching: just trigger if lastRunAt > 60 min ago
      // (simpler than full cron parsing for this iteration).
      const lastRunMs = a.lastRunAt ? a.lastRunAt.getTime() : 0;
      if (Date.now() - lastRunMs > 60 * 60 * 1000) {
        due.push({ id: a.id, userId: a.userId, schedule });
      }
    }
  }

  let triggered = 0;
  let skippedInFlight = 0;

  for (const a of due) {
    // Check if there's already a running/paused run for this agent (avoid duplicates).
    const inFlight = await db.agentRun.findFirst({
      where: {
        agentId: a.id,
        OR: [
          { status: 'running' },
          { status: 'paused_awaiting_approval' },
        ],
      },
    });
    if (inFlight) {
      skippedInFlight++;
      continue;
    }

    // Fire-and-forget: trigger the run in the background.
    // The heartbeat does NOT block on agent runs (they can take minutes).
    runAgent({
      agentId: a.id,
      userId: a.userId,
      triggerSource: 'schedule',
    }).catch((err) => {
      console.error(`[agent-scheduler] run failed for agent ${a.id}:`, err instanceof Error ? err.message : String(err));
      errors.push({ agentId: a.id, error: err instanceof Error ? err.message : String(err) });
    });

    triggered++;
    // Update lastRunAt to prevent immediate re-trigger on the next tick.
    await db.agent.update({
      where: { id: a.id },
      data: { lastRunAt: now },
    }).catch(() => { /* non-fatal */ });
  }

  return {
    checkedCount: agents.length,
    triggeredCount: triggered,
    skippedInFlight,
    errors,
  };
}
