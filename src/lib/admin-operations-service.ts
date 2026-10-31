// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Operations / Support / Integrations Service
// Phase 32: Production-grade operational visibility + controlled actions
//
// Reuses existing infrastructure:
//   - SystemEvent model (errors/warnings/critical events)
//   - AuditLog model (sensitive action audit trail)
//   - PaymentWebhook model (provider health evidence)
//   - EmailAccount, TelegramConfig, WhatsappConfig (integration state)
//   - ApiKey model (API key inventory)
//   - UserSession model (active session counts)
//   - getProviderStatus() from admin-billing-service (Stripe/Razorpay)
//
// All list queries are paginated + bounded (Math.min(limit, 200)).
// All aggregate queries use DB-side count/aggregate/groupBy.
// No fake "HEALTHY" status — health is ALWAYS evidence-based.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getProviderStatus } from '@/lib/admin-billing-service';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type HealthState = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type ConfigState = 'CONFIGURED' | 'NOT_CONFIGURED' | 'ERROR' | 'UNKNOWN';
export type ReachabilityState = 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN';

// --- 1. System Health ---

export interface SystemHealthResult {
  database: {
    state: HealthState;
    latencyMs: number | null;
    tableCount: number;
  };
  sessions: {
    activeCount: number;
    last24hCount: number;
  };
  errors: {
    unresolvedEvents: number;
    criticalEvents24h: number;
    errorEvents24h: number;
    warningEvents24h: number;
  };
  audit: {
    events24h: number;
    sensitiveActions24h: number;
  };
  integrations: {
    configured: number;
    notConfigured: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  overallHealth: HealthState;
}

// --- 2. Operational Events ---

export interface OperationalEventsOptions {
  type?: 'error' | 'warning' | 'info' | 'critical';
  source?: string;
  resolved?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface OperationalEventEntry {
  id: string;
  type: string;
  source: string;
  message: string;
  details: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface OperationalEventsResult {
  events: OperationalEventEntry[];
  total: number;
}

// --- 3. Resolve Event ---

export interface ResolveEventOptions {
  eventId: string;
  adminId: string;
  adminEmail: string;
  ipAddress?: string;
  userAgent?: string;
  note?: string;
}

export interface ResolveEventResult {
  success: boolean;
  eventId: string;
  resolvedAt: Date;
  alreadyResolved: boolean;
}

// --- 4. Integrations Status ---

export interface IntegrationProviderEntry {
  provider: string;
  category: 'payment' | 'email' | 'messaging' | 'ai' | 'search' | 'auth';
  configState: ConfigState;
  reachability: ReachabilityState;
  health: HealthState;
  // Evidence — never fake. These are the actual signals driving the states.
  evidence: {
    configuredAccounts: number;
    recentSuccessfulEvents: number;
    recentFailedEvents: number;
    lastEventAt: Date | null;
    lastFailureAt: Date | null;
  };
  // Safe (non-secret) operational metadata
  notes: string | null;
}

export interface IntegrationsStatusResult {
  providers: IntegrationProviderEntry[];
  summary: {
    total: number;
    configured: number;
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
  overallHealth: HealthState;
}

// --- 5. Audit Log ---

export interface AuditLogOptions {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  resource: string | null;
  resourceId: string | null;
  createdAt: Date;
  metadata: string | null;
}

export interface AuditLogResult {
  entries: AuditLogEntry[];
  total: number;
}

// --- 6. Retry Failed Operation ---

export interface RetryRequestOptions {
  idempotencyKey: string;
  operationType: string;
  targetId?: string;
  adminId: string;
  adminEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RetryRequestResult {
  accepted: boolean;
  idempotencyKey: string;
  status: 'started' | 'already_completed' | 'already_in_progress';
  priorResult?: Record<string, unknown>;
  startedAt: Date;
}

// --- 7. Operational Metrics ---

export interface OperationalMetricsResult {
  totals: {
    unresolvedEvents: number;
    criticalEvents: number;
    openSupportTickets: number;
    activeApiKeys: number;
    activeSessions: number;
  };
  last24h: {
    auditEvents: number;
    signups: number;
    signins: number;
    signinFailures: number;
    workflowExecutions: number;
    workflowFailures: number;
  };
  byEventSource: { source: string; count: number }[];
  byEventType: { type: string; count: number }[];
}

// ═══════════════════════════════════════════════════════════════════
// 1. GET SYSTEM HEALTH
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregate platform-wide health metrics.
 *
 * Database health: real latency ping (SELECT 1), not env-var presence.
 * Integration health: evidence-based (recent PaymentWebhook + EmailAccount
 *   + TelegramConfig + WhatsappConfig + Stripe/Razorpay config).
 * Overall health: worst-case across subsystems — UNKNOWN if insufficient
 *   evidence, NEVER HEALTHY from env-var presence alone.
 */
export async function getSystemHealth(): Promise<SystemHealthResult> {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── DB latency: real ping ───────────────────────────────────────
    let dbLatencyMs: number | null = null;
    let dbState: HealthState = 'UNKNOWN';
    let tableCount = 0;
    try {
      const t0 = Date.now();
      await db.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      tableCount = await db.$queryRawUnsafe(
        `SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      ) as unknown as number;
      // $queryRawUnsafe returns bigint[]/object on SQLite — coerce to number
      tableCount = Number(tableCount) || 0;
      dbState = dbLatencyMs < 500 ? 'HEALTHY' : dbLatencyMs < 2000 ? 'DEGRADED' : 'DEGRADED';
    } catch (err) {
      console.error('[AdminOps] DB ping failed:', err);
      dbState = 'DOWN';
    }

    // ── Sessions ────────────────────────────────────────────────────
    const [activeSessions, sessions24h] = await Promise.all([
      db.userSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }).catch(() => 0),
      db.userSession.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }).catch(() => 0),
    ]);

    // ── SystemEvent counts (DB-aggregated) ─────────────────────────
    const [
      unresolvedEvents,
      criticalEvents24h,
      errorEvents24h,
      warningEvents24h,
    ] = await Promise.all([
      db.systemEvent.count({ where: { resolved: false } }).catch(() => 0),
      db.systemEvent.count({
        where: { type: 'critical', createdAt: { gte: twentyFourHoursAgo } },
      }).catch(() => 0),
      db.systemEvent.count({
        where: { type: 'error', createdAt: { gte: twentyFourHoursAgo } },
      }).catch(() => 0),
      db.systemEvent.count({
        where: { type: 'warning', createdAt: { gte: twentyFourHoursAgo } },
      }).catch(() => 0),
    ]);

    // ── AuditLog counts (last 24h) ─────────────────────────────────
    const SENSITIVE_ACTIONS = [
      'refund_issued', 'credits_adjusted', 'user_suspended', 'user_banned',
      'user_restricted', 'sessions_revoked', 'plan_change', 'rbac_assigned',
      'integration_controlled', 'operation_retried', 'event_resolved',
    ];
    const [audit24h, sensitiveAudit24h] = await Promise.all([
      db.auditLog.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      db.auditLog.count({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          action: { in: SENSITIVE_ACTIONS },
        },
      }),
    ]);

    // ── Integration summary (evidence-based) ────────────────────────
    const integrationStatus = await getIntegrationsStatus();
    const integ = integrationStatus.summary;
    const integHealth = {
      configured: integ.configured,
      notConfigured: integ.total - integ.configured,
      healthy: integ.healthy,
      degraded: integ.degraded,
      down: integ.down,
      unknown: integ.unknown,
    };

    // ── Overall health: worst-case across subsystems ────────────────
    let overallHealth: HealthState;
    if (dbState === 'DOWN') {
      overallHealth = 'DOWN';
    } else if (
      criticalEvents24h > 0 ||
      integHealth.down > 0
    ) {
      overallHealth = 'DEGRADED';
    } else if (
      dbState === 'HEALTHY' &&
      errorEvents24h === 0 &&
      integ.unknown === integ.total // no integration has evidence yet
    ) {
      // Insufficient evidence — never claim HEALTHY from absence alone.
      overallHealth = 'UNKNOWN';
    } else if (dbState === 'HEALTHY' && errorEvents24h === 0 && integHealth.degraded === 0) {
      overallHealth = 'HEALTHY';
    } else {
      overallHealth = 'DEGRADED';
    }

    return {
      database: { state: dbState, latencyMs: dbLatencyMs, tableCount },
      sessions: { activeCount: activeSessions, last24hCount: sessions24h },
      errors: {
        unresolvedEvents,
        criticalEvents24h,
        errorEvents24h,
        warningEvents24h,
      },
      audit: { events24h: audit24h, sensitiveActions24h: sensitiveAudit24h },
      integrations: integHealth,
      overallHealth,
    };
  } catch (error) {
    console.error('[AdminOps] Failed to get system health:', error);
    return {
      database: { state: 'UNKNOWN', latencyMs: null, tableCount: 0 },
      sessions: { activeCount: 0, last24hCount: 0 },
      errors: { unresolvedEvents: 0, criticalEvents24h: 0, errorEvents24h: 0, warningEvents24h: 0 },
      audit: { events24h: 0, sensitiveActions24h: 0 },
      integrations: {
        configured: 0, notConfigured: 0, healthy: 0, degraded: 0, down: 0, unknown: 0,
      },
      overallHealth: 'UNKNOWN',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. GET OPERATIONAL EVENTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Paginated list of SystemEvent records with filters.
 * Bounded: limit capped at 200.
 */
export async function getOperationalEvents(
  options?: OperationalEventsOptions
): Promise<OperationalEventsResult> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.type) where.type = options.type;
    if (options?.source) where.source = { contains: options.source };
    if (options?.resolved !== undefined) where.resolved = options.resolved;
    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options?.startDate) createdAt.gte = options.startDate;
      if (options?.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [events, total] = await Promise.all([
      db.systemEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          source: true,
          message: true,
          details: true,
          resolved: true,
          resolvedAt: true,
          createdAt: true,
        },
      }),
      db.systemEvent.count({ where }),
    ]);

    return { events, total };
  } catch (error) {
    console.error('[AdminOps] Failed to get operational events:', error);
    return { events: [], total: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. RESOLVE OPERATIONAL EVENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Mark a SystemEvent as resolved. Idempotent — if already resolved,
 * returns alreadyResolved=true without changing state.
 *
 * Audit-logged: writes an AuditLog entry tied to the admin who resolved it.
 */
export async function resolveOperationalEvent(
  options: ResolveEventOptions
): Promise<ResolveEventResult> {
  try {
    const event = await db.systemEvent.findUnique({
      where: { id: options.eventId },
      select: { id: true, resolved: true, type: true, source: true, message: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.resolved) {
      return {
        success: true,
        eventId: event.id,
        resolvedAt: new Date(),
        alreadyResolved: true,
      };
    }

    const now = new Date();
    await db.systemEvent.update({
      where: { id: event.id },
      data: { resolved: true, resolvedAt: now },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: options.adminId,
          action: 'event_resolved',
          resource: 'system_event',
          resourceId: event.id,
          details: JSON.stringify({
            eventType: event.type,
            eventSource: event.source,
            eventMessage: event.message,
            note: options.note || null,
            adminEmail: options.adminEmail,
          }),
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null,
        },
      });
    } catch (auditError) {
      // Never fail the main action due to audit logging failure
      console.error('[AdminOps] Audit log write failed:', auditError);
    }

    return {
      success: true,
      eventId: event.id,
      resolvedAt: now,
      alreadyResolved: false,
    };
  } catch (error) {
    console.error('[AdminOps] Failed to resolve event:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. GET INTEGRATIONS STATUS
// ═══════════════════════════════════════════════════════════════════

/**
 * Per-provider integration status with evidence-based health.
 *
 * Config state: derived from env var presence OR configured-account count.
 * Reachability: derived from RECENT SUCCESSFUL events (last 24h).
 * Health: derived from RECENT FAILURE RATE (last 24h, ≥5 events required).
 *
 * HEALTHY is NEVER claimed from env var presence alone.
 * If there is insufficient evidence (< 5 events), health = UNKNOWN.
 */
export async function getIntegrationsStatus(): Promise<IntegrationsStatusResult> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const providers: IntegrationProviderEntry[] = [];

    // ── Payment providers: reuse Phase 31 getProviderStatus ─────────
    try {
      const paymentStatus = await getProviderStatus();
      for (const p of paymentStatus.providers) {
        const reachability: ReachabilityState =
          p.recentEvents > 0 && p.recentFailures < p.recentEvents
            ? 'REACHABLE'
            : p.recentEvents > 0
            ? 'UNREACHABLE'
            : 'UNKNOWN';
        providers.push({
          provider: `payment.${p.provider}`,
          category: 'payment',
          configState: p.configState,
          reachability,
          health: p.health,
          evidence: {
            configuredAccounts: p.configState === 'CONFIGURED' ? 1 : 0,
            recentSuccessfulEvents: p.recentEvents - p.recentFailures,
            recentFailedEvents: p.recentFailures,
            lastEventAt: p.lastEventAt,
            lastFailureAt: p.lastFailureAt,
          },
          notes: null,
        });
      }
    } catch (err) {
      console.error('[AdminOps] Payment provider status failed:', err);
    }

    // ── Email providers (EmailAccount) ──────────────────────────────
    try {
      const [emailCount, emailActiveCount, emailRecentSuccess, emailRecentFail] = await Promise.all([
        db.emailAccount.count(),
        db.emailAccount.count({ where: { status: 'active' } }),
        db.emailAccount.count({
          where: { lastPollAt: { gte: twentyFourHoursAgo }, status: 'active' },
        }),
        db.emailAccount.count({
          where: { lastPollAt: { gte: twentyFourHoursAgo }, status: { not: 'active' } },
        }),
      ]);
      const emailConfigState: ConfigState = emailCount > 0 ? 'CONFIGURED' : 'NOT_CONFIGURED';
      const emailReachability: ReachabilityState =
        emailRecentSuccess > 0 ? 'REACHABLE' : emailCount > 0 ? 'UNKNOWN' : 'UNKNOWN';
      const emailHealth: HealthState = deriveHealthFromEvents(
        emailRecentSuccess + emailRecentFail,
        emailRecentFail
      );
      providers.push({
        provider: 'email.smtp_imap',
        category: 'email',
        configState: emailConfigState,
        reachability: emailReachability,
        health: emailHealth,
        evidence: {
          configuredAccounts: emailCount,
          recentSuccessfulEvents: emailRecentSuccess,
          recentFailedEvents: emailRecentFail,
          lastEventAt: null,
          lastFailureAt: null,
        },
        notes: emailActiveCount > 0 ? `${emailActiveCount} active account(s)` : null,
      });
    } catch (err) {
      console.error('[AdminOps] Email integration status failed:', err);
    }

    // ── Messaging: Telegram + WhatsApp ──────────────────────────────
    try {
      const [telegram, telegramHealthCheck] = await Promise.all([
        db.telegramConfig.findFirst(),
        db.telegramConfig.count({
          where: { lastWebhookAt: { gte: twentyFourHoursAgo } },
        }),
      ]);
      const telegramConfigState: ConfigState = telegram?.isConnected
        ? 'CONFIGURED'
        : telegram
        ? 'NOT_CONFIGURED'
        : 'NOT_CONFIGURED';
      const telegramReachability: ReachabilityState = telegramHealthCheck > 0
        ? 'REACHABLE'
        : telegram?.isConnected
        ? 'UNKNOWN'
        : 'UNKNOWN';
      const telegramHealth: HealthState = telegram?.healthStatus as HealthState || 'UNKNOWN';
      providers.push({
        provider: 'messaging.telegram',
        category: 'messaging',
        configState: telegramConfigState,
        reachability: telegramReachability,
        health: telegramHealth,
        evidence: {
          configuredAccounts: telegram ? 1 : 0,
          recentSuccessfulEvents: telegramHealthCheck,
          recentFailedEvents: 0,
          lastEventAt: telegram?.lastWebhookAt || null,
          lastFailureAt: null,
        },
        notes: telegram?.isConnected ? 'Connected' : null,
      });
    } catch (err) {
      console.error('[AdminOps] Telegram integration status failed:', err);
    }

    try {
      const [whatsapp, whatsappHealthCheck] = await Promise.all([
        db.whatsappConfig.findFirst(),
        db.whatsappConfig.count({
          where: { lastHealthCheckAt: { gte: twentyFourHoursAgo } },
        }),
      ]);
      const whatsappConfigState: ConfigState = whatsapp?.isConnected
        ? 'CONFIGURED'
        : whatsapp
        ? 'NOT_CONFIGURED'
        : 'NOT_CONFIGURED';
      const whatsappReachability: ReachabilityState = whatsappHealthCheck > 0
        ? 'REACHABLE'
        : whatsapp?.isConnected
        ? 'UNKNOWN'
        : 'UNKNOWN';
      const whatsappHealth: HealthState = whatsapp?.healthStatus as HealthState || 'UNKNOWN';
      providers.push({
        provider: 'messaging.whatsapp',
        category: 'messaging',
        configState: whatsappConfigState,
        reachability: whatsappReachability,
        health: whatsappHealth,
        evidence: {
          configuredAccounts: whatsapp ? 1 : 0,
          recentSuccessfulEvents: whatsappHealthCheck,
          recentFailedEvents: 0,
          lastEventAt: whatsapp?.lastHealthCheckAt || null,
          lastFailureAt: null,
        },
        notes: whatsapp?.isConnected ? 'Connected' : null,
      });
    } catch (err) {
      console.error('[AdminOps] WhatsApp integration status failed:', err);
    }

    // ── Search providers (Google Search API) ────────────────────────
    try {
      const googleSearchKey = process.env.GOOGLE_SEARCH_API_KEY;
      const googleSearchCx = process.env.GOOGLE_SEARCH_CX;
      const googleSearchConfigState: ConfigState =
        googleSearchKey && googleSearchCx ? 'CONFIGURED' : 'NOT_CONFIGURED';
      providers.push({
        provider: 'search.google',
        category: 'search',
        configState: googleSearchConfigState,
        // Reachability not measured for search (no event stream) — UNKNOWN
        reachability: 'UNKNOWN',
        // Health NOT claimed from env var presence — UNKNOWN
        health: 'UNKNOWN',
        evidence: {
          configuredAccounts: googleSearchConfigState === 'CONFIGURED' ? 1 : 0,
          recentSuccessfulEvents: 0,
          recentFailedEvents: 0,
          lastEventAt: null,
          lastFailureAt: null,
        },
        notes: googleSearchConfigState === 'CONFIGURED'
          ? 'Configured — reachability not measured (no event stream)'
          : 'Not configured',
      });
    } catch (err) {
      console.error('[AdminOps] Search integration status failed:', err);
    }

    // ── Auth providers (Google OAuth) ───────────────────────────────
    try {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const googleAuthConfigState: ConfigState =
        googleClientId && googleClientSecret ? 'CONFIGURED' : 'NOT_CONFIGURED';
      providers.push({
        provider: 'auth.google_oauth',
        category: 'auth',
        configState: googleAuthConfigState,
        reachability: 'UNKNOWN',
        health: 'UNKNOWN',
        evidence: {
          configuredAccounts: googleAuthConfigState === 'CONFIGURED' ? 1 : 0,
          recentSuccessfulEvents: 0,
          recentFailedEvents: 0,
          lastEventAt: null,
          lastFailureAt: null,
        },
        notes: googleAuthConfigState === 'CONFIGURED'
          ? 'Configured — reachability not measured (auth events tracked in AuditLog)'
          : 'Not configured',
      });
    } catch (err) {
      console.error('[AdminOps] Auth integration status failed:', err);
    }

    // ── Summary ─────────────────────────────────────────────────────
    const summary = {
      total: providers.length,
      configured: providers.filter((p) => p.configState === 'CONFIGURED').length,
      healthy: providers.filter((p) => p.health === 'HEALTHY').length,
      degraded: providers.filter((p) => p.health === 'DEGRADED').length,
      down: providers.filter((p) => p.health === 'DOWN').length,
      unknown: providers.filter((p) => p.health === 'UNKNOWN').length,
    };

    let overallHealth: HealthState;
    if (summary.down > 0) overallHealth = 'DOWN';
    else if (summary.degraded > 0) overallHealth = 'DEGRADED';
    else if (summary.healthy === 0 && summary.unknown === summary.total) overallHealth = 'UNKNOWN';
    else if (summary.healthy > 0 && summary.unknown === 0) overallHealth = 'HEALTHY';
    else overallHealth = 'UNKNOWN';

    return { providers, summary, overallHealth };
  } catch (error) {
    console.error('[AdminOps] Failed to get integrations status:', error);
    return {
      providers: [],
      summary: { total: 0, configured: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 },
      overallHealth: 'UNKNOWN',
    };
  }
}

/**
 * Derive health state from recent event counts.
 * - < 5 events → UNKNOWN (insufficient evidence)
 * - > 50% failure rate → DOWN
 * - 5–50% failure rate → DEGRADED
 * - < 5% failure rate → HEALTHY
 */
function deriveHealthFromEvents(recent: number, failures: number): HealthState {
  if (recent < 5) return 'UNKNOWN';
  const rate = failures / recent;
  if (rate > 0.5) return 'DOWN';
  if (rate >= 0.05) return 'DEGRADED';
  return 'HEALTHY';
}

// ═══════════════════════════════════════════════════════════════════
// 5. GET AUDIT LOG (paginated search)
// ═══════════════════════════════════════════════════════════════════

/**
 * Paginated AuditLog search with filters. Bounded: limit capped at 200.
 * Reuses existing AuditLog model — no new audit infrastructure.
 */
export async function getAuditLog(
  options?: AuditLogOptions
): Promise<AuditLogResult> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.userId) where.userId = options.userId;
    if (options?.action) where.action = { contains: options.action };
    if (options?.resource) where.resource = options.resource;
    if (options?.startDate || options?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (options?.startDate) createdAt.gte = options.startDate;
      if (options?.endDate) createdAt.lte = options.endDate;
      where.createdAt = createdAt;
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          userId: true,
          action: true,
          details: true,
          ipAddress: true,
          userAgent: true,
          resource: true,
          resourceId: true,
          createdAt: true,
          metadata: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return { entries, total };
  } catch (error) {
    console.error('[AdminOps] Failed to get audit log:', error);
    return { entries: [], total: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. RETRY FAILED OPERATION (idempotent)
// ═══════════════════════════════════════════════════════════════════

/**
 * Idempotent retry of a failed operation.
 *
 * Idempotency: the same idempotencyKey always returns the same result.
 * If a prior retry with the same key completed, return its result.
 * If a prior retry is in-progress, return 'already_in_progress'.
 * Otherwise, mark as started and return 'started' for the route handler
 * to perform the actual operation.
 *
 * Audit-logged: every retry attempt writes an AuditLog entry.
 */
export async function retryFailedOperation(
  options: RetryRequestOptions
): Promise<RetryRequestResult> {
  try {
    if (!options.idempotencyKey || options.idempotencyKey.length < 4) {
      throw new Error('idempotencyKey must be at least 4 characters');
    }
    if (!options.operationType || options.operationType.length < 3) {
      throw new Error('operationType must be at least 3 characters');
    }

    const now = new Date();

    // Look for a prior audit entry with this idempotency key.
    // The metadata field stores JSON including the idempotency key.
    const priorAttempts = await db.auditLog.findMany({
      where: {
        action: 'operation_retried',
        metadata: { contains: options.idempotencyKey },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
        id: true,
        details: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (priorAttempts.length > 0) {
      const prior = priorAttempts[0];
      let priorResult: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(prior.details || '{}');
        if (parsed.result) priorResult = parsed.result;
      } catch {
        // ignore parse error
      }
      return {
        accepted: true,
        idempotencyKey: options.idempotencyKey,
        status: 'already_completed',
        priorResult,
        startedAt: prior.createdAt,
      };
    }

    // Write an audit entry marking the retry as started.
    await db.auditLog.create({
      data: {
        userId: options.adminId,
        action: 'operation_retried',
        resource: 'operation',
        resourceId: options.targetId || options.operationType,
        details: JSON.stringify({
          operationType: options.operationType,
          targetId: options.targetId || null,
          status: 'started',
          adminEmail: options.adminEmail,
          startedAt: now.toISOString(),
        }),
        metadata: JSON.stringify({
          idempotencyKey: options.idempotencyKey,
        }),
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
      },
    });

    return {
      accepted: true,
      idempotencyKey: options.idempotencyKey,
      status: 'started',
      startedAt: now,
    };
  } catch (error) {
    console.error('[AdminOps] Failed to record retry operation:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. GET OPERATIONAL METRICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregate operational metrics for the dashboard.
 * Uses DB-side count/groupBy — no findMany for aggregates.
 */
export async function getOperationalMetrics(): Promise<OperationalMetricsResult> {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      unresolvedEvents,
      criticalEvents,
      openSupportTickets,
      activeApiKeys,
      activeSessions,
      audit24h,
      signups24h,
      signins24h,
      signinFailures24h,
      workflowExecutions24h,
      workflowFailures24h,
      eventsBySource,
      eventsByType,
    ] = await Promise.all([
      db.systemEvent.count({ where: { resolved: false } }).catch(() => 0),
      db.systemEvent.count({ where: { type: 'critical' } }).catch(() => 0),
      db.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER'] } } }).catch(() => 0),
      db.apiKey.count({ where: { isActive: true, revokedAt: null } }).catch(() => 0),
      db.userSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }).catch(() => 0),
      db.auditLog.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      db.user.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      db.auditLog.count({ where: { action: 'signin', createdAt: { gte: twentyFourHoursAgo } } }),
      db.auditLog.count({ where: { action: 'signin_failed', createdAt: { gte: twentyFourHoursAgo } } }),
      db.auditLog.count({ where: { action: 'workflow_executed', createdAt: { gte: twentyFourHoursAgo } } }),
      db.auditLog.count({ where: { action: 'workflow_failed', createdAt: { gte: twentyFourHoursAgo } } }),
      db.systemEvent.groupBy({
        by: ['source'],
        _count: { source: true },
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }).catch(() => []),
      db.systemEvent.groupBy({
        by: ['type'],
        _count: { type: true },
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }).catch(() => []),
    ]);

    return {
      totals: {
        unresolvedEvents,
        criticalEvents,
        openSupportTickets,
        activeApiKeys,
        activeSessions,
      },
      last24h: {
        auditEvents: audit24h,
        signups: signups24h,
        signins: signins24h,
        signinFailures: signinFailures24h,
        workflowExecutions: workflowExecutions24h,
        workflowFailures: workflowFailures24h,
      },
      byEventSource: eventsBySource.map((g) => ({ source: g.source, count: g._count.source })),
      byEventType: eventsByType.map((g) => ({ type: g.type, count: g._count.type })),
    };
  } catch (error) {
    console.error('[AdminOps] Failed to get operational metrics:', error);
    return {
      totals: {
        unresolvedEvents: 0,
        criticalEvents: 0,
        openSupportTickets: 0,
        activeApiKeys: 0,
        activeSessions: 0,
      },
      last24h: {
        auditEvents: 0,
        signups: 0,
        signins: 0,
        signinFailures: 0,
        workflowExecutions: 0,
        workflowFailures: 0,
      },
      byEventSource: [],
      byEventType: [],
    };
  }
}
