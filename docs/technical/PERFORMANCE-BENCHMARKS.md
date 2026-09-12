# Performance Benchmarks — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `src/lib/observability/*`, `src/lib/performance/*`, `dev.log`, `scripts/visual-qa.mjs`. Targets are *expected*; measured values are from the current single-instance SQLite deployment.

## 1. Target Response Times

| Operation | Target p50 | Target p95 | Target p99 | Notes |
|---|---|---|---|---|
| `GET /` (landing/auth) | < 100 ms | < 300 ms | < 800 ms | Client-rendered; minimal SSR |
| `GET /api/auth/me` | < 50 ms | < 150 ms | < 400 ms | JWT verify + 1 DB read |
| `GET /api/leads` (page of 20) | < 200 ms | < 500 ms | < 1.2 s | Indexed on userId + createdAt |
| `GET /api/leads/[id]` | < 100 ms | < 300 ms | < 800 ms | PK lookup + relations |
| `POST /api/leads` (manual create) | < 150 ms | < 400 ms | < 1 s | Validation + 1 insert |
| `POST /api/discovery/start` (20 leads) | < 30 s | < 60 s | < 120 s | Google CSE + 20 scrapes + 20 scores; **background job candidate** (ADR-011) |
| `POST /api/leads/[id]/outreach` (generate) | < 5 s | < 12 s | < 25 s | AI call; provider-dependent |
| `POST /api/leads/[id]/communications` (send) | < 4 s | < 10 s | < 20 s | SMTP send (3 retries possible) |
| `POST /api/meetings/check-availability` | < 1.5 s | < 4 s | < 8 s | Google freeBusy API |
| `POST /api/meetings` (create + Meet link) | < 3 s | < 8 s | < 15 s | Google Calendar events.insert |
| `POST /api/ai/chat/stream` (first token) | < 1.5 s | < 4 s | < 8 s | SSE; provider-dependent |
| `GET /api/notifications` | < 100 ms | < 250 ms | < 600 ms | Indexed on userId + read |
| `POST /api/payments/webhook/stripe` | < 800 ms | < 2 s | < 5 s | DB transaction; Stripe retries on 5xx |
| `GET /api/admin/billing` | < 500 ms | < 1.5 s | < 4 s | Aggregation across users |

## 2. Database Performance Targets

| Query | Target | Current (SQLite, single user) | Risk at scale |
|---|---|---|---|
| User by email (login) | < 10 ms | < 5 ms | Unique index; safe |
| Lead list by userId (paginated) | < 50 ms | < 20 ms | Indexed; safe to ~10k leads/user |
| Lead list + relations (activities, comms, notes) | < 200 ms | < 100 ms | N+1 risk — verify eager loading |
| LeadActivity timeline (latest 50) | < 100 ms | < 50 ms | Indexed on leadId + createdAt |
| Credits balance read | < 10 ms | < 5 ms | Last-row read; safe |
| Credits deduct (transaction) | < 50 ms | < 20 ms | Row lock; safe at current volume |
| Analytics aggregation (monthly) | < 1 s | < 300 ms | Full-table scan; **risk at 10k+ users** |
| AuditLog search | < 500 ms | < 200 ms | Indexed on userId + action + createdAt |
| Notification poll (unread) | < 100 ms | < 40 ms | Indexed on userId + read; polled every 30s |

### Known DB Bottlenecks
1. **SQLite write lock** — any write locks the whole DB. At ~50 concurrent writers, contention appears; at ~500, it's severe. **Mitigation:** PostgreSQL migration (ADR-012).
2. **Analytics aggregations** — several `/api/dashboard/*` and `/api/analytics/*` endpoints compute counts/sums over large tables. **Mitigation:** pre-materialise into `AnalyticsSnapshot` (already exists; not yet wired to all queries).
3. **N+1 queries** — `db.lead.findMany` with `include: { activities, communications, notes, deals }` can produce N+1 if Prisma's eager loading isn't used. **Mitigation:** audit hot paths; the lead-detail-panel uses eager includes.
4. **JSON-field parsing** — `techStack`, `metadata`, `attendees` stored as String; parsed on read. **Mitigation:** Prisma `Json` type on PostgreSQL.

## 3. External-API Latency (Not Under Our Control)

| Service | Typical p50 | Typical p95 | Notes |
|---|---|---|---|
| Google Custom Search | 400 ms | 1.2 s | Billed $5/1k queries |
| Google Calendar freeBusy | 600 ms | 2 s | |
| Google Calendar events.insert (+ Meet) | 1.5 s | 4 s | conferenceData adds latency |
| Gmail API messages.send | 800 ms | 2 s | |
| Gmail API messages.get | 300 ms | 800 ms | |
| SMTP (Gmail) send | 1.5 s | 5 s | 3 retries on transient |
| Stripe checkout.session.create | 400 ms | 1 s | |
| Stripe webhook verification | 50 ms | 150 ms | |
| Z-AI chat (per call) | 2 s | 8 s | Streaming reduces first-token latency |
| Z-AI embeddings | 400 ms | 1.5 s | |
| Razorpay order create | 500 ms | 1.5 s | |
| Twilio WhatsApp send | 600 ms | 2 s | |
| Telegram bot send | 300 ms | 1 s | |

