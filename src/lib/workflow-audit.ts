// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Audit Event Logger
// Phase 12: Centralized audit logging for workflow operations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type WorkflowAuditAction =
  | 'workflow_created'
  | 'workflow_updated'
  | 'workflow_executed'
  | 'workflow_failed'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'workflow_retried'
  | 'workflow_cancelled'
  | 'workflow_activated'
  | 'workflow_deactivated'
  | 'workflow_deleted'
  | 'workflow_duplicated'
  | 'workflow_template_instantiated'
  | 'workflow_dead_lettered'
  | 'workflow_dead_letter_retried'
  | 'workflow_dead_letter_purged';

/**
 * Log a workflow-related audit event.
 * Silently fails — never blocks the main flow.
 */
export async function logWorkflowEvent(
  userId: string,
  action: WorkflowAuditAction | string,
  details?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: details ? JSON.stringify(details) : null,
        resource: 'workflow',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[WorkflowAudit] Failed to log audit event:', error);
  }
}
