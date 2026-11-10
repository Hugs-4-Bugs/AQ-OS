// AcquisitionOS — Synthetic journey probes
// Non-destructive probes that exercise critical user journeys against the
// LIVE application without performing any write/delete/payment/invitation/
// lead-generation operation. Each probe calls ONLY GET endpoints that are
// safe and idempotent.
//
// PRIVACY: probes never read user/lead PII; they only verify that endpoints
// respond with a 2xx/4xx (not 5xx). Probe results contain only status codes
// + latencies, never response bodies.

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
};

const PROBES: Probe[] = [
  { label: 'home',           path: '/',                       requiresAuth: false, accept: [200, 307, 308] },
  { label: 'api_index',      path: '/api',                    requiresAuth: false, accept: [200] },
  { label: 'health_live',    path: '/api/health/live',        requiresAuth: false, accept: [200] },
  { label: 'health_basic',   path: '/api/health',             requiresAuth: false, accept: [200, 503] },
  { label: 'health_ready',   path: '/api/health/ready',       requiresAuth: false, accept: [200, 503] },
  { label: 'health_db',      path: '/api/health/database',    requiresAuth: false, accept: [200, 503] },
  { label: 'realtime',       path: '/api/realtime/status',    requiresAuth: false, accept: [200] },
  { label: 'auth_config',    path: '/api/auth/config',        requiresAuth: false, accept: [200] },
  { label: 'session_status', path: '/api/auth/session-status',requiresAuth: false, accept: [200] },
  { label: 'api_docs',       path: '/api-docs',               requiresAuth: false, accept: [200] },
  { label: 'auth_me',           path: '/api/auth/me',                 requiresAuth: true, accept: [200] },
  { label: 'subscriptions',     path: '/api/subscriptions/current',   requiresAuth: true, accept: [200] },
  { label: 'dashboard_summary', path: '/api/dashboard/executive-summary', requiresAuth: true, accept: [200] },
  { label: 'leads_list',        path: '/api/leads?take=1',            requiresAuth: true, accept: [200] },
  { label: 'notifications',     path: '/api/notifications?take=1',    requiresAuth: true, accept: [200] },
  { label: 'admin_overview',    path: '/api/admin/overview',          requiresAuth: true, accept: [200] },
  { label: 'ops_system_health', path: '/api/admin/operations/system-health', requiresAuth: true, accept: [200] },
];

async function runProbe(probe: Probe, ctx: ProbeContext): Promise<ProbeResult> {
  if (probe.requiresAuth && !ctx.bearerToken) {
    return { label: probe.label, ok: true, latencyMs: 0, statusCode: 0, skipped: true };
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
    const ok = probe.accept.includes(res.status);
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
