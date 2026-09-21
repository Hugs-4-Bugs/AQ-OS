# Scaling — What Actually Constrains AcquisitionOS on Workers

How this deployment grows, and — more importantly — what it constrains on. The honest answer first: **Workers scale themselves**; the bottlenecks live elsewhere (CPU ceilings per request, Hyperdrive, and above all your external Postgres). Read [`./architecture.md`](./architecture.md) §2 for the constraint table; this page turns it into an operations playbook.

---

## 1. The scale model: automatic, per request

**What:** Workers run your code on the Cloudflare edge closest to each request. There are no instances, no replica counts, no autoscaling policies, no scale-to-zero and no cold-start warm-up for you to manage — isolates are created per demand and evicted freely.

**What this deletes from the container-cloud playbook** (compare [`../gcp/`](../gcp/README.md)-style scaling): min/max instances, CPU-allocation toggles, target-tracking policies, instance-type upgrades. None of it exists; none of it is needed.

**Why it suits AcquisitionOS:** traffic is bursty (business-hours dashboards, campaign pushes); per-request scaling absorbs bursts without pre-provisioning. The trade is the per-request limits below — scale-out is free, but *each request* has a ceiling.

**Verify:** load-test staging (e.g. 50 concurrent logins + dashboards): request latency should stay flat as concurrency rises — until a limit (§2) or the database (§2.3) is hit. There is no "scaling event" to observe because there is no scaling to do.

---

## 2. What actually constrains you (in the order you will meet them)

### 2.1 CPU time per request — per plan

**What:** each request gets a CPU-time budget: Workers Free **10 ms**; Workers Paid **30 s default (5 min max configurable)** — figures at the time of writing, **`NEEDS VERIFICATION`** at https://developers.cloudflare.com/workers/platform/limits/. Memory is 128 MB per isolate on both.

**Why it bites this app:** SSR with Prisma queries, `bcryptjs` hashing on login, and assembling AI responses are real CPU work. Free-plan CPUs are exceeded by a single login — this is why [`prerequisites.md`](./prerequisites.md) §1 declares **Workers Paid effectively required**.

**Symptoms:** `Exceeded CPU` errors / 1102 in `wrangler tail` ([`./troubleshooting.md`](./troubleshooting.md)).

**Action ladder:** (1) measure which endpoints burn CPU (tail percentiles in dashboard Metrics); (2) reduce per-request work (cache AI results — the app has cache-hour knobs; trim payload sizes); (3) confirm Paid plan; (4) only then consider splitting genuinely heavy batch work into the cron dispatcher's 15-minute budget or an external job.

### 2.2 Simultaneous outbound connections and subrequests

**What:** 6 simultaneous outbound connections per request, and a subrequest cap per invocation (Free 50; higher on Paid — figures per [`./architecture.md`](./architecture.md) §2, `NEEDS VERIFICATION`).

**Why it matters:** discovery/outreach endpoints fan out to external APIs (Google CSE/SerpAPI, AI providers); SSE handlers hold a stream while awaiting occasional upstream work.

**Action ladder:** batch external calls sequentially or in small groups; check `wrangler tail` for `too many connections` errors; keep heavy fan-out on the cron path, not interactive requests.

### 2.3 External Postgres becomes the bottleneck first — almost always

**What:** every scalable part of this deployment (Workers, Hyperdrive) funnels into one fixed-size resource: your managed Postgres (CPU, `max_connections`, IOPS, storage).

**Why Hyperdrive already helps:** it pools connections near the edge so Workers' scale-out does not multiply provider connections — the connection budget stays a small constant per region ([`database.md`](./database.md) §8).

**Signals (provider dashboard + `/api/health` latency):** CPU > 70–80% sustained; connections near `max_connections`; slow-query log filling; dashboards slowing before anything errors.

