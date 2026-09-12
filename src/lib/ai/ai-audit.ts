// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Audit Logging
// Phase 8: Mandatory audit events for all AI operations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== AUDIT ACTION TYPES =====

export type AIAuditAction =
  | 'ai_analysis_generated'
  | 'ai_score_generated'
  | 'ai_outreach_generated'
  | 'ai_chat_started'
  | 'ai_chat_ended'
  | 'ai_chat_message'
  | 'ai_credits_deducted'
  | 'ai_provider_switched'
  | 'ai_generation_cancelled'
  | 'ai_generation_failed'
  | 'ai_memory_updated'
  | 'ai_memory_cleaned'
  | 'ai_prompt_used';

// ===== AUDIT LOG ENTRY =====

interface AIAuditEntry {
  userId: string;
  action: AIAuditAction;
  details?: Record<string, unknown>;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ===== CORE AUDIT FUNCTION =====

/**
 * Log an AI audit event to the database.
 * Always succeeds — errors are logged but never thrown.
 */
export async function logAIAudit(entry: AIAuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        details: entry.details ? JSON.stringify(entry.details) : null,
        resource: entry.resource || 'ai',
        resourceId: entry.resourceId || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (error) {
    console.error('[AIAudit] Failed to log audit event:', error);
    // Never throw — audit logging must not break the main flow
  }
}

// ===== HELPER FUNCTIONS =====

export async function logAnalysisGenerated(userId: string, leadId: string, details: { leadScore: number; provider: string; latencyMs: number }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_analysis_generated',
    resource: 'lead',
    resourceId: leadId,
    details,
  });
}

export async function logScoreGenerated(userId: string, leadId: string, details: { scores: Record<string, number>; provider: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_score_generated',
    resource: 'lead',
    resourceId: leadId,
    details,
  });
}

export async function logOutreachGenerated(userId: string, leadId: string, details: { channel: string; tone: string; provider: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_outreach_generated',
    resource: 'lead',
    resourceId: leadId,
    details,
  });
}

export async function logChatStarted(userId: string, sessionId: string, details: { mode: string; leadId?: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_chat_started',
    resource: 'ai_chat_session',
    resourceId: sessionId,
    details,
  });
}

export async function logChatEnded(userId: string, sessionId: string, details: { messageCount: number; durationMs: number }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_chat_ended',
    resource: 'ai_chat_session',
    resourceId: sessionId,
    details,
  });
}

export async function logCreditsDeducted(userId: string, details: { action: string; amount: number; balance: number; referenceId?: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_credits_deducted',
    resource: 'credits',
    resourceId: details.referenceId,
    details,
  });
}

export async function logProviderSwitched(userId: string, details: { from: string; to: string; reason: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_provider_switched',
    details,
  });
}

export async function logGenerationCancelled(userId: string, sessionId: string, details: { reason: string }): Promise<void> {
  return logAIAudit({
    userId,
    action: 'ai_generation_cancelled',
    resource: 'ai_chat_session',
    resourceId: sessionId,
    details,
  });
}
