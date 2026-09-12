// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Audit Event Logger
// Phase 7: Centralized audit logging for lead operations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type LeadAuditAction =
  | 'lead_discovered'
  | 'lead_imported'
  | 'lead_exported'
  | 'lead_deleted'
  | 'lead_updated'
  | 'lead_enriched'
  | 'stage_changed'
  | 'discovery_started'
  | 'discovery_completed'
  | 'discovery_failed'
  | 'export_generated'
  | 'duplicate_prevented'
  | 'leads_merged'
  | 'note_added';

/**
 * Log a lead-related audit event.
 * Silently fails — never blocks the main flow.
 */
export async function logAuditEvent(
  userId: string,
  action: LeadAuditAction | string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'lead',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[LeadAudit] Failed to log audit event:', error);
  }
}