**Action ladder (in order):**
1. Fix the queries (indexes, N+1s) — Prisma logging + provider slow-query log.
2. Verify caching knobs (the app's `ANALYTICS_CACHE_TTL`, AI cache hours) are set sensibly.
3. **Scale the provider** — bigger instance class / more vCPU is the correct next step and often cheaper than a week of query archaeology.
4. Add read capacity only if the provider supports it cleanly and the app can use replicas (`FUTURE/ALTERNATIVE` — the current code reads/writes one primary).
5. Keep **D1 out of the conversation entirely** (§3).

### 2.4 Redis (Upstash): global rate limiting + SSE fan-out across isolates

**What:** `REDIS_URL` (Upstash HTTP-Redis works well from Workers) switches on the app's existing pub/sub path ([`../01-architecture.md`](../01-architecture.md) §2.3).

**Why it is the Workers-specific scaling lever:** on one container instance the in-process event bus is "global"; on Workers, isolates are per-request and per-region — **SSE fan-out and any in-process rate limiting are per-isolate by default**. Redis gives all isolates one shared bus/counter. This is `OPTIONAL` (single-isolate behavior still works; clients reconnect and replay via `/api/realtime/recover`), but it is the first thing to add when live-update reliability matters at real traffic.

**Verify:** with Redis set, trigger a notification while SSE streams from two different regions' clients — both receive it ([`backend.md`](./backend.md) §7).

### 2.5 Caching: edge + Cache API + Workers Assets

**What:** three caching layers already in place ([`frontend.md`](./frontend.md) §3, [`networking.md`](./networking.md) §8):

| Layer | Caches | Scaling value |
| --- | --- | --- |
| Workers Assets | `_next/static/**`, `public/` files | Static traffic never touches the Worker — effectively free scale |
| CDN/Cache Rules | Whatever the app's `Cache-Control` permits | Offloads repeat requests; **bypass `/api/*` always** |
| Cache API / R2 incremental cache (OPTIONAL) | Next.js ISR data | Only relevant if you adopt ISR — see [`frontend.md`](./frontend.md) §3 |

**Action:** nothing to tune for static scale; add the R2 incremental-cache override only if ISR enters the picture. Authenticated pages are per-user by design — never "fix" dashboard latency with shared edge caching; fix the queries (§2.3).

### 2.6 SSE capacity math — a worked example

**What:** how to reason about live-stream capacity, since "number of instances" does not exist here. The numbers below are illustrative order-of-magnitude figures for planning, not guarantees — measure with your own load test (`NEEDS VERIFICATION` per-plan behaviors).

```text
Given: 500 concurrent users; 60% keep the notifications SSE open; heartbeats every 15–30 s.

- Streams:      500 × 0.6 = ~300 concurrent SSE requests, each = one long-lived,
                mostly-idle request. Idle time (between heartbeats) costs ~no CPU.
- Isolates:     the runtime places streams on isolates as load demands; you neither
                choose nor observe the mapping. Expect streams from the same user's
                page lifecycle to share isolates often, but never rely on it.
- Event bus:    in-process → an event triggered by request A is seen by a stream on
                the same isolate immediately, by other isolates only if REDIS_URL
                (Upstash) fan-out is configured (§2.4).
- Failure mode  without Redis is NOT a crash: streams stay connected; notifications
                may arrive late (on the next user interaction/refresh) or after a
                client reconnect + /api/realtime/recover replay.
```

**Reading:** SSE scale on Workers is mostly an *event-fan-out correctness* question, not a capacity question. Add Redis when users on different isolates must see events within seconds, not when streams "run out" — they do not, practically.

**Verify:** two browsers on different networks (different colos), trigger a notification from a third session; with Redis, both live-streams show it within a heartbeat.

---

## 3. What NOT to scale blindly (the rejection list)

| Temptation | Verdict | Why |
| --- | --- | --- |
| **"Move the DB to D1 to keep it on Cloudflare"** | **`NOT APPLICABLE` — forbidden** | D1 is SQLite; AcquisitionOS is Prisma + PostgreSQL (53+ models). Migration = schema rewrite + re-validating every query — a project, not a scaling step ([`./architecture.md`](./architecture.md) §4). The fix for DB pressure is §2.3. |
| **"Add Cloudflare Queues for background jobs"** | `FUTURE/ALTERNATIVE` | The app has no queue consumer; jobs run in-process and via HTTP cron. Adopting Queues is an application change to be made *when a need exists*, not as preemptive scaling ([`./architecture.md`](./architecture.md) §4). |
| **"Add Durable Objects / KV for the SSE bus"** | `FUTURE/ALTERNATIVE` | Attractive future design; the code today knows Redis only. Reach for §2.4 first. |
| **"Pre-warm instances"** | `NOT APPLICABLE` | No instances exist. The analogue (keeping isolates warm) is the platform's job. |
| **"Split UI and API into separate Workers"** | Avoid | Breaks the one-unit architecture ([`../01-architecture.md`](../01-architecture.md) §1), adds CORS + cookie scope problems ([`backend.md`](./backend.md) §4) — and solves nothing Workers constrains. |
| **"Raise timeouts for slow endpoints"** | Not a knob | Wall-clock is unlimited while clients stay connected (`NEEDS VERIFICATION`); slow endpoints are a query problem (§2.3), not a timeout problem. |

---

## 4. Metrics-to-action table (pin this)

| Metric (where) | Warning sign | First action |
| --- | --- | --- |
| CPU p99 (dash → Metrics) | climbing toward plan default | Profile hot endpoints; confirm Paid plan ([`backend.md`](./backend.md) §6) |
| Error rate (Workers Logs `status>=500`) | spike after a deploy | `wrangler tail` → [`./troubleshooting.md`](./troubleshooting.md); roll back if deploy-caused ([`./rollback.md`](./rollback.md)) |
| `/api/health` latency (uptime monitor) | creeping up | Postgres pressure — provider dashboard (§2.3) |
| Provider connections (provider dashboard) | approaching `max_connections` | Confirm Hyperdrive bound + per-request Prisma pattern ([`database.md`](./database.md) §4/§8) |
| Provider CPU/storage | > 70–80% sustained | Scale the provider (§2.3) |
| 1101/1102 errors (`wrangler tail`) | recurring | Node-API or memory issue — [`./troubleshooting.md`](./troubleshooting.md) "Worker crash"/"memory exhaustion" |
| SSE disconnects (user reports + recover hits) | frequent | Add `REDIS_URL` (§2.4); verify cache-bypass rule ([`networking.md`](./networking.md) §7–8) |
| Subrequest/connection errors (`wrangler tail`) | on batch endpoints | Batch fan-out sequentially (§2.2) |
| Worker size warning (build output) | near 64 MiB (`NEEDS VERIFICATION`) | Adapter size guidance — https://opennext.js.org/cloudflare |

---

## 5. The scaling order, condensed

1. **Do nothing** until a signal in §4 fires (the platform absorbs most growth silently).
2. **Postgres first** — queries, then instance size (§2.3). This is where 90% of real scaling happens.
3. **Redis (Upstash)** when multi-isolate SSE fan-out or global app-level rate limiting becomes real (§2.4).
4. **CPU headroom** — trim hot paths; re-verify plan limits (`NEEDS VERIFICATION`) (§2.1).
5. **Only then** consider the `FUTURE/ALTERNATIVE` primitives (Queues, DOs) — as application projects with their own design work, never as emergency knobs.

**A worked growth path** (how this typically plays out for an app of this shape):

```text
Launch (dozens of users)      → nothing tuned. Worker + Hyperdrive + small Postgres.
Early growth (hundreds)       → first slow dashboards → fix queries (indexes), verify
                                the /api/* cache-bypass rule exists, right-size the
                                provider instance once. Still no Worker changes.
Real usage (thousands, live   → REDIS_URL (Upstash) switched on for cross-isolate
notifications users care about)  SSE fan-out; WAF rate rules reviewed against real
                                 login/OTP traffic patterns (security.md §2).
Sustained heavy load          → CPU p99 watch (§2.1), batch fan-outs moved to cron,
                                read capacity/provider scaling per §2.3 ladder.
Never, on this path           → D1 migration (forbidden), Queues/DOs until a real
                                application need exists (§3).
```

Each step is reversible and small — which is the promise of this platform: scale-out is the runtime's job, and your scaling work stays focused on the database and the application's hot paths.

---

## 6. Official Documentation

- Workers limits (CPU, memory, duration, connections) — https://developers.cloudflare.com/workers/platform/limits/
- How Workers scale — https://developers.cloudflare.com/workers/reference/how-workers-works/
- Hyperdrive pooling/caching — https://developers.cloudflare.com/hyperdrive/
- Workers Static Assets — https://developers.cloudflare.com/workers/static-assets/
- Cache Rules — https://developers.cloudflare.com/cache/how-to/cache-rules/
- Upstash for Redis (external, works from Workers over HTTP) — https://developers.cloudflare.com/workers/databases/ (integrations) and https://upstash.com/
- Queues / Durable Objects (FUTURE/ALTERNATIVE — linked for completeness) — https://developers.cloudflare.com/queues/ , https://developers.cloudflare.com/durable-objects/
- Shared database scaling — [`../04-database-production.md`](../04-database-production.md)
