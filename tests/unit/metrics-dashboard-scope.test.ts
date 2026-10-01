// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: /api/metrics/dashboard role scoping
//
// Covers the 2026-09-29 Monitoring 403 fix:
//  - The endpoint is guarded by withAdmin (super_admin/owner/admin) —
//    member/viewer/unauthenticated remain blocked by the middleware.
//  - super_admin receives the full platform payload (unchanged):
//    cross-tenant aggregates, slow-query SQL text, traces.
//  - owner/admin receive account-scoped business metrics and NO
//    cross-user artifacts (recentSlowQueries SQL text, traces).
//  - No metrics are fabricated: every number comes from a real DB query.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared state for the withAdmin mock ────────────────────────────
const state = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));

vi.mock('@/lib/auth-middleware', () => ({
  withAdmin: vi.fn(async (_request: unknown, handler: (user: unknown) => Promise<unknown>) => {
    if (!state.user) {
      // mirror the real middleware: unauthenticated → 401
      return { __json: true, status: 401, body: { error: 'Authentication required' } };
    }
    return handler(state.user);
  }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lead: { count: vi.fn().mockResolvedValue(0) },
    deal: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { finalPrice: 0 } }) },
    user: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }) },
    creditsLedger: { aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }) },
    workflowExecution: { count: vi.fn().mockResolvedValue(0) },
  },
  dbMonitor: {
    getStats: vi.fn().mockReturnValue({ totalQueries: 10, slowQueries: 1, avgQueryTimeMs: 5 }),
    getQueryCountByOperation: vi.fn().mockReturnValue({ SELECT: 10 }),
    getRecentSlowQueries: vi.fn().mockReturnValue([
      { query: "SELECT * FROM Lead WHERE userId = 'other-user-id'", durationMs: 120, timestamp: 'now' },
    ]),
  },
  getConnectionPoolStats: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/observability/api-monitor', () => ({
  apiMonitor: {
    getSummary: vi.fn().mockReturnValue({
      totalRequests: 0, totalErrors: 0, errorRate: 0, requestsPerMinute: 0,
      avgResponseTimeMs: 0, statusCodeDistribution: {}, slowEndpoints: [],
    }),
    getAllEndpointStats: vi.fn().mockReturnValue([]),
    getRequestVolumeTimeline: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('@/lib/observability/alerts', () => ({
  alertEngine: {
    getActiveAlerts: vi.fn().mockReturnValue([]),
    getAlertHistory: vi.fn().mockReturnValue([]),
    getAlertSummary: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('@/lib/observability/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/observability/tracer', () => ({
  getRecentTraces: vi.fn().mockReturnValue([
    { traceId: 'tr-1', rootOperation: 'op', spanCount: 2, totalDurationMs: 10, status: 'ok' },
  ]),
}));

// Minimal NextResponse shim (route only uses NextResponse.json)
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      __json: true,
      status: init?.status ?? 200,
      body,
    }),
  },
}));

import { GET } from '@/app/api/metrics/dashboard/route';
import { db, dbMonitor } from '@/lib/db';

const dbAny = db as unknown as Record<string, {
  count: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
}>;
const dbMonitorAny = dbMonitor as unknown as { getRecentSlowQueries: ReturnType<typeof vi.fn> };

const PLATFORM_USER = { id: 'sa-1', role: 'super_admin' };
const OWNER_USER = { id: 'owner-1', role: 'owner' };

beforeEach(() => {
  vi.clearAllMocks();
  dbMonitorAny.getRecentSlowQueries.mockClear();
});

describe('/api/metrics/dashboard — role-scoped payload', () => {
  it('super_admin: platform-wide queries + SQL text + traces (unchanged behavior)', async () => {
    state.user = PLATFORM_USER;
    const res = (await GET({ url: 'http://x/api/metrics/dashboard' } as never)) as {
      body: { businessMetrics: Record<string, number>; traces: unknown[]; dbMetrics: { recentSlowQueries: unknown[] } };
    };

    expect(res.status).toBe(200);
    // lead/deal queries unscoped (no userId filter)
    const leadWhere = dbAny.lead.count.mock.calls[0][0].where;
    expect(leadWhere).not.toHaveProperty('userId');
    // platform artifacts present
    expect(dbMonitorAny.getRecentSlowQueries).toHaveBeenCalled();
    expect(res.body.dbMetrics.recentSlowQueries).toHaveLength(1);
    expect(res.body.traces).toHaveLength(1);
  });

  it('owner: business metrics scoped to own account, no SQL text, no traces', async () => {
    state.user = OWNER_USER;
    const res = (await GET({ url: 'http://x/api/metrics/dashboard' } as never)) as {
      body: { businessMetrics: Record<string, number>; traces: unknown[]; dbMetrics: { recentSlowQueries: unknown[] } };
    };

    expect(res.status).toBe(200);
    // lead/deal/credits queries scoped to the requesting user
    expect(dbAny.lead.count.mock.calls[0][0].where).toEqual({ userId: 'owner-1' });
    expect(dbAny.deal.count.mock.calls[0][0].where).toEqual({ userId: 'owner-1' });
    const creditsWhere = dbAny.creditsLedger.aggregate.mock.calls[0][0].where;
    expect(creditsWhere.userId).toBe('owner-1');
    // user-scoped activeUsers: only the requesting account
    expect(dbAny.user.count.mock.calls[0][0].where).toEqual({ id: 'owner-1', isActive: true, deletedAt: null });
    // cross-user artifacts stripped
    expect(dbMonitorAny.getRecentSlowQueries).not.toHaveBeenCalled();
    expect(res.body.dbMetrics.recentSlowQueries).toEqual([]);
    expect(res.body.traces).toEqual([]);
  });

  it('unauthenticated requests are delegated to withAdmin (401 path preserved)', async () => {
    state.user = null;
    const res = (await GET({ url: 'http://x/api/metrics/dashboard' } as never)) as { status: number };
    expect(res.status).toBe(401);
  });
});
