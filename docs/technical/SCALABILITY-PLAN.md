# Scalability Plan — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Scope: from the current single-instance SQLite deployment to 10,000 paying accounts.

## 1. Current State (Sept 2026)

- **Deployment:** single Next.js instance (Aliyun FC / GLM preview / Vercel / Railway — supported targets).
- **Database:** single SQLite file (`db/custom.db`). Prisma ORM.
- **Cache:** in-memory only (no Redis). `src/lib/performance/cache-manager.ts` + `api-cache.ts` are process-local.
- **Background jobs:** none — discovery, scraping, AI batch, sequence processing, Gmail sync, and all 12 cron endpoints run synchronously inside API route handlers or cron-triggered requests.
- **Real-time:** WebSocket + SSE per-process (`src/lib/websocket.ts`, `src/lib/sse-manager.ts`); does not scale horizontally without sticky sessions.
- **AI provider:** `z-ai-web-dev-sdk` with fallback (ADR-006). Backend-only.
- **Email:** per-user Gmail OAuth + SMTP/Resend fallback (ADR-007).
- **Search:** Google Custom Search API ($5/1k queries).
- **Payments:** Stripe + Razorpay.
- **Users today:** single-tenant-ish; the `Organization` model exists but multi-tenant scaling is untested.

## 2. The Scaling Staircase

### Stage A — 100 paying accounts (~$3.5K MRR)
**Works today.** Single instance + SQLite handles this easily. ~200 concurrent sessions, ~5 req/s peak. AI cost ~$300/mo. SMTP via per-user Gmail. No changes needed.

**Watch:** DB size (~50 MB), AI cost as % of MRR, SMTP deliverability per user.

### Stage B — 1,000 paying accounts (~$35K MRR)
**Needs:** (1) PostgreSQL migration (ADR-012), (2) background job queue (ADR-011), (3) Redis for shared cache + pub/sub, (4) CDN for static assets, (5) email warm-up / deliverability tooling.

| Component | Change | Why |
|---|---|---|
| Database | SQLite → PostgreSQL (Supabase/Neon managed) | SQLite write lock at ~50 concurrent writers; 1k users will hit it |
| Background jobs | Redis + BullMQ (or Inngest) | Discovery (30s) + AI batch can't block HTTP; need a queue |
| Cache | Redis (shared across instances) | In-memory cache is per-process; with 2+ instances, cache hits drop to ~50% |
| Real-time | Sticky sessions (load balancer) or move to Pusher/Ably | Per-process WebSocket/SSE doesn't fan out across instances |
| Static assets | CDN (Vercel CDN / Cloudflare) | Next.js static + images served from edge |
| Email | Per-user warm-up + deliverability dashboard | 1k senders; some will have bad reputation; need visibility |
| Cron | Move to a dedicated worker (not the web request path) | 12 cron endpoints hitting the web app is fragile |

**Will break first without these changes:**
- SQLite write contention (~500 concurrent writers → DB stalls).
- Discovery HTTP timeouts (>30s jobs killed by the gateway).
- In-memory cache divergence across 2 instances.
- SMTP deliverability (one user's spam complaints don't sink the platform because per-user, but a cluster of bad senders looks bad).

### Stage C — 10,000 paying accounts (~$350K MRR)
**Needs:** (1) horizontal scaling (2–10 Next.js instances behind a load balancer), (2) read replicas for PostgreSQL, (3) dedicated AI gateway (rate-limit + cost-cap per tenant), (4) multi-region (US + India data residency), (5) a real observability stack (Prometheus + Grafana + Sentry + OpenTelemetry — configs already exist in `deploy/` and `monitoring/`).

