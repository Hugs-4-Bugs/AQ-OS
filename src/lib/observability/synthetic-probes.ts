// AcquisitionOS — Synthetic journey probes (rewritten P0 fix)
//
// Fixes:
//   - Readiness/database probes previously accepted HTTP 503 as success
//     → Now only 200 is healthy; 503 is unhealthy
//   - Skipped authenticated probes returned ok:true (silently hiding
//     missing credentials as success) → Now returns ok:false with a
//     clear "credentials missing" error so monitoring surfaces it
//   - Expanded critical journey coverage
//
// PRIVACY: probes never read user/lead PII; they only verify endpoints
// respond with expected status codes. Probe results contain only status
// codes + latencies, never response bodies.

import type { NextRequest } from 'next/server';

export interface ProbeResult {
  label: string;
  ok: boolean;
  latencyMs: number;
  statusCode: number;
  skipped?: boolean;
  error?: string;
}

export interface ProbeContext {
  baseUrl: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
}

type Probe = {
  label: string;
  path: string;
  requiresAuth: boolean;
  accept: number[];
  // If true, a 401/403 is acceptable (means auth is working, just
  // rejecting the probe's token). Used for admin probes where we
  // verify the endpoint exists + auth gates it, without needing
  // super_admin credentials.
  authGateAccept?: boolean;
};

const PROBES: Probe[] = [
  // ── Public health probes (only 200 is healthy) ──────────────
  { label: 'home',           path: '/',                       requiresAuth: false, accept: [200, 307, 308] },
  { label: 'api_index',      path: '/api',                    requiresAuth: false, accept: [200] },
  { label: 'health_live',    path: '/api/health/live',        requiresAuth: false, accept: [200] },
  // FIXED: health_ready and health_db previously accepted 503 — now only 200 is healthy
  { label: 'health_basic',   path: '/api/health',             requiresAuth: false, accept: [200] },
  { label: 'health_ready',   path: '/api/health/ready',       requiresAuth: false, accept: [200] },
  { label: 'health_db',      path: '/api/health/database',    requiresAuth: false, accept: [200] },
  { label: 'realtime',       path: '/api/realtime/status',    requiresAuth: false, accept: [200] },
  { label: 'auth_config',    path: '/api/auth/config',        requiresAuth: false, accept: [200] },
  { label: 'session_status', path: '/api/auth/session-status',requiresAuth: false, accept: [200] },
  { label: 'api_docs',       path: '/api-docs',               requiresAuth: false, accept: [200] },

  // ── Authenticated user journey probes ───────────────────────
  // These require SYNTHETIC_PROBE_TOKEN. If the token is missing,
  // the probe returns ok:false with "credentials missing" (NOT ok:true).
  { label: 'auth_me',           path: '/api/auth/me',                 requiresAuth: true, accept: [200] },
  { label: 'subscriptions',     path: '/api/subscriptions/current',   requiresAuth: true, accept: [200] },
  { label: 'dashboard_summary', path: '/api/dashboard/executive-summary', requiresAuth: true, accept: [200] },
  { label: 'leads_list',        path: '/api/leads?take=1',            requiresAuth: true, accept: [200] },
  { label: 'notifications',     path: '/api/notifications?take=1',    requiresAuth: true, accept: [200] },
  { label: 'credits_balance',   path: '/api/credits',                 requiresAuth: true, accept: [200] },
  { label: 'pipeline_view',     path: '/api/pipeline',                requiresAuth: true, accept: [200] },
  { label: 'insights',          path: '/api/insights',                requiresAuth: true, accept: [200] },
  { label: 'meetings_list',     path: '/api/meetings',                requiresAuth: true, accept: [200] },

  // ── Admin probes (auth-gated — verify endpoint exists + auth works) ─
  // These accept 200 (if token is super_admin) OR 401/403 (if token is
  // a regular user — proves the auth gate is working). Either way the
  // endpoint is reachable and auth is enforced.
  { label: 'admin_overview',    path: '/api/admin/overview',          requiresAuth: true, accept: [200], authGateAccept: true },
  { label: 'ops_system_health', path: '/api/admin/operations/system-health', requiresAuth: true, accept: [200], authGateAccept: true },
];

async function runProbe(probe: Probe, ctx: ProbeContext): Promise<ProbeResult> {
  // FIXED: missing credentials is now a FAILURE (ok:false), not a silent skip (ok:true)
  if (probe.requiresAuth && !ctx.bearerToken) {
    return {
      label: probe.label,
      ok: false,
      latencyMs: 0,
      statusCode: 0,
      error: 'SYNTHETIC_PROBE_TOKEN not configured — cannot run authenticated probe',
    };
  }

  const fetchImpl = ctx.fetchImpl || fetch;
  const url = `${ctx.baseUrl}${probe.path}`;
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (probe.requiresAuth && ctx.bearerToken) {
      headers.Authorization = `Bearer ${ctx.bearerToken}`;
    }
    const res = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    const latencyMs = Math.round(performance.now() - start);

    // Check if the status is in the accept list
    const ok = probe.accept.includes(res.status);

    // For auth-gated probes, 401/403 is acceptable (proves auth is working)
    if (!ok && probe.authGateAccept && (res.status === 401 || res.status === 403)) {
      return {
        label: probe.label,
        ok: true,
        latencyMs,
        statusCode: res.status,
        // Note: this is an auth-gate check, not a full functionality check
        error: undefined,
      };
    }

    return {
      label: probe.label,
      ok,
      latencyMs,
      statusCode: res.status,
      ...(ok ? {} : { error: `expected ${probe.accept.join('|')}, got ${res.status}` }),
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      label: probe.label,
      ok: false,
      latencyMs,
      statusCode: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAllProbes(ctx: ProbeContext): Promise<{
  results: ProbeResult[];
  totalOk: number;
  totalFailed: number;
  totalSkipped: number;
  totalLatencyMs: number;
}> {
  const results = await Promise.all(PROBES.map((p) => runProbe(p, ctx)));
  const totalOk = results.filter((r) => r.ok && !r.skipped).length;
  const totalFailed = results.filter((r) => !r.ok).length;
  const totalSkipped = results.filter((r) => r.skipped).length;
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  return { results, totalOk, totalFailed, totalSkipped, totalLatencyMs };
}

export function deriveContextFromRequest(request: NextRequest): ProbeContext {
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const bearerToken = process.env.SYNTHETIC_PROBE_TOKEN || undefined;
  return { baseUrl, bearerToken };
}

export { PROBES };
