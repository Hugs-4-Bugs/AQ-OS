// AcquisitionOS — Synthetic probes tests
// Verifies that 503 is treated as unhealthy and missing credentials
// is surfaced as a failure.

import { describe, it, expect, vi } from 'vitest';
import { PROBES, runAllProbes, type ProbeContext } from '@/lib/observability/synthetic-probes';

// Mock fetch for deterministic testing
function mockFetch(statusMap: Record<string, number>): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const path = new URL(urlStr).pathname + new URL(urlStr).search;
    const status = statusMap[path] ?? 404;
    return new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('Synthetic Probes — 503 is unhealthy', () => {
  it('health_ready returns 503 → probe fails (NOT ok)', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch({
        '/api/health/ready': 503,
        '/api/health/live': 200,
        '/api/health': 503,
        '/api/health/database': 503,
      }),
    };
    const { results } = await runAllProbes(ctx);
    const readyProbe = results.find((r) => r.label === 'health_ready');
    expect(readyProbe).toBeDefined();
    expect(readyProbe!.ok).toBe(false);
    expect(readyProbe!.statusCode).toBe(503);
    expect(readyProbe!.error).toContain('expected 200');
  });

  it('health_basic returns 503 → probe fails', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch({ '/api/health': 503 }),
    };
    const { results } = await runAllProbes(ctx);
    const basicProbe = results.find((r) => r.label === 'health_basic');
    expect(basicProbe!.ok).toBe(false);
    expect(basicProbe!.statusCode).toBe(503);
  });

  it('health_db returns 503 → probe fails', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch({ '/api/health/database': 503 }),
    };
    const { results } = await runAllProbes(ctx);
    const dbProbe = results.find((r) => r.label === 'health_db');
    expect(dbProbe!.ok).toBe(false);
    expect(dbProbe!.statusCode).toBe(503);
  });

  it('health_ready returns 200 → probe succeeds', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      fetchImpl: mockFetch({ '/api/health/ready': 200 }),
    };
    const { results } = await runAllProbes(ctx);
    const readyProbe = results.find((r) => r.label === 'health_ready');
    expect(readyProbe!.ok).toBe(true);
    expect(readyProbe!.statusCode).toBe(200);
  });
});

describe('Synthetic Probes — missing credentials surfaced as failure', () => {
  it('authenticated probe with no token returns ok:false (NOT ok:true)', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      bearerToken: undefined, // no token
      fetchImpl: mockFetch({}),
    };
    const { results } = await runAllProbes(ctx);
    const authMe = results.find((r) => r.label === 'auth_me');
    expect(authMe).toBeDefined();
    // Must NOT be ok:true (the old behavior silently skipped)
    expect(authMe!.ok).toBe(false);
    expect(authMe!.error).toContain('SYNTHETIC_PROBE_TOKEN');
  });

  it('missing credentials increases totalFailed count', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      bearerToken: undefined,
      fetchImpl: mockFetch({}),
    };
    const { totalFailed } = await runAllProbes(ctx);
    // All authenticated probes should be in the failed count
    expect(totalFailed).toBeGreaterThan(0);
  });
});

describe('Synthetic Probes — admin auth-gate accepts 401/403', () => {
  it('admin_overview returns 401 → probe succeeds (auth gate works)', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      bearerToken: 'test-token',
      fetchImpl: mockFetch({ '/api/admin/overview': 401 }),
    };
    const { results } = await runAllProbes(ctx);
    const adminProbe = results.find((r) => r.label === 'admin_overview');
    expect(adminProbe!.ok).toBe(true);
    expect(adminProbe!.statusCode).toBe(401);
  });

  it('admin_overview returns 403 → probe succeeds (auth gate works)', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      bearerToken: 'test-token',
      fetchImpl: mockFetch({ '/api/admin/overview': 403 }),
    };
    const { results } = await runAllProbes(ctx);
    const adminProbe = results.find((r) => r.label === 'admin_overview');
    expect(adminProbe!.ok).toBe(true);
    expect(adminProbe!.statusCode).toBe(403);
  });

  it('admin_overview returns 500 → probe fails (server error)', async () => {
    const ctx: ProbeContext = {
      baseUrl: 'http://localhost:3000',
      bearerToken: 'test-token',
      fetchImpl: mockFetch({ '/api/admin/overview': 500 }),
    };
    const { results } = await runAllProbes(ctx);
    const adminProbe = results.find((r) => r.label === 'admin_overview');
    expect(adminProbe!.ok).toBe(false);
    expect(adminProbe!.statusCode).toBe(500);
  });
});

describe('Synthetic Probes — probe inventory', () => {
  it('has at least 20 probes covering critical journeys', () => {
    expect(PROBES.length).toBeGreaterThanOrEqual(20);
  });

  it('all probes are GET-only (no write operations)', () => {
    // The probe definition doesn't include a method field because all
    // probes are GET by design. This test verifies the PROBES array
    // doesn't accidentally include POST/DELETE paths.
    for (const probe of PROBES) {
      // All paths should be safe GET endpoints
      expect(probe.path).not.toMatch(/\/delete|\/remove|\/purge|\/cancel/i);
    }
  });

  it('no probe uses destructive paths', () => {
    const destructive = ['delete', 'remove', 'purge', 'cancel', 'refund', 'charge', 'send', 'create', 'update', 'import', 'merge'];
    for (const probe of PROBES) {
      for (const d of destructive) {
        expect(probe.path.toLowerCase()).not.toContain(`/${d}`);
      }
    }
  });
});
