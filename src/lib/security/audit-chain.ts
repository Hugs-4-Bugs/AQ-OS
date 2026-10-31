// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 33 Admin Audit & Security Operations
//
// Tamper-evident audit chain writer + integrity verification + 
// sensitive action confirmation + security event recording +
// suspicious activity detection + configuration change auditing.
//
// SEMANTIC SEPARATION:
//   AuditLog = administrative/security accountability (Phase 33 owns this)
//   SystemEvent = operational/system visibility (Phase 32 owns this)
//
// IMUTABILITY:
//   recordAuditEvent() is append-only. No update/delete operations
//   are exposed. Each event is hash-chained to the previous event.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { createHash, randomBytes } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AuditOutcome = 'success' | 'denied' | 'failed' | 'confirmed';

export interface RecordAuditEventOptions {
  actorId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  securityEventType?: string;
  confirmed?: boolean;
}

// ─── Secret Sanitization ─────────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{20,}/g,
  /sk_test_[a-zA-Z0-9]{20,}/g,
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

function sanitizeText(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function sanitizeObject(obj: unknown): Record<string, unknown> {
  if (obj == null) return {};
  if (typeof obj === 'string') return { value: sanitizeText(obj) };
  if (typeof obj !== 'object') return { value: String(obj) };
  const result: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === 'string') {
        result[key] = sanitizeText(value).slice(0, 1000);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
  } catch {
    return { sanitized: true, note: 'details sanitization fallback' };
  }
  return result;
}

// ─── Canonical Hash Computation ──────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of an audit event's canonical payload.
 * Uses canonical JSON (sorted keys) to ensure stable hashing.
 */
