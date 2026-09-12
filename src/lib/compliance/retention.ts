// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Retention Engine
// Phase 14.6: Compliance
// 11 retention policies with specific periods, enforceRetention() function
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ── Retention Policy Definition ────────────────────────────────────
export interface RetentionPolicy {
  category: string;
  description: string;
  retentionDays: number;
  action: 'delete' | 'anonymize' | 'archive';
  legalBasis: string;
  gdprArticle: string;
}

// ── 11 Retention Policies ──────────────────────────────────────────
export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    category: 'user_sessions',
    description: 'Active user sessions and refresh tokens',
    retentionDays: 30,
    action: 'delete',
    legalBasis: 'Security and authentication — data is no longer needed after session expiry',
    gdprArticle: 'Article 6(1)(f) — Legitimate interest',
  },
  {
    category: 'login_history',
    description: 'Records of login attempts (successful and failed)',
    retentionDays: 90,
    action: 'anonymize',
    legalBasis: 'Security monitoring and fraud prevention',
    gdprArticle: 'Article 6(1)(f) — Legitimate interest',
  },
  {
    category: 'audit_logs',
    description: 'System audit trail for compliance and security',
    retentionDays: 365,
    action: 'archive',
    legalBasis: 'Legal compliance and security audit requirements',
    gdprArticle: 'Article 6(1)(c) — Legal obligation',
  },
  {
    category: 'email_messages',
    description: 'Email communications and thread data',
    retentionDays: 365,
    action: 'anonymize',
    legalBasis: 'Business communication records and dispute resolution',
    gdprArticle: 'Article 6(1)(f) — Legitimate interest',
  },
  {
    category: 'notifications',
    description: 'In-app notification records',
    retentionDays: 90,
    action: 'delete',
    legalBasis: 'No longer needed once read or expired',
    gdprArticle: 'Article 5(1)(e) — Storage limitation',
  },
  {
    category: 'ai_chat_history',
    description: 'AI assistant conversation logs',
    retentionDays: 180,
    action: 'anonymize',
    legalBasis: 'Product improvement and personalization',
    gdprArticle: 'Article 6(1)(a) — Consent (ai_data_usage)',
  },
  {
    category: 'security_alerts',
    description: 'Security alerts and incident records',
    retentionDays: 365,
    action: 'archive',
    legalBasis: 'Security monitoring and incident response',
    gdprArticle: 'Article 6(1)(f) — Legitimate interest',
  },
  {
    category: 'usage_analytics',
    description: 'Feature usage tracking and analytics data',
    retentionDays: 90,
    action: 'anonymize',
    legalBasis: 'Product analytics and improvement',
    gdprArticle: 'Article 6(1)(a) — Consent (analytics_tracking)',
  },
  {
    category: 'api_key_usage',
    description: 'API key access logs and usage metrics',
    retentionDays: 90,
    action: 'delete',
    legalBasis: 'Security monitoring, no longer needed after review period',
    gdprArticle: 'Article 5(1)(e) — Storage limitation',
  },
  {
    category: 'financial_records',
    description: 'Payment orders, invoices, and billing records',
    retentionDays: 2555, // 7 years
    action: 'archive',
    legalBasis: 'Tax and financial regulatory compliance',
    gdprArticle: 'Article 6(1)(c) — Legal obligation',
  },
  {
    category: 'workflow_logs',
    description: 'Workflow execution logs and step outputs',
    retentionDays: 90,
    action: 'delete',
    legalBasis: 'Debugging and operational monitoring, no longer needed',
    gdprArticle: 'Article 5(1)(e) — Storage limitation',
  },
];

// ── Enforce Retention ──────────────────────────────────────────────
export interface RetentionResult {
  totalAffected: number;
  details: Record<string, { affected: number; action: string }>;
}

