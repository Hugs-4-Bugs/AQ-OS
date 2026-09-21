# Monitoring and Alerting — AcquisitionOS

> Owner: Operations. Status: Living document. Last reviewed: 2026-09-09.
> Source: `src/lib/observability/*`, `deploy/prometheus/`, `deploy/grafana/`, `monitoring/`, `src/lib/observability/sentry.ts`, `dev.log`, `/api/health`.

## 1. What to Monitor (the metric catalog)

### Server / runtime
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Uptime | `/api/health` (liveness probe) | 99.5% | < 99% over 5 min |
| Request rate (req/s) | `api-logger.ts` | varies | Sudden drop > 50% (outage indicator) |
| Error rate (5xx %) | `api-logger.ts` + Sentry | < 1% | > 5% sustained 5 min |
| p50 latency | `api-logger.ts` | < 200 ms | (informational) |
| p95 latency | `api-logger.ts` | < 500 ms | > 2 s sustained 10 min |
| p99 latency | `api-logger.ts` | < 1.5 s | > 5 s sustained 10 min |
| Node.js event loop lag | OpenTelemetry | < 50 ms | > 100 ms |
| Node.js heap used | OpenTelemetry | < 70% of limit | > 90% |
| Node.js CPU | OpenTelemetry | < 70% | > 90% sustained 5 min |

### Database
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| DB connection count | Prisma + provider metrics | < 80% of max | > 90% |
| DB CPU | provider metrics (Supabase/Neon) | < 70% | > 90% sustained 5 min |
| DB storage | provider metrics | < 80% | > 90% |
| Slow queries (>1s) | Prisma query logs | < 1/min | > 10/min |
| Write contention (SQLite) | app logs (lock errors) | 0 | any |
| Replication lag (Postgres, when live) | provider metrics | < 1 s | > 5 s |

### Payments
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Stripe webhook success rate | Stripe Dashboard + `PaymentWebhook` table | > 99% | < 90% over 30 min |
| Stripe webhook delivery p95 | Stripe Dashboard | < 2 s | > 5 s |
| Failed payment rate | `Subscription.status='past_due'` + Stripe | < 5% of renewals | > 10% |
| Refund rate | `PaymentOrder` + `/api/admin/refund` | < 2% | > 5% |
| MRR | `Subscription` aggregate | grows | drop > 5% month-over-month |

### Email / outreach
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| SMTP send success rate | `email.ts` logs | > 95% | < 80% over 30 min |
| Bounce rate | `EmailBounce` table | < 5% | > 10% |
| Spam complaint rate | (Stripe / Resend / Gmail) | < 0.1% | > 0.5% |
| Unsubscribe rate | `EmailUnsubscribe` table | < 1% per send | > 3% per send |
| Reply rate (outbound) | `Communication` (direction=inbound following outbound) | > 5% | (informational) |

### AI
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| AI call success rate | `AiCostRecord` + provider logs | > 99% | < 90% over 30 min |
| AI cost per day | `AiCostRecord` aggregate | tracks budget | > 3× the 7-day average |
| AI cost per tenant | `AiCostRecord` group by user | < $X (budget per plan) | any tenant > 3× their revenue |
| AI tokens per call | `AiCostRecord` | within prompt-design budget | outlier (10× median) |

### API (public API + integrations)
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| API key rate-limit hits (429) | `ApiKeyUsage` table | < 5% of calls | > 20% (a user is hitting limits) |
| API key monthly quota hits (429 LEAD_LIMIT_EXCEEDED) | `ApiKeyUsage` table | < 1% of keys | (informational) |
| API error rate (per key) | `ApiKeyUsage` | < 5% | > 20% for a single key (integration broken) |

### Auth
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Auth failure rate | `audit-log` (action=signin, success=false) | < 10% | > 30% over 5 min (credential stuffing) |
| Account lockout rate | `User.otpLockedUntil` set | < 1% of users/day | spike (attack) |
| New-device alerts | `SecurityAlert` | varies | spike (possible attack) |
| MFA failure rate | `audit-log` (action=mfa_*) | < 5% | > 20% (someone phishing MFA) |

### Integrations
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Gmail OAuth token refresh failures | `gmail-oauth-service.ts` logs | 0 | any spike |
| Google Calendar API 401/403 | `google-oauth.ts` logs | 0 | any |
| Google CSE 429 (quota) | `discovery-engine.ts` logs | 0 | any |
| Telegram bot send failures | `telegram-service.ts` logs | < 1% | > 5% |
| WhatsApp (Twilio) send failures | `whatsapp-service.ts` logs | < 1% | > 5% |

### Background / cron
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Cron job success | each `/api/cron/*` returns 200 | 100% | any 5xx (the job is idempotent; safe to retry, but alert) |
| Cron job duration | `api-logger.ts` | < 30 s | > 60 s (long-running job) |
| Cron job ran on schedule | `audit-log` (action=cron_*) | per the schedule | missed tick (no log entry within 2× the interval) |

### User-facing
| Metric | Source | Target | Alert threshold |
|---|---|---|---|
| Signup rate | `User` creation | grows | drop > 50% day-over-day |
| Active users (DAU/MAU) | session activity | grows | drop > 20% week-over-week |
| Churn (cancelled subscriptions) | `Subscription.status=cancelled` | < 6% monthly | > 10% monthly
| NPS / feedback sentiment | `FeedbackReport` | improves | trend down
| Crash rate (client) | `CrashReport` | < 1% of sessions | > 5% of sessions

