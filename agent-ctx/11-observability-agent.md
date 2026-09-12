# Phase 11 — Observability Agent Work Record

## Task ID: 11
## Agent: Observability Agent

## Summary
Wired full observability stack into AcquisitionOS: Sentry initialization at startup, API request logging/metrics middleware on 10 critical routes, Grafana dashboard, Prometheus alerting rules, and Docker monitoring stack.

## Files Created
1. `src/app/instrumentation.ts` — Sentry init + startup logging (Next.js register())
2. `src/lib/observability/api-logger.ts` — `withApiLogging()` middleware wrapper
3. `monitoring/grafana-dashboard.json` — Grafana dashboard with 20+ business panels
4. `monitoring/prometheus-alerts.yml` — Business-specific Prometheus alert rules
5. `monitoring/prometheus.yml` — Prometheus scrape config (app + node exporter + OTel)
6. `monitoring/docker-compose.monitoring.yml` — Updated monitoring stack

## Files Modified (10 API routes)
1. `src/app/api/auth/signin/route.ts` — Wrapped POST with `withApiLogging(..., 'auth/signin')`
2. `src/app/api/auth/signup/route.ts` — Wrapped POST with `withApiLogging(..., 'auth/signup')`
3. `src/app/api/auth/otp/request/route.ts` — Wrapped POST with `withApiLogging(..., 'auth/otp/request')`
4. `src/app/api/auth/magic-link/request/route.ts` — Wrapped POST with `withApiLogging(..., 'auth/magic-link/request')`
5. `src/app/api/leads/discover/route.ts` — Wrapped POST with `withApiLogging(..., 'leads/discover')`
6. `src/app/api/payments/create-order/route.ts` — Wrapped POST with `withApiLogging(..., 'payments/create-order')`
7. `src/app/api/payments/webhook/stripe/route.ts` — Wrapped POST with `withApiLogging(..., 'payments/webhook/stripe')`
8. `src/app/api/payments/webhook/razorpay/route.ts` — Wrapped POST with `withApiLogging(..., 'payments/webhook/razorpay')`
9. `src/app/api/gmail/send/route.ts` — Wrapped POST with `withApiLogging(..., 'gmail/send')`
10. `src/app/api/calendar/events/route.ts` — Wrapped both GET and POST with `withApiLogging(..., 'calendar/events')`

## Key Design Decisions
- `withApiLogging` is a pure wrapper — zero changes to internal route logic
- Supports both NextRequest and Request types (webhooks use Request)
- Uses metrics-collector.ts metric names (api_requests_total, api_request_duration_seconds)
- Sentry capture is no-op if DSN not configured
- Grafana dashboard uses actual metric names from metrics-collector.ts
- Prometheus alerts reference actual metric names and realistic thresholds
- Docker compose uses `host.docker.internal` to scrape app on host machine