| Component | Change | Why |
|---|---|---|
| Web tier | 2–10 Next.js instances behind LB | Single instance can't handle 10k users' request volume |
| Database | PostgreSQL primary + 2 read replicas | Writes on primary; reads on replicas (dashboard, analytics) |
| Cache | Redis cluster (sharded) | Single Redis won't hold the working set |
| Background jobs | BullMQ workers (separate process pool) | Need N workers; scale independently of web tier |
| Real-time | Pusher/Ably or dedicated WS service | Per-process WS doesn't scale; managed service does |
| AI gateway | Rate-limit per tenant + cost cap | 10k users = $4k–$40k/mo AI cost; one abuser can spike this |
| Search | Migrate from Google CSE to a self-hosted index (if cost warrants) | $5/1k queries × 10k users × N searches = significant |
| Email | Managed sender (Resend / SendGrid) for users without OAuth | Per-user Gmail OAuth doesn't scale to 10k warm-up flows |
| Multi-region | US + India (data residency) | DPDP Act + EU customers will require it |
| Observability | Prometheus + Grafana + Sentry + OpenTelemetry (already configured) | At 10k users you can't debug without metrics |

**Will break first without these changes:**
- Single PostgreSQL primary (write throughput ceiling ~2k writes/sec; analytics queries will contend).
- Single Redis (memory ceiling ~10GB; working set will exceed).
- Single Next.js instance (CPU + memory; Node.js is single-threaded).
- AI cost (without per-tenant caps, one user can spike the bill).

## 3. What Will Break First (honest, ranked)

1. **SQLite write lock** — appears at ~50 concurrent writers. **Fix:** PostgreSQL (ADR-012). This is the #1 scaling blocker.
2. **Long HTTP requests (discovery)** — 30s+ jobs killed by the gateway. **Fix:** background queue (ADR-011). #2.
3. **AI cost per abuser** — one user running 1000 discoveries/day = ~$50/day AI cost on a $29/mo plan. **Fix:** per-tenant cost caps + credit overage hard-stop. #3.
4. **In-memory cache divergence** — 2 instances → 50% cache hit; 10 instances → 10%. **Fix:** Redis. #4.
5. **Per-process WebSocket/SSE** — won't fan out. **Fix:** Pusher/Ably or sticky sessions. #5.
6. **Gmail SMTP daily quota per user** — 500–2000/day; a power user stalls. **Fix:** Resend fallback + warm-up. #6.
7. **Analytics full-table scans** — at 10k users × 100 leads each = 1M rows; dashboard counts slow. **Fix:** pre-materialise. #7.
8. **Frontend bundle** — 150+ components; the first visit to a heavy tab is slow. **Fix:** prefetch + better code-splitting. #8.

## 4. Database Connection Pooling

**Current:** Prisma's default connection pool (SQLite: 1 connection; PostgreSQL: 10 by default).
**Stage B (PostgreSQL):** use `directUrl` pointing at a PgBouncer-style pooler (Supabase/Neon provide this) to avoid exhausting PostgreSQL's max_connections (~100). Prisma's `connection_limit` should be tuned per instance: `num_instances × connection_limit ≤ max_connections × 0.8`.

## 5. Caching Strategy

| Layer | Cache | TTL | Invalidation |
|---|---|---|---|
| Static assets | CDN (Vercel/Cloudflare) | 1 year (hashed filenames) | Content-hash |
| API responses (read-heavy) | Redis | 60s–5min | On mutation (TanStack Query invalidation → Redis DEL) |
| DB query results (analytics) | `AnalyticsSnapshot` table | 1h–24h | Cron refresh + on-demand |
| Google CSE results | Redis | 1h | TTL |
| Google Calendar events | Redis | 5 min | TTL + watch-channel push |
| AI prompts | In-process (prompt-manager) | forever | On admin edit |
| User entitlements | In-process + Redis | 5 min | On plan change |
| Auth user (per request) | none (stateless JWT) | n/a | n/a |

## 6. CDN Usage

- **Static assets** (`_next/static/*`, images): Vercel CDN or Cloudflare in front of the origin.
- **API responses:** NOT CDN-cached (auth + personalisation).
- **Landing/marketing pages:** CDN-cached (SSR output; revalidate on deploy).
- **`/api-docs`:** CDN-cached (static content).

## 7. Background Job Queue (ADR-011)

**Plan:** Redis + BullMQ (TypeScript-native; same stack).
**Jobs to move off the request path:**
- Discovery (the 30s+ job) — top priority.
- AI batch (scoring 20 leads at once).
- Sequence step processing (sending the next email in a sequence).
- Gmail inbox sync (per-user; can be slow).
- Report generation + email delivery.
- Invoice PDF generation + email.
- Webhook fan-out (when outbound webhooks ship).
- The 12 cron jobs (each becomes a scheduled job, not an HTTP endpoint).