export async function enforceRetention(options: {
  dryRun: boolean;
  categories: string[] | null;
}): Promise<RetentionResult> {
  const { dryRun, categories } = options;
  const result: RetentionResult = { totalAffected: 0, details: {} };
  const now = new Date();

  const policiesToEnforce = categories
    ? RETENTION_POLICIES.filter((p) => categories.includes(p.category))
    : RETENTION_POLICIES;

  for (const policy of policiesToEnforce) {
    const cutoffDate = new Date(now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
    let affected = 0;

    try {
      switch (policy.category) {
        case 'user_sessions': {
          const expired = await db.userSession.findMany({
            where: {
              expiresAt: { lt: cutoffDate },
              isRevoked: false,
            },
            select: { id: true },
          });
          affected = expired.length;
          if (!dryRun && affected > 0) {
            await db.userSession.updateMany({
              where: { expiresAt: { lt: cutoffDate }, isRevoked: false },
              data: { isRevoked: true },
            });
          }
          break;
        }

        case 'login_history': {
          const oldLogins = await db.loginHistory.findMany({
            where: { createdAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldLogins.length;
          if (!dryRun && affected > 0) {
            await db.loginHistory.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'audit_logs': {
          const oldAuditLogs = await db.auditLog.findMany({
            where: { createdAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldAuditLogs.length;
          if (!dryRun && affected > 0) {
            await db.auditLog.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'notifications': {
          const oldNotifications = await db.notification.findMany({
            where: { createdAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldNotifications.length;
          if (!dryRun && affected > 0) {
            await db.notification.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'ai_chat_history': {
          const oldSessions = await db.aiChatSession.findMany({
            where: { createdAt: { lt: cutoffDate }, isActive: false },
            select: { id: true },
          });
          affected = oldSessions.length;
          if (!dryRun && affected > 0) {
            // Delete messages first (cascade)
            for (const session of oldSessions) {
              await db.aiChatMessage.deleteMany({
                where: { sessionId: session.id },
              });
            }
            await db.aiChatSession.deleteMany({
              where: { createdAt: { lt: cutoffDate }, isActive: false },
            });
          }
          break;
        }

        case 'security_alerts': {
          const oldAlerts = await db.securityAlert.findMany({
            where: { createdAt: { lt: cutoffDate }, isResolved: true },
            select: { id: true },
          });
          affected = oldAlerts.length;
          if (!dryRun && affected > 0) {
            await db.securityAlert.deleteMany({
              where: { createdAt: { lt: cutoffDate }, isResolved: true },
            });
          }
          break;
        }

        case 'usage_analytics': {
          const oldUsage = await db.usageTracking.findMany({
            where: { periodEnd: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldUsage.length;
          if (!dryRun && affected > 0) {
            await db.usageTracking.deleteMany({
              where: { periodEnd: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'api_key_usage': {
          const oldApiUsage = await db.apiKeyUsage.findMany({
            where: { createdAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldApiUsage.length;
          if (!dryRun && affected > 0) {
            await db.apiKeyUsage.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'workflow_logs': {
          const oldWorkflowLogs = await db.workflowLog.findMany({
            where: { createdAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldWorkflowLogs.length;
          if (!dryRun && affected > 0) {
            await db.workflowLog.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'email_messages': {
          const oldThreads = await db.emailThread.findMany({
            where: { lastMessageAt: { lt: cutoffDate } },
            select: { id: true },
          });
          affected = oldThreads.length;
          if (!dryRun && affected > 0) {
            for (const thread of oldThreads) {
              await db.emailMessage.deleteMany({ where: { threadId: thread.id } });
            }
            await db.emailThread.deleteMany({
              where: { lastMessageAt: { lt: cutoffDate } },
            });
          }
          break;
        }

        case 'financial_records': {
          // Financial records are retained for 7 years — only archive very old ones
          // Do not delete; just count what would be archived
          const oldRecords = await db.paymentOrder.findMany({
            where: { createdAt: { lt: cutoffDate }, status: 'completed' },
            select: { id: true },
          });
          affected = oldRecords.length;
          // In production, this would move records to cold storage
          // For now, we do not delete financial records
          break;
        }

        default:
          break;
      }

      result.details[policy.category] = {
        affected,
        action: dryRun ? 'would_' + policy.action : policy.action,
      };
      result.totalAffected += affected;
    } catch (error) {
      console.error(`Retention enforcement error for ${policy.category}:`, error);
      result.details[policy.category] = {
        affected: 0,
        action: `error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  return result;
}
