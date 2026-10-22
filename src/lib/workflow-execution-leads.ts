// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Execution Lead Aggregates
//
// Neutral helper module (db-only dependency) shared by the execution
// engine (history/detail views) and the batch coordinator — deliberately
// free of engine imports so the dependency graph stays acyclic.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export interface LeadCounts {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

const EMPTY: LeadCounts = { total: 0, pending: 0, running: 0, completed: 0, failed: 0, skipped: 0 };

/** Per-status lead counts for ONE execution (batch runs). */
export async function getLeadCounts(executionId: string): Promise<LeadCounts> {
  try {
    const rows = await db.workflowExecutionLead.groupBy({
      by: ['status'],
      where: { executionId },
      _count: { _all: true },
    });
    const counts: LeadCounts = { ...EMPTY };
    for (const row of rows) {
      const n = Number(row._count?._all ?? 0);
      counts.total += n;
      if (row.status === 'pending') counts.pending = n;
      else if (row.status === 'running') counts.running = n;
      else if (row.status === 'completed') counts.completed = n;
      else if (row.status === 'failed') counts.failed = n;
      else if (row.status === 'skipped') counts.skipped = n;
    }
    return counts;
  } catch {
    return { ...EMPTY };
  }
}

/** Aggregate lead counts for a page of executions (one groupBy query —
 * no N+1; legacy single-lead executions without items are absent from the
 * returned map). */
export async function getLeadCountsForExecutions(
  executionIds: string[]
): Promise<Map<string, LeadCounts>> {
  const out = new Map<string, LeadCounts>();
  if (executionIds.length === 0) return out;
  try {
    const rows = await db.workflowExecutionLead.groupBy({
      by: ['executionId', 'status'],
      where: { executionId: { in: executionIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      let counts = out.get(row.executionId);
      if (!counts) {
        counts = { ...EMPTY };
        out.set(row.executionId, counts);
      }
      const n = Number(row._count?._all ?? 0);
      counts.total += n;
      if (row.status === 'pending') counts.pending = n;
      else if (row.status === 'running') counts.running = n;
      else if (row.status === 'completed') counts.completed = n;
      else if (row.status === 'failed') counts.failed = n;
      else if (row.status === 'skipped') counts.skipped = n;
    }
  } catch {
    // aggregate failures never break the list view
  }
  return out;
}

/** Does this execution carry per-lead items (batch model)? */
export async function hasLeadItems(executionId: string): Promise<boolean> {
  try {
    const count = await db.workflowExecutionLead.count({ where: { executionId } });
    return count > 0;
  } catch {
    return false;
  }
}
