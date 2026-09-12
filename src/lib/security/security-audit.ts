// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Security Audit System
// Phase 14.3: Security Hardening
//
// Automated security auditing with 30+ event types, severity levels,
// failed auth tracking, privilege escalation detection, and
// withSecurityAudit() middleware.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ===== TYPES =====

export type SecurityEventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SecurityEventType =
  // Authentication events
  | 'auth_success'
  | 'auth_failure'
  | 'auth_brute_force'
  | 'auth_locked_out'
  | 'auth_unlocked'
  | 'auth_mfa_enabled'
  | 'auth_mfa_disabled'
  | 'auth_mfa_failed'
  | 'auth_password_reset'
  | 'auth_password_changed'
  | 'auth_session_revoked'
  | 'auth_suspicious_login'
  // Authorization events
  | 'authz_permission_denied'
  | 'authz_role_change'
  | 'authz_privilege_escalation'
  | 'authz_unauthorized_access'
  // Data access events
  | 'data_export'
  | 'data_import'
  | 'data_delete'
  | 'data_bulk_operation'
  | 'data_sensitive_access'
  // Input security events
  | 'input_sql_injection'
  | 'input_xss'
  | 'input_path_traversal'
  | 'input_command_injection'
  | 'input_validation_failure'
  // Rate limiting events
  | 'rate_limit_exceeded'
  | 'rate_limit_warning'
  // Webhook events
  | 'webhook_signature_invalid'
  | 'webhook_replay_detected'
  // Token events
  | 'token_revoked'
  | 'token_replay_detected'
  | 'token_family_compromised'
  // System events
  | 'config_change'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'security_scan_triggered'
  | 'security_alert_triggered';

export interface SecurityAuditEntry {
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// ===== SEVERITY MAPPING =====

const EVENT_SEVERITY: Record<SecurityEventType, SecurityEventSeverity> = {
  // Authentication
  auth_success: 'info',
  auth_failure: 'medium',
  auth_brute_force: 'critical',
  auth_locked_out: 'high',
  auth_unlocked: 'medium',
  auth_mfa_enabled: 'info',
  auth_mfa_disabled: 'high',
  auth_mfa_failed: 'high',
  auth_password_reset: 'medium',
  auth_password_changed: 'medium',
  auth_session_revoked: 'medium',
  auth_suspicious_login: 'critical',
  // Authorization
  authz_permission_denied: 'high',
  authz_role_change: 'high',
  authz_privilege_escalation: 'critical',
  authz_unauthorized_access: 'high',
  // Data access
  data_export: 'medium',
  data_import: 'medium',
  data_delete: 'high',
  data_bulk_operation: 'medium',
  data_sensitive_access: 'medium',
  // Input security
  input_sql_injection: 'critical',
  input_xss: 'critical',
  input_path_traversal: 'critical',
  input_command_injection: 'critical',
  input_validation_failure: 'medium',
  // Rate limiting
  rate_limit_exceeded: 'medium',
  rate_limit_warning: 'low',
  // Webhooks
  webhook_signature_invalid: 'high',
  webhook_replay_detected: 'critical',
  // Tokens
  token_revoked: 'medium',
  token_replay_detected: 'critical',
  token_family_compromised: 'critical',
  // System
  config_change: 'high',
  api_key_created: 'medium',
  api_key_revoked: 'medium',
  security_scan_triggered: 'info',
  security_alert_triggered: 'high',
};

// ===== IN-MEMORY AUDIT BUFFER =====

const auditBuffer: SecurityAuditEntry[] = [];
const MAX_BUFFER_SIZE = 10000;

// ===== FAILED AUTH TRACKING =====

interface FailedAuthEntry {
  ipAddress: string;
  attempts: number;
  lastAttempt: number;
  userIds: Set<string>;
}

const failedAuthTracker = new Map<string, FailedAuthEntry>();
const BRUTE_FORCE_THRESHOLD = 10; // 10 failures from same IP in tracking window
const TRACKING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ===== PRIVILEGE ESCALATION DETECTION =====

interface RoleChangeEntry {
  userId: string;
  previousRole: string;
  newRole: string;
  changedBy: string;
  timestamp: number;
}

const roleChangeHistory: RoleChangeEntry[] = [];

const PRIVILEGE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
  super_admin: 4,
};