**Implication:** any operation that chains 2+ external calls (discovery + scrape + score; meeting create + email confirmations) will blow past a 10-second HTTP budget. **Mitigation:** background job queue (ADR-011) for discovery; the meeting-create path accepts the latency because it's user-initiated + the modal shows a spinner.

## 4. Frontend Performance Targets

| Metric | Target | Current | Notes |
|---|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | ~1.8 s | Landing page; client-rendered dashboard is behind auth gate |
| FID (First Input Delay) | < 100 ms | ~50 ms | |
| CLS (Cumulative Layout Shift) | < 0.1 | ~0.05 | |
| TTI (Time to Interactive, dashboard) | < 5 s | ~3.5 s | 150+ components lazy-loaded |
| Bundle size (initial JS) | < 300 KB | ~280 KB | Code-split per tab |
| Bundle size (per-tab chunk) | < 100 KB | ~60–90 KB | |

### Frontend Bottlenecks
1. **30s polling interval** on notifications — 4 components poll in parallel (dev.log shows 3-4 requests per 30s window). Low cost; not a bottleneck.
2. **60s polling** on credits + reminders + activity + settings — each is a single indexed read; low cost.
3. **`use-token-refresh`** rotates the session on every tab visibility change — produces ~1 refresh/min when the user tabs in/out. Cheap but visible in logs.
4. **Live stats bar** updates every 5s; `real-time-activity-monitor` every 8s — both are cosmetic; could be paused when the tab is hidden.

## 5. How to Measure Performance

### Server-side
- **`src/lib/observability/api-logger.ts`** — logs every request with method, path, status, duration (the `GET / 200 in 44ms` lines in dev.log).
- **`src/lib/observability/metrics-collector.ts`** + **`metrics.ts`** — Prometheus-style metrics; scraped by the Prometheus config in `deploy/prometheus/`.
- **`src/lib/observability/tracing.ts`** + **`tracer.ts`** — OpenTelemetry traces; exported via `monitoring/opentelemetry/otel-collector-config.yml`.
- **Sentry** (`src/lib/observability/sentry.ts`) — error tracking + performance transactions.
- **`/api/health`** — liveness probe.
- **`/api/dashboard/performance-benchmark`** — in-app benchmark endpoint.

### Frontend
- **`src/lib/visual-regression.ts`** + **`scripts/visual-qa.mjs`** — visual regression + Lighthouse-style checks.
- **`src/lib/accessibility/responsive-validator.ts`** — responsive perf audit.
- **Chrome DevTools Lighthouse** — run against the deployed URL.
- **`web-vitals`** (if added) — RUM in production.

### Database
- **Prisma Client query logging** — enable `log: ['query', 'warn', 'error']` in dev to see every query + duration.
- **`scripts/parse-schema.py`** + **`scripts/extract-schema-gaps.js`** — schema-gap analysis.

## 6. Known Bottlenecks (honest list)

1. **Discovery is a long HTTP request** — 20 leads × (scrape + score) can take 30–60s. This is the #1 user-visible slow path. **Fix:** move to a background job queue (ADR-011); the API returns a jobId immediately; the client polls `/api/discovery/status`.
2. **Analytics aggregations** — full-table scans on `Lead`, `Communication`, `Meeting` for dashboard counts. **Fix:** pre-materialise into `AnalyticsSnapshot` (cron job to refresh nightly + on demand).
3. **SQLite write contention** — appears at ~50 concurrent writers. **Fix:** PostgreSQL (ADR-012).
4. **AI cost per discovery** — a 20-lead discovery burns ~10 credits worth of AI. At scale this is the dominant unit cost. **Fix:** prompt caching + model routing (cheap model for scoring, expensive model for outreach gen).
5. **SMTP Gmail daily quota** — 500/day on a free Gmail, 2000/day on Workspace. A power user hitting the limit mid-sequence stalls the sequence. **Fix:** deliverability dashboard + warm-up guidance + Resend fallback.
6. **Per-user Gmail OAuth refresh on cold start** — the first request after a token expiry does a refresh round-trip; user-visible latency spike. **Fix:** proactive refresh (refresh 5 min before expiry; partially built).
7. **Frontend bundle** — 150+ dashboard components. The lazy-load per tab keeps initial load small but the first visit to a heavy tab (pipeline, workflow-builder, report-builder) has a chunk-load delay. **Fix:** prefetch adjacent tabs on hover (not yet shipped).

## 7. Performance Budget (enforced)

- **No API route may block > 30s** — longer operations must be background jobs.
- **No frontend chunk may exceed 150 KB** — verify with `next build` bundle analysis.
- **No DB query may scan > 10k rows** without an index — verify with Prisma query logs in dev.
- **No external API call may be made synchronously in a request handler** if it can be cached — cache for at least the documented TTL (e.g. Google CSE results: 1h; Google Calendar events: 5 min).

---

*See also: [SCALABILITY-PLAN.md](SCALABILITY-PLAN.md), [ARCHITECTURE-DECISION-RECORDS.md](ARCHITECTURE-DECISION-RECORDS.md), [PERFORMANCE improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-3--performance-improvements).*