function computeEventHash(payload: {
  sequence: number;
  previousHash: string;
  actorId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: string | null;
  timestamp: string;
}): string {
  // Canonical form: sorted keys, no whitespace
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Append-Only Audit Writer ────────────────────────────────────────

/**
 * Record an audit event — APPEND ONLY.
 *
 * This function NEVER exposes update or delete operations.
 * Each event is hash-chained to the previous event for tamper detection.
 *
 * Safety:
 *   - Never stores secrets (sanitized via SECRET_PATTERNS)
 *   - Bounded payload (details ≤ 4000 chars, before/after ≤ 4000 chars each)
 *   - Safe to call from failure paths (catches + logs errors, never throws)
 *   - Hash chain provides tamper evidence
 */
export async function recordAuditEvent(options: RecordAuditEventOptions): Promise<{ id: string; sequence: number; eventHash: string } | null> {
  try {
    // Sanitize all inputs
    const sanitizedDetails = options.details ? JSON.stringify(sanitizeObject(options.details)).slice(0, 4000) : null;
    const sanitizedBefore = options.beforeState ? JSON.stringify(sanitizeObject(options.beforeState)).slice(0, 4000) : null;
    const sanitizedAfter = options.afterState ? JSON.stringify(sanitizeObject(options.afterState)).slice(0, 4000) : null;

    // Get the last audit event for chain linking
    const lastEvent = await db.auditLog.findFirst({
      where: { sequence: { not: null } },
      orderBy: { sequence: 'desc' },
      select: { sequence: true, eventHash: true },
    }).catch(() => null);

    const sequence = (lastEvent?.sequence || 0) + 1;
    const previousHash = lastEvent?.eventHash || 'GENESIS';
    const timestamp = new Date().toISOString();

    // Compute event hash (canonical payload)
    const eventHash = computeEventHash({
      sequence,
      previousHash,
      actorId: options.actorId,
      action: options.action,
      resource: options.resource || null,
      resourceId: options.resourceId || null,
      details: sanitizedDetails,
      timestamp,
    });

    // Append the audit event
    const event = await db.auditLog.create({
      data: {
        userId: options.actorId,
        action: options.action,
        details: sanitizedDetails,
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        resource: options.resource || null,
        resourceId: options.resourceId || null,
        // Phase 33 fields
        sequence,
        previousHash,
        eventHash,
        severity: options.severity || null,
        requestId: options.requestId || null,
        outcome: options.outcome || null,
        beforeState: sanitizedBefore,
        afterState: sanitizedAfter,
        securityEventType: options.securityEventType || null,
        confirmed: options.confirmed || null,
      },
    });

    return { id: event.id, sequence, eventHash };
  } catch (error) {
    // NEVER crash the original operation because of audit logging failure.
    console.error('[AuditChain] Failed to record audit event:', {
      action: options.action,
      actorId: options.actorId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─── Audit Integrity Verification ────────────────────────────────────

export interface IntegrityViolation {
  type: 'MODIFIED_RECORD' | 'BROKEN_CHAIN' | 'INCORRECT_PREVIOUS_HASH' | 'INCORRECT_EVENT_HASH' | 'DUPLICATE_SEQUENCE';
  auditId: string;
  sequence: number;
  expected: string;
  actual: string;
  message: string;
}

export interface IntegrityVerificationResult {
  valid: boolean;
  totalEvents: number;
  verifiedEvents: number;
  firstViolation: IntegrityViolation | null;
  allViolations: IntegrityViolation[];
}

/**
 * Verify the audit chain integrity — detects modified records, broken chains,
 * incorrect hashes, and duplicate sequences.
 *
 * This is an admin security operation that must itself be audited.
 */
export async function verifyAuditIntegrity(): Promise<IntegrityVerificationResult> {
  try {
    // Get all chained audit events ordered by sequence
    const events = await db.auditLog.findMany({
      where: { sequence: { not: null } },
      orderBy: { sequence: 'asc' },
      select: {
        id: true, sequence: true, previousHash: true, eventHash: true,
        userId: true, action: true, resource: true, resourceId: true,
        details: true, createdAt: true,
      },
    });

    const violations: IntegrityViolation[] = [];
    let expectedPreviousHash = 'GENESIS';
    let lastSequence = 0;
    const seenSequences = new Set<number>();

    for (const event of events) {
      const seq = event.sequence!;
      // Check for duplicate sequence
      if (seenSequences.has(seq)) {
        violations.push({
          type: 'DUPLICATE_SEQUENCE',
          auditId: event.id,
          sequence: seq,
          expected: String(seq),
          actual: String(seq),
          message: `Duplicate sequence number ${seq}`,
        });
      }
      seenSequences.add(seq);

      // Check previous hash links correctly
      if (event.previousHash !== expectedPreviousHash) {
        violations.push({
          type: 'INCORRECT_PREVIOUS_HASH',
          auditId: event.id,
          sequence: seq,
          expected: expectedPreviousHash,
          actual: event.previousHash || 'null',
          message: `Event ${seq}: previousHash is '${event.previousHash}' but expected '${expectedPreviousHash}'`,
        });
      }

      // Recompute event hash and verify
      const recomputedHash = computeEventHash({
        sequence: seq,
        previousHash: event.previousHash || '',
        actorId: event.userId,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId,
        details: event.details,
        timestamp: event.createdAt.toISOString(),
      });

      if (event.eventHash !== recomputedHash) {
        violations.push({
          type: 'INCORRECT_EVENT_HASH',
          auditId: event.id,
          sequence: seq,
          expected: recomputedHash,
          actual: event.eventHash || 'null',
          message: `Event ${seq}: eventHash does not match recomputed hash — record may have been modified`,
        });
      }

      expectedPreviousHash = event.eventHash || '';
      lastSequence = seq;
    }

    return {
      valid: violations.length === 0,
      totalEvents: events.length,
      verifiedEvents: events.length,
      firstViolation: violations[0] || null,
      allViolations: violations,
    };
  } catch (error) {
    console.error('[AuditChain] Integrity verification failed:', error);
    return {
      valid: false,
      totalEvents: 0,
      verifiedEvents: 0,
      firstViolation: {
        type: 'MODIFIED_RECORD',
        auditId: 'unknown',
        sequence: 0,
        expected: 'N/A',
        actual: 'N/A',
        message: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      },
      allViolations: [],
    };
  }
}

// ─── Sensitive Action Confirmation ───────────────────────────────────

const CONFIRMATION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sensitive actions that require server-enforced confirmation.
 * Based on the actual application capabilities — not invented.
 */
export const SENSITIVE_ACTIONS = [
  'rbac_assign_role',
  'rbac_remove_role',
  'config_change_payment',
  'config_change_security',
  'config_change_integration',
] as const;

export type SensitiveAction = typeof SENSITIVE_ACTIONS[number];

/**
 * Request a sensitive action confirmation.
 * Creates a single-use, expiring confirmation token bound to the exact action+target.
 */
export async function requestConfirmation(params: {
  actionType: SensitiveAction;
  targetId: string;
  adminId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ confirmationId: string; token: string; expiresAt: Date }> {
  // Generate a random token
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + CONFIRMATION_EXPIRY_MS);

  const confirmation = await db.sensitiveActionConfirmation.create({
    data: {
      actionType: params.actionType,
      targetId: params.targetId,
      adminId: params.adminId,
      tokenHash,
      status: 'pending',
      requestId: params.requestId || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      expiresAt,
    },
  });

  // Audit the confirmation request
  await recordAuditEvent({
    actorId: params.adminId,
    action: 'sensitive_action_confirmation_requested',
    resource: 'confirmation',
    resourceId: confirmation.id,
    details: { actionType: params.actionType, targetId: params.targetId },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
    severity: 'MEDIUM',
    outcome: 'success',
    securityEventType: 'sensitive_action_requested',
  }).catch(() => {});

  return { confirmationId: confirmation.id, token, expiresAt };
}

/**
 * Confirm a sensitive action.
 * Validates: token exists, is pending, not expired, bound to exact action+target.
 * Single-use: marks as 'used' after confirmation.
 */
export async function confirmAction(params: {
  confirmationId: string;
  token: string;
  actionType: SensitiveAction;
  targetId: string;
  adminId: string;
}): Promise<{ valid: boolean; reason?: string; confirmationId: string }> {
  const tokenHash = createHash('sha256').update(params.token).digest('hex');

  const confirmation = await db.sensitiveActionConfirmation.findUnique({
    where: { tokenHash },
  });

  if (!confirmation) {
    return { valid: false, reason: 'Invalid confirmation token', confirmationId: params.confirmationId };
  }

  // Check action+target binding
  if (confirmation.actionType !== params.actionType || confirmation.targetId !== params.targetId) {
    return { valid: false, reason: 'Confirmation is not bound to this action/target', confirmationId: confirmation.id };
  }

  // Check admin identity
  if (confirmation.adminId !== params.adminId) {
    return { valid: false, reason: 'Confirmation was requested by a different admin', confirmationId: confirmation.id };
  }

  // Check status
  if (confirmation.status !== 'pending') {
    return { valid: false, reason: `Confirmation is already ${confirmation.status}`, confirmationId: confirmation.id };
  }

  // Check expiry
  if (new Date() > confirmation.expiresAt) {
    await db.sensitiveActionConfirmation.update({
      where: { id: confirmation.id },
      data: { status: 'expired' },
    }).catch(() => {});
    return { valid: false, reason: 'Confirmation has expired', confirmationId: confirmation.id };
  }

  // Mark as used (single-use)
  await db.sensitiveActionConfirmation.update({
    where: { id: confirmation.id },
    data: { status: 'used', usedAt: new Date() },
  });

  // Audit the confirmation approval
  await recordAuditEvent({
    actorId: params.adminId,
    action: 'sensitive_action_confirmed',
    resource: 'confirmation',
    resourceId: confirmation.id,
    details: { actionType: params.actionType, targetId: params.targetId },
    ipAddress: confirmation.ipAddress || undefined,
    userAgent: confirmation.userAgent || undefined,
    requestId: confirmation.requestId || undefined,
    severity: 'HIGH',
    outcome: 'confirmed',
    securityEventType: 'sensitive_action_confirmed',
    confirmed: true,
  }).catch(() => {});

  return { valid: true, confirmationId: confirmation.id };
}

// ─── Security Event Recording ────────────────────────────────────────

/**
 * Record a security event (failed authorization, privilege escalation attempt, etc.)
 * Writes to AuditLog with securityEventType + severity for classification.
 */
export async function recordSecurityEvent(params: {
  actorId?: string;
  securityEventType: string;
  severity: AuditSeverity;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  outcome?: AuditOutcome;
}): Promise<void> {
  await recordAuditEvent({
    actorId: params.actorId || 'system',
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    details: params.details,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
    severity: params.severity,
    outcome: params.outcome || 'denied',
    securityEventType: params.securityEventType,
  });
}

// ─── Suspicious Activity Detection ───────────────────────────────────

export interface SuspiciousActivityDetection {
  rule: string;
  severity: AuditSeverity;
  evidence: {
    count: number;
    threshold: number;
    timeWindowMinutes: number;
    firstOccurrence: Date;
    lastOccurrence: Date;
    actorIds: string[];
  };
  message: string;
}

/**
 * Detect suspicious activity using deterministic, explainable rules.
 * Only uses data the application actually has (AuditLog).
 */
export async function detectSuspiciousActivity(): Promise<SuspiciousActivityDetection[]> {
  const detections: SuspiciousActivityDetection[] = [];
  const now = new Date();

  // Rule A: AUTHZ_FAILURE_BURST — ≥5 authz failures from same actor/IP in 5 min
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const authzFailures = await db.auditLog.findMany({
    where: {
      securityEventType: 'authz_permission_denied',
      createdAt: { gte: fiveMinAgo },
    },
    select: { userId: true, ipAddress: true, createdAt: true },
  }).catch(() => []);

  // Group by actor
  const authzByActor = new Map<string, { count: number; first: Date; last: Date; ips: Set<string> }>();
  for (const f of authzFailures) {
    const key = f.userId;
    const existing = authzByActor.get(key) || { count: 0, first: f.createdAt, last: f.createdAt, ips: new Set() };
    existing.count++;
    if (f.createdAt < existing.first) existing.first = f.createdAt;
    if (f.createdAt > existing.last) existing.last = f.createdAt;
    if (f.ipAddress) existing.ips.add(f.ipAddress);
    authzByActor.set(key, existing);
  }

  for (const [actorId, data] of authzByActor) {
    if (data.count >= 5) {
      detections.push({
        rule: 'AUTHZ_FAILURE_BURST',
        severity: 'HIGH',
        evidence: {
          count: data.count,
          threshold: 5,
          timeWindowMinutes: 5,
          firstOccurrence: data.first,
          lastOccurrence: data.last,
          actorIds: [actorId],
        },
        message: `Actor ${actorId} had ${data.count} authorization failures in 5 minutes (threshold: 5)`,
      });
    }
  }

  // Rule B: SENSITIVE_ACTION_FAILURE_BURST — ≥3 sensitive action failures in 10 min
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const sensitiveFailures = await db.auditLog.findMany({
    where: {
      action: { contains: 'sensitive_action' },
      outcome: 'failed',
      createdAt: { gte: tenMinAgo },
    },
    select: { userId: true, createdAt: true },
  }).catch(() => []);

  const sensitiveByActor = new Map<string, { count: number; first: Date; last: Date }>();
  for (const f of sensitiveFailures) {
    const key = f.userId;
    const existing = sensitiveByActor.get(key) || { count: 0, first: f.createdAt, last: f.createdAt };
    existing.count++;
    if (f.createdAt < existing.first) existing.first = f.createdAt;
    if (f.createdAt > existing.last) existing.last = f.createdAt;
    sensitiveByActor.set(key, existing);
  }

  for (const [actorId, data] of sensitiveByActor) {
    if (data.count >= 3) {
      detections.push({
        rule: 'SENSITIVE_ACTION_FAILURE_BURST',
        severity: 'HIGH',
        evidence: {
          count: data.count,
          threshold: 3,
          timeWindowMinutes: 10,
          firstOccurrence: data.first,
          lastOccurrence: data.last,
          actorIds: [actorId],
        },
        message: `Actor ${actorId} had ${data.count} sensitive action failures in 10 minutes (threshold: 3)`,
      });
    }
  }

  // Rule C: RAPID_PRIVILEGE_CHANGES — ≥3 role changes in 10 min
  const roleChanges = await db.auditLog.findMany({
    where: {
      action: { contains: 'rbac_' },
      createdAt: { gte: tenMinAgo },
    },
    select: { userId: true, createdAt: true },
  }).catch(() => []);

  const roleChangesByActor = new Map<string, { count: number; first: Date; last: Date }>();
  for (const r of roleChanges) {
    const key = r.userId;
    const existing = roleChangesByActor.get(key) || { count: 0, first: r.createdAt, last: r.createdAt };
    existing.count++;
    if (r.createdAt < existing.first) existing.first = r.createdAt;
    if (r.createdAt > existing.last) existing.last = r.createdAt;
    roleChangesByActor.set(key, existing);
  }

  for (const [actorId, data] of roleChangesByActor) {
    if (data.count >= 3) {
      detections.push({
        rule: 'RAPID_PRIVILEGE_CHANGES',
        severity: 'MEDIUM',
        evidence: {
          count: data.count,
          threshold: 3,
          timeWindowMinutes: 10,
          firstOccurrence: data.first,
          lastOccurrence: data.last,
          actorIds: [actorId],
        },
        message: `Actor ${actorId} made ${data.count} role changes in 10 minutes (threshold: 3)`,
      });
    }
  }

  // Rule D: AUDIT_INTEGRITY_FAILURE — verify chain integrity
  const integrity = await verifyAuditIntegrity();
  if (!integrity.valid && integrity.firstViolation) {
    detections.push({
      rule: 'AUDIT_INTEGRITY_FAILURE',
      severity: 'CRITICAL',
      evidence: {
        count: integrity.allViolations.length,
        threshold: 1,
        timeWindowMinutes: 0,
        firstOccurrence: new Date(),
        lastOccurrence: new Date(),
        actorIds: [],
      },
      message: `Audit chain integrity violation: ${integrity.firstViolation.message}`,
    });
  }

  return detections;
}

// ─── Configuration Change Auditing ───────────────────────────────────

/**
 * Record a configuration change with before/after state.
 * Secrets are ALWAYS redacted — never stored.
 */
export async function recordConfigChange(params: {
  adminId: string;
  configKey: string;
  configCategory: string;
  beforeValue: unknown;
  afterValue: unknown;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  confirmed?: boolean;
}): Promise<void> {
  // Sanitize before/after — secrets become [REDACTED]
  const sanitizedBefore = sanitizeObject({ value: params.beforeValue });
  const sanitizedAfter = sanitizeObject({ value: params.afterValue });

  await recordAuditEvent({
    actorId: params.adminId,
    action: 'config_change',
    resource: 'configuration',
    resourceId: params.configKey,
    details: { configKey: params.configKey, configCategory: params.configCategory },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
    severity: 'MEDIUM',
    outcome: 'success',
    beforeState: sanitizedBefore,
    afterState: sanitizedAfter,
    securityEventType: 'config_change',
    confirmed: params.confirmed,
  });
}
