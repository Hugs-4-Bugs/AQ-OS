// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 25 Execution Activity Service
//
// Unified execution/activity event log that records discrete events
// (status transitions, retry events, cancellations, per-lead outcomes)
// for the Phase 24 execution engine.
//
// Design principles:
//   · BEST-EFFORT logging — if the DB write fails, execution MUST
//     continue normally. Tracking never breaks the execution engine.
//   · ADDITIVE — does not modify any existing Phase 24 tables/columns.
//   · OWNERSHIP-SCOPED — every activity record carries a userId for
//     cross-user isolation (User B can never see User A's activities).
//   · Uses the existing Phase 24 execution engine as the source of
//     truth — activity records are written AT the actual transition
//     points in runner.ts / workflow-batch.ts, not from a parallel
//     mock layer.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== Types =====

export type ExecutionEventType =
  | 'RUN_QUEUED'
  | 'RUN_STARTED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED'
  | 'RUN_CANCELLED'
  | 'RETRY_INITIATED'
  | 'RESUME_INITIATED'
  | 'EXECUTION_CREATED'
  | 'EXECUTION_CHARGED'
  | 'LEAD_COMPLETED'
  | 'LEAD_FAILED'
  | 'LEAD_DISCOVERED'
  | 'SETTLE_FINALIZED';

export interface LogActivityParams {
  runId?: string;
  executionId?: string;
  leadId?: string;
  eventType: ExecutionEventType;
  fromStatus?: string;
  toStatus?: string;
  detail?: string;
  userId: string;
}

export interface ExecutionActivityRecord {
  id: string;
  runId: string | null;
  executionId: string | null;
  leadId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: string | null;
  userId: string;
  createdAt: Date;
}

// ===== Logging (best-effort — never throws) =====

/**
 * Record an execution activity event. This is BEST-EFFORT: if the DB
 * write fails (table missing, DB error, etc.), the error is caught and
 * logged as a warning — execution continues normally. Tracking must
 * NEVER break the Phase 24 execution engine.
 *
 * Called from the actual transition points in runner.ts (not from a
 * parallel mock layer).
 */
export async function logExecutionActivity(
  params: LogActivityParams
): Promise<void> {
  try {
    await db.executionActivity.create({
      data: {
        runId: params.runId || null,
        executionId: params.executionId || null,
        leadId: params.leadId || null,
        eventType: params.eventType,
        fromStatus: params.fromStatus || null,
        toStatus: params.toStatus || null,
        detail: params.detail || null,
        userId: params.userId,
      },
    });
  } catch (error: unknown) {
    // Best-effort — tracking must NEVER break execution.
    console.warn(
      '[ExecutionActivity] log failed (non-fatal):',
      error instanceof Error ? error.message : String(error)
    );
  }
}

// ===== Query helpers =====

/**
 * Get all activity records for a specific AutopilotRun.
 * Ownership-scoped: only returns records for the given userId.
 */
export async function getActivityForRun(
  runId: string,
  userId: string
): Promise<ExecutionActivityRecord[]> {
  return db.executionActivity.findMany({
    where: { runId, userId },
    orderBy: { createdAt: 'asc' },
    take: 500, // bounded — prevent unbounded queries
  });
}

/**
 * Get all activity records for a specific WorkflowExecution.
 * Ownership-scoped.
 */
export async function getActivityForExecution(
  executionId: string,
  userId: string
): Promise<ExecutionActivityRecord[]> {
  return db.executionActivity.findMany({
    where: { executionId, userId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
}

/**
 * Get recent activity for a user (paginated).
 * Used for dashboard/activity-feed UI.
 */
export async function getRecentActivity(
  userId: string,
  limit: number = 50
): Promise<ExecutionActivityRecord[]> {
  return db.executionActivity.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