## 2. Alert Thresholds (the routing rules)

| Alert | Severity | Notify | Action |
|---|---|---|---|
| Uptime < 99% (5 min) | SEV-1 | Page on-call | Restart / investigate |
| Error rate > 5% (5 min) | SEV-1 | Page on-call | Investigate + rollback if needed |
| p95 latency > 2 s (10 min) | SEV-2 | Email on-call | Investigate |
| DB connection > 90% | SEV-1 | Page on-call | Restart / scale DB |
| DB CPU > 90% (5 min) | SEV-2 | Page on-call | Investigate slow queries |
| Stripe webhook < 90% success (30 min) | SEV-1 | Page on-call + founder | Check `STRIPE_WEBHOOK_SECRET`; check the DB transaction |
| SMTP success < 80% (30 min) | SEV-2 | Email on-call | Check SMTP creds / Gmail quota / Resend |
| Bounce rate > 10% | SEV-2 | Email on-call | Pause sending; investigate sender reputation |
| Spam complaint > 0.5% | SEV-1 | Page on-call | **Pause all outreach immediately**; investigate |
| AI cost > 3× 7-day avg | SEV-2 | Email founder | Find the abuser; cap or suspend |
| Auth failure > 30% (5 min) | SEV-2 | Email on-call | Likely credential stuffing; consider per-account lockout |
| Cron 5xx | SEV-3 | Email on-call | Investigate; the job is idempotent |
| Cron missed tick | SEV-3 | Email on-call | Check the scheduler / the app's availability |
| Sentry new `fatal` issue | SEV-2 | Email on-call | Investigate |
| Client crash rate > 5% | SEV-2 | Email on-call | Investigate; likely a frontend regression |

## 3. What to Do When an Alert Fires

For every alert, follow the [INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md) playbook (acknowledge → contain → assess → communicate → eradicate → recover → post-mortem). Severity mapping is in that document.

## 4. Tools

### APM / error tracking
- **Sentry** (`src/lib/observability/sentry.ts`) — errors + performance transactions; the DSN is in `.env`. Configure alert rules in the Sentry dashboard.
- **OpenTelemetry** (`src/lib/observability/tracing.ts`, `monitoring/opentelemetry/`) — traces exported to an OTLP collector (config in `otel-collector-config.yml`).

### Metrics
- **Prometheus** (`deploy/prometheus/prometheus.yml`, `monitoring/prometheus/prometheus.yml`) — scrapes the app's metrics endpoint; alert rules in `deploy/prometheus/alerts.yml`, `monitoring/prometheus/alerts.yml`.
- **Grafana** (`deploy/grafana/`, `monitoring/grafana/`) — dashboards (`acquisitionos-overview.json`, `app-overview.json`, `infrastructure.json`); provisioned via `monitoring/grafana/provisioning/`.
- **`src/lib/observability/metrics-collector.ts`** + **`metrics.ts`** — the in-app Prometheus exporter.

### Logs
- **`dev.log`** — the structured log file (request log via `api-logger.ts`).
- **`src/lib/observability/logger.ts`** — the structured logger (used by the app).
- **`src/lib/observability/request-logger.ts`** — per-request log.

### Health
- **`/api/health`** — liveness probe (`{ status: 'healthy' }`).
- **`/api/auth/config`** — auth-config health (`{ googleAvailable, emailConfigured }`).

### User reports
- **`/api/feedback`** + **`/api/feedback/crash`** — user-submitted feedback + auto-captured client crashes.
- **`src/lib/feedback/crash-reporter.ts`** — auto-captures client crashes.
- **`src/lib/feedback/ai-triage.ts`** — AI triage of crash reports.

### Status page
- (Publish one when live — e.g. statuspage.io, Better Uptime, or a self-hosted Cachet.)

## 5. Dashboard Layout (recommended)

The Grafana dashboard `acquisitionos-overview.json` should show:
1. **Top row:** uptime, error rate, p95, MRR.
2. **Second row:** request rate (by status), DB connections, DB CPU, AI cost/day.
3. **Third row:** Stripe webhook success, SMTP success, bounce rate, spam complaint rate.
4. **Fourth row:** signup rate, active users, churn, client crash rate.
5. **Fifth row:** per-tenant AI cost (top 10), per-tenant lead count (top 10).

## 6. Review Cadence

- **Daily** (on-call): glance at the dashboard; check Sentry; check Stripe Dashboard for failed webhooks.
- **Weekly** (engineering review): error rate trend, p95 trend, AI cost trend, top crashes.
- **Monthly** (operations review): alert accuracy (any false positives? missed incidents?), threshold tuning, dashboard usefulness.
- **Quarterly**: review this document + the alert rules + the dashboard layout.

---

*See also: [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md), [ON-CALL-RUNBOOK.md](ON-CALL-RUNBOOK.md), [../security/INCIDENT-RESPONSE-PLAN.md](../security/INCIDENT-RESPONSE-PLAN.md), [PERFORMANCE-BENCHMARKS.md](../technical/PERFORMANCE-BENCHMARKS.md).*