**Worker pool:** separate process; scale independently (start 2 workers at Stage B, 10 at Stage C).
**Dead-letter queue:** already exists (`DeliveryDeadLetter`, `workflow-dlq.ts`); the new queue plugs into it.
**Observability:** queue depth + job latency + failure rate in Prometheus.

## 8. Horizontal Scaling Approach

- **Web tier:** stateless (JWT sessions, Redis cache) → scale by adding instances behind a load balancer.
- **Worker tier:** stateless (pull from Redis queue) → scale by adding workers.
- **Database:** vertical until it can't, then read replicas + sharding by `userId` hash (long-term).
- **Real-time:** move to a managed service (Pusher/Ably) so the web tier stays stateless.
- **Sticky sessions** are an anti-pattern we avoid; everything is stateless or in Redis.

## 9. Memory & CPU Budgets per Instance

- **Web instance:** 1 vCPU, 1 GB RAM (Stage B); 2 vCPU, 4 GB RAM (Stage C). Node.js is single-threaded; use cluster mode or multiple instances.
- **Worker instance:** 1 vCPU, 1 GB RAM (Stage B); 2 vCPU, 2 GB RAM (Stage C). Workers are I/O-bound (network waits).
- **Redis:** 1 GB (Stage B); 4 GB (Stage C).
- **PostgreSQL:** Supabase/Neon managed; size by the provider's recommendations for active connections + storage.

## 10. What Needs to Be Refactored Before Scaling

| Refactor | Priority | Stage |
|---|---|---|
| Move discovery + AI batch to a job queue | P0 | Before Stage B |
| SQLite → PostgreSQL | P0 | Before Stage B |
| In-memory cache → Redis | P1 | Before Stage B |
| Per-process WebSocket → Pusher/Ably | P1 | Before Stage B |
| Pre-materialise analytics | P1 | Before Stage C |
| Per-tenant AI cost caps | P1 | Before Stage C |
| API versioning (`/api/v1/`) | P1 | Before first external API user |
| Outbound webhooks | P2 | Before Liam persona churns |
| Read replicas | P2 | Stage C |
| Multi-region | P2 | Stage C |

## 11. Cost Projection (per stage)

| Cost line | Stage A (100 users) | Stage B (1k) | Stage C (10k) |
|---|---|---|---|
| Hosting | $20/mo (1 instance) | $200/mo (2 web + 2 worker) | $2,000/mo (10 web + 10 worker) |
| Database | $0 (SQLite file) | $50/mo (managed Postgres) | $500/mo (primary + 2 replicas) |
| Redis | $0 (none) | $20/mo (managed) | $200/mo (cluster) |
| AI (Z-AI) | $300/mo | $3,000/mo | $30,000/mo |
| SMTP (per-user Gmail; Resend fallback) | $50/mo (Resend for those without OAuth) | $500/mo | $5,000/mo |
| Google CSE | $20/mo | $200/mo | $2,000/mo |
| Stripe fees | $100/mo (2.9% of $3.5k) | $1,000/mo | $10,000/mo |
| Sentry + observability | $26/mo (team) | $100/mo | $500/mo |
| **Total** | **~$520/mo** | **~$5,070/mo** | **~$50,200/mo** |
| **MRR** | ~$3,500 | ~$35,000 | ~$350,000 |
| **Gross margin** | ~85% | ~85% | ~86% |

**Key insight:** AI cost scales linearly with users (it's the dominant cost); everything else scales sub-linearly. The credits model is what protects the margin — the user pays for the AI they consume.

---

*See also: [PERFORMANCE-BENCHMARKS.md](PERFORMANCE-BENCHMARKS.md), [ARCHITECTURE-DECISION-RECORDS.md](ARCHITECTURE-DECISION-RECORDS.md), [OPERATIONS/COST-ANALYSIS.md](../operations/COST-ANALYSIS.md), and [SCALABILITY improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-5--scalability-improvements).*
