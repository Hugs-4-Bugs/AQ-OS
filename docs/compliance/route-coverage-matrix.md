# AcquisitionOS — Route Coverage Matrix

**Generated:** 2026-11-10
**Source:** `src/app/api/**/route.ts` + `src/app/**/page.tsx`
**Recount:** 52 frontend pages, 592 API route handlers

## Monitoring coverage by route category

| Route category | Auth | Synthetic probe | Metrics | Alert rules | Trace coverage |
|---|---|---|---|---|---|
| Public health (`/api/health/*`) | public | ✅ health_live, health_basic, health_ready, health_db | ✅ scrape endpoint | ✅ AppDown, MonitoringStale | ✅ filter/health drops spans |
| Public auth (`/api/auth/signin`, etc.) | public/cron | ✅ auth_config, session_status | ✅ api_requests_total | ✅ AuthEndpointFailures | ✅ auto-instrumentation |
| Authenticated user (`/api/leads`, `/api/dashboard/*`, etc.) | user | ✅ auth_me, dashboard_summary, leads_list, notifications, credits, pipeline, insights, meetings | ✅ api_requests_total, api_request_duration_seconds | ✅ HighErrorRate, HighLatencyP95, CriticalLatencyP99 | ✅ auto-instrumentation |
| Admin (`/api/admin/*`) | super_admin + MFA | ✅ admin_overview, ops_system_health (auth-gate) | ✅ api_requests_total | ✅ AppDown (via scrape) | ✅ auto-instrumentation |
| Cron (`/api/cron/*`) | cron Bearer | ❌ no probe (side-effecting) | ✅ covered by app-wide scrape | ✅ MonitoringStale | ✅ auto-instrumentation |
| Webhooks (`/api/payments/webhook/*`, etc.) | signature | ❌ no probe (inbound) | ✅ covered by app-wide scrape | ✅ HighErrorRate | ✅ auto-instrumentation |
| Ops alerting (`/api/ops/alerts/webhook`) | Bearer token | ❌ no probe (inbound) | ✅ covered by app-wide scrape | ✅ MonitoringStale | ✅ auto-instrumentation |
| Metrics (`/api/metrics`, `/api/metrics/scrape`) | super_admin/bearer | ✅ (the scrape endpoint IS the probe target) | — | ✅ MonitoringStale | ✅ filter/health drops spans |

## Synthetic probe inventory

| # | Label | Path | Auth | Accept | Notes |
|---|---|---|---|---|---|
| 1 | home | `/` | no | 200, 307, 308 | SPA entry |
| 2 | api_index | `/api` | no | 200 | API catalog |
| 3 | health_live | `/api/health/live` | no | 200 | Liveness |
| 4 | health_basic | `/api/health` | no | 200 | Overall health (503 = unhealthy) |
| 5 | health_ready | `/api/health/ready` | no | 200 | Readiness (503 = unhealthy) |
| 6 | health_db | `/api/health/database` | no | 200 | DB health (503 = unhealthy) |
| 7 | realtime | `/api/realtime/status` | no | 200 | Realtime infra |
| 8 | auth_config | `/api/auth/config` | no | 200 | Auth provider config |
| 9 | session_status | `/api/auth/session-status` | no | 200 | Session validity |
| 10 | api_docs | `/api-docs` | no | 200 | API documentation |
| 11 | auth_me | `/api/auth/me` | yes | 200 | Current user profile |
| 12 | subscriptions | `/api/subscriptions/current` | yes | 200 | Current subscription |
| 13 | dashboard_summary | `/api/dashboard/executive-summary` | yes | 200 | Dashboard KPIs |
| 14 | leads_list | `/api/leads?take=1` | yes | 200 | Lead list (minimal) |
| 15 | notifications | `/api/notifications?take=1` | yes | 200 | Notifications (minimal) |
| 16 | credits_balance | `/api/credits` | yes | 200 | Credit balance |
| 17 | pipeline_view | `/api/pipeline` | yes | 200 | Pipeline view |
| 18 | insights | `/api/insights` | yes | 200 | Insights |
| 19 | meetings_list | `/api/meetings` | yes | 200 | Meetings list |
| 20 | admin_overview | `/api/admin/overview` | yes | 200 (or 401/403) | Admin — auth-gate check |
| 21 | ops_system_health | `/api/admin/operations/system-health` | yes | 200 (or 401/403) | Ops health — auth-gate check |

## Probe safety guarantees

- **No write operations**: all probes are GET-only
- **No destructive actions**: no DELETE, no payments, no invitations, no lead generation
- **Minimal data**: `?take=1` on list endpoints to minimize DB load
- **Dedicated test identities**: authenticated probes use `SYNTHETIC_PROBE_TOKEN` (a dedicated test token, never a real user's session)
- **Auth-gate check**: admin probes accept 401/403 as healthy (proves the endpoint exists + auth is enforced) without needing super_admin credentials
- **Missing credentials visible**: if `SYNTHETIC_PROBE_TOKEN` is not set, authenticated probes return `ok: false` with "SYNTHETIC_PROBE_TOKEN not configured" — this surfaces as a monitoring configuration failure, NOT a silent skip

## Route count reconciliation

| Source | Count | Notes |
|---|---|---|
| Previous report | 51 pages, 584 API routes | From earlier discovery |
| Current recount | 52 pages, 592 API routes | The implementation added new routes (health/live, health/ready, health/synthetic, metrics/scrape, ops/alerts/webhook, admin/operations/alert-test, alert-audit, alert-ack, dashboard/privacy) |

The discrepancy (1 page, 8 routes) is explained by the new routes added in the implementation commit `a8e4e5d60`.

## Monitoring instrumentation

All API routes are instrumented via:
- `src/lib/observability/api-monitor.ts` — records `api_requests_total` + `api_request_duration_seconds` for every request
- `src/lib/observability/api-logger.ts` — structured logging with `method`, `route` (sanitized template), `statusCode`, `durationMs`, `userId`, `traceId`
- `src/lib/observability/middleware.ts` — `withMonitoring()` wrapper adds `X-Trace-Id` + `X-Response-Time` headers

Labels are low-cardinality: `method`, `route` (template, not path params), `status`, `statusGroup`. No user IDs, emails, tenant IDs, or prompts in labels.
