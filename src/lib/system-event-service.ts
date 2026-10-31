// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Operational Event Writer
// Phase 32: Central SystemEvent writer for real operational failures.
//
// SEMANTIC SEPARATION from AuditLog:
//   SystemEvent = operational visibility (errors, warnings, critical,
//                 system failures, workflow failures, provider failures)
//   AuditLog    = administrative/security accountability (admin actions,
//                 retries, event resolution, RBAC changes)
//
// One operation may legitimately produce BOTH records when appropriate.
// Example: admin resolves an operational event →
//   SystemEvent.resolved = true (operational state change)
//   AuditLog action='event_resolved' (who resolved it)
//
// SAFETY:
//   - Never stores secrets (sanitized details)
//   - Bounded message/details length
//   - Safe to call from failure paths (never throws)
//   - Logging failure is observable via console.error but does NOT
//     crash the original operation
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export type SystemEventType = 'error' | 'warning' | 'info' | 'critical';

export interface RecordSystemEventOptions {
  type: SystemEventType;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

// Secret patterns to redact from details before persistence
const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{20,}/g,
  /sk_test_[a-zA-Z0-9]{20,}/g,
  /rk_live_[a-zA-Z0-9]{20,}/g,
  /whsec_[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /github_pat_[a-zA-Z0-9_]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  /password\s*[:=]\s*[^\s,}"']+/gi,
  /apiKey\s*[:=]\s*[^\s,}"']+/gi,
  /api_key\s*[:=]\s*[^\s,}"']+/gi,
  /secret\s*[:=]\s*[^\s,}"']+/gi,
  /token\s*[:=]\s*[^\s,}"']+/gi,
  /STRIPE_SECRET_KEY\s*[:=]\s*[^\s,}"']+/gi,
  /RAZORPAY_KEY_SECRET\s*[:=]\s*[^\s,}"']+/gi,
  /JWT_SECRET\s*[:=]\s*[^\s,}"']+/gi,
  /GOOGLE_CLIENT_SECRET\s*[:=]\s*[^\s,}"']+/gi,
  /DATABASE_URL\s*[:=]\s*[^\s,}"']+/gi,
];

/**
 * Redact secret-like values from a string before persistence.
 * Replaces matched patterns with [REDACTED].
 */
function sanitizeText(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Recursively sanitize an object's string values.
 */
function sanitizeDetails(obj: unknown): Record<string, unknown> {
  if (obj == null) return {};
  if (typeof obj === 'string') return { value: sanitizeText(obj) };
  if (typeof obj !== 'object') return { value: String(obj) };

  const result: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === 'string') {
        result[key] = sanitizeText(value).slice(0, 1000); // bound length
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeDetails(value);
      } else {
        result[key] = value;
      }
    }
  } catch {
    // If sanitization fails, return a safe placeholder
    return { sanitized: true, note: 'details sanitization fallback' };
  }
  return result;
}

/**
 * Record a SystemEvent — the central operational event writer.
 *
 * SAFE TO CALL FROM FAILURE PATHS:
 *   - Never throws (all errors are caught + logged via console.error)
 *   - Does NOT crash the original operation if logging fails
 *   - Logging failure is observable through server logs
 *
 * NEVER STORES SECRETS:
 *   - All string values are sanitized via SECRET_PATTERNS
 *   - Details are bounded (message ≤ 500 chars, details JSON ≤ 4000 chars)
 *
 * Usage:
 *   await recordSystemEvent({
 *     type: 'error',
 *     source: 'workflow_executor',
 *     message: 'Workflow execution failed',
 *     details: { executionId, workflowId, error: lastError }
 *   });
 *
 * Or fire-and-forget from a hot path:
 *   recordSystemEvent({...}).catch(() => {});
 */
export async function recordSystemEvent(options: RecordSystemEventOptions): Promise<void> {
  try {
    // Validate + bound inputs
    const type = (['error', 'warning', 'info', 'critical'] as const).includes(options.type as SystemEventType)
      ? options.type
      : 'error';
    const source = String(options.source || 'unknown').slice(0, 100);
    const message = sanitizeText(String(options.message || '').slice(0, 500));
    const sanitizedDetails = sanitizeDetails(options.details || {});
    const detailsJson = JSON.stringify(sanitizedDetails).slice(0, 4000);

    await db.systemEvent.create({
      data: {
        type,
        source,
        message,
        details: detailsJson,
        resolved: false,
      },
    });
  } catch (error) {
    // NEVER crash the original operation because of a logging failure.
    // The logging failure itself is observable through server logs.
    console.error('[SystemEvent] Failed to record operational event:', {
      type: options.type,
      source: options.source,
      message: options.message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