/**
 * Detect if a role change constitutes privilege escalation.
 */
export function detectPrivilegeEscalation(
  previousRole: string,
  newRole: string,
  changedByUserId: string,
  targetUserId: string
): boolean {
  const previousLevel = PRIVILEGE_HIERARCHY[previousRole] ?? 0;
  const newLevel = PRIVILEGE_HIERARCHY[newRole] ?? 0;

  // Escalation if the new role has more privileges
  const isEscalation = newLevel > previousLevel;

  // Self-escalation is always suspicious
  const isSelfEscalation = changedByUserId === targetUserId;

  // Record the change
  roleChangeHistory.push({
    userId: targetUserId,
    previousRole,
    newRole,
    changedBy: changedByUserId,
    timestamp: Date.now(),
  });

  // Keep only recent history (last 24 hours)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  while (roleChangeHistory.length > 0 && roleChangeHistory[0].timestamp < cutoff) {
    roleChangeHistory.shift();
  }

  return isEscalation || isSelfEscalation;
}

// ===== CORE AUDIT FUNCTION =====

/**
 * Record a security audit event.
 * Stores in the in-memory buffer and persists to the database.
 */
export async function auditSecurityEvent(params: {
  eventType: SecurityEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const severity = EVENT_SEVERITY[params.eventType] || 'info';

  const entry: SecurityAuditEntry = {
    eventType: params.eventType,
    severity,
    userId: params.userId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    resource: params.resource,
    resourceId: params.resourceId,
    details: params.details,
    metadata: params.metadata,
    timestamp: new Date(),
  };

  // Add to in-memory buffer
  auditBuffer.push(entry);
  if (auditBuffer.length > MAX_BUFFER_SIZE) {
    auditBuffer.shift();
  }

  // Track failed auth attempts
  if (params.eventType === 'auth_failure' && params.ipAddress) {
    trackFailedAuth(params.ipAddress, params.userId);
  }

  // Persist to database
  try {
    if (params.userId) {
      await db.auditLog.create({
        data: {
          userId: params.userId,
          action: params.eventType,
          details: params.details || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          resource: params.resource || null,
          resourceId: params.resourceId || null,
        },
      });
    }
  } catch (error) {
    // Never block the main flow due to audit logging failure
    console.error('Security audit persistence error:', error);
  }

  // Log critical/high severity events
  if (severity === 'critical' || severity === 'high') {
    console.warn(
      `[SECURITY AUDIT] ${severity.toUpperCase()}: ${params.eventType}`,
      params.details || '',
      params.userId ? `user=${params.userId}` : '',
      params.ipAddress ? `ip=${params.ipAddress}` : ''
    );
  }
}

// ===== FAILED AUTH TRACKING =====

function trackFailedAuth(ipAddress: string, userId?: string): void {
  let entry = failedAuthTracker.get(ipAddress);
  if (!entry) {
    entry = {
      ipAddress,
      attempts: 0,
      lastAttempt: Date.now(),
      userIds: new Set(),
    };
    failedAuthTracker.set(ipAddress, entry);
  }

  entry.attempts += 1;
  entry.lastAttempt = Date.now();
  if (userId) {
    entry.userIds.add(userId);
  }

  // Check for brute force pattern
  if (entry.attempts >= BRUTE_FORCE_THRESHOLD) {
    auditSecurityEvent({
      eventType: 'auth_brute_force',
      ipAddress,
      details: `Brute force detected: ${entry.attempts} failed attempts from ${ipAddress} targeting ${entry.userIds.size} users`,
      metadata: {
        attemptCount: entry.attempts,
        targetedUsers: Array.from(entry.userIds),
      },
    });
  }
}

/**
 * Check if an IP is currently under brute force monitoring.
 */
export function isIpUnderBruteForceMonitor(ipAddress: string): boolean {
  const entry = failedAuthTracker.get(ipAddress);
  if (!entry) return false;

  // Check if within tracking window
  if (Date.now() - entry.lastAttempt > TRACKING_WINDOW_MS) {
    failedAuthTracker.delete(ipAddress);
    return false;
  }

  return entry.attempts >= BRUTE_FORCE_THRESHOLD;
}

/**
 * Clear the brute force tracking for an IP (e.g., after successful auth).
 */
export function clearBruteForceTracking(ipAddress: string): void {
  failedAuthTracker.delete(ipAddress);
}

// ===== SECURITY AUDIT MIDDLEWARE =====

/**
 * Security audit middleware for API routes.
 * Automatically records the specified action with request context.
 *
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const audit = withSecurityAudit('data_export');
 *     // ... your handler logic
 *     await audit.record(request, { userId: user.id, details: 'Exported leads' });
 *     return response;
 *   }
 */
export function withSecurityAudit(action: SecurityEventType): {
  record: (request: NextRequest, context?: {
    userId?: string;
    resource?: string;
    resourceId?: string;
    details?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
} {
  const severity = EVENT_SEVERITY[action] || 'info';

  return {
    eventType: action,
    severity,
    record: async (request: NextRequest, context?: {
      userId?: string;
      resource?: string;
      resourceId?: string;
      details?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                 request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      await auditSecurityEvent({
        eventType: action,
        userId: context?.userId,
        ipAddress: ip,
        userAgent,
        resource: context?.resource,
        resourceId: context?.resourceId,
        details: context?.details,
        metadata: context?.metadata,
      });
    },
  };
}

// ===== AUTOMATED SECURITY AUDIT =====

export interface SecurityAuditReport {
  timestamp: string;
  summary: {
    totalEvents: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
  bruteForceIps: string[];
  recentPrivilegeEscalations: RoleChangeEntry[];
  topEventTypes: { eventType: string; count: number }[];
  recommendations: string[];
}

/**
 * Run an automated security audit and generate a report.
 */
export function runSecurityAudit(): SecurityAuditReport {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const recentEvents = auditBuffer.filter(e => e.timestamp.getTime() > last24h);

  // Count by severity
  const criticalCount = recentEvents.filter(e => e.severity === 'critical').length;
  const highCount = recentEvents.filter(e => e.severity === 'high').length;
  const mediumCount = recentEvents.filter(e => e.severity === 'medium').length;
  const lowCount = recentEvents.filter(e => e.severity === 'low').length;
  const infoCount = recentEvents.filter(e => e.severity === 'info').length;

  // Identify brute force IPs
  const bruteForceIps: string[] = [];
  for (const [ip, entry] of failedAuthTracker.entries()) {
    if (entry.attempts >= BRUTE_FORCE_THRESHOLD && now - entry.lastAttempt < TRACKING_WINDOW_MS) {
      bruteForceIps.push(ip);
    }
  }

  // Recent privilege escalations
  const recentEscalations = roleChangeHistory.filter(
    e => e.timestamp > last24h &&
    (PRIVILEGE_HIERARCHY[e.newRole] ?? 0) > (PRIVILEGE_HIERARCHY[e.previousRole] ?? 0)
  );

  // Top event types
  const eventTypeCounts = new Map<string, number>();
  for (const event of recentEvents) {
    eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) || 0) + 1);
  }
  const topEventTypes = Array.from(eventTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([eventType, count]) => ({ eventType, count }));

  // Generate recommendations
  const recommendations: string[] = [];

  if (criticalCount > 0) {
    recommendations.push(`${criticalCount} critical security events detected in the last 24 hours — investigate immediately`);
  }
  if (bruteForceIps.length > 0) {
    recommendations.push(`${bruteForceIps.length} IP addresses detected with brute force patterns — consider blocking`);
  }
  if (recentEscalations.length > 0) {
    recommendations.push(`${recentEscalations.length} privilege escalation events detected — verify authorization`);
  }
  if (highCount > 10) {
    recommendations.push(`${highCount} high-severity events — review security posture`);
  }
  if (recommendations.length === 0) {
    recommendations.push('No critical security issues detected');
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalEvents: recentEvents.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
    },
    bruteForceIps,
    recentPrivilegeEscalations: recentEscalations,
    topEventTypes,
    recommendations,
  };
}

/**
 * Get the in-memory audit buffer (for debugging/exporting).
 */
export function getAuditBuffer(limit?: number): SecurityAuditEntry[] {
  if (limit) {
    return auditBuffer.slice(-limit);
  }
  return [...auditBuffer];
}

/**
 * Clear the in-memory audit buffer.
 */
export function clearAuditBuffer(): void {
  auditBuffer.length = 0;
}
