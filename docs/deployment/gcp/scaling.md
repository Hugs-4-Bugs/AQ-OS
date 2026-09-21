# GCP Scaling — When and How to Scale AcquisitionOS on Cloud Run + Cloud SQL

Scaling on GCP is three independent dials: **Cloud Run instances** (horizontal app capacity), **instance size** (vertical app capacity), and **Cloud SQL** (database capacity) — plus one dependency that flips a switch: **Redis for SSE fan-out once you have more than one instance**. This page tells you what each dial does, the order to turn them in, and what to check before touching the database.

Baseline facts this page builds on: one container, port 3000, SSE with 15–30 s heartbeats ([`architecture.md`](./architecture.md) §4), Prisma pool per instance ([`database.md`](./database.md) §8), Cloud Run autoscaling signals (CPU, concurrency, latency — [`backend.md`](./backend.md) §7).

---

## 1. The dials, and the order to turn them

```text
1. Vertical: raise Cloud Run CPU/memory            (cheapest fix for saturation)
2. Horizontal: raise --max-instances               (only AFTER the Redis decision below)
3. Redis: adopt Memorystore BEFORE relying on >1 instance for SSE
4. Database: tier up / storage / replicas          (only AFTER slow-query review)
```

The order matters because each dial has a hidden cost: bigger instances cost money per instance-hour, more instances multiply DB connections and fragment SSE state, a DB tier-up costs more per hour with no benefit if the problem is a missing index.

---

## 2. Cloud Run horizontal scaling — instances and concurrency

**What:** Cloud Run adds/removes instances based on CPU utilization, request concurrency, and latency. `--min-instances` keeps instances warm; `--max-instances` is your cost ceiling; `--concurrency` is how many simultaneous requests share one instance (default **80**).

**Why SSE changes the math:** an SSE connection (`/api/events/*`) occupies one concurrency slot for the whole stream. A user who leaves a tab open for 8 hours holds a slot for 8 hours. With stream-heavy usage the *effective* concurrency per instance is much lower than 80, because a slice of the 80 is parked in idle streams.

```bash
gcloud run services update acquisitionos --region="$REGION" \
  --min-instances=1 --max-instances=5 --concurrency=80 --no-cpu-throttling
# Expected output: revision [acquisitionos-000xx+N] ... deployed (100% traffic).

gcloud run services describe acquisitionos --region="$REGION" \
  --format='yaml(spec.template.spec.containerConcurrency, spec.template.spec.autoscaling)'
```

Guidance:

- `min-instances=1` — `REQUIRED FOR CURRENT ACQUISITIONOS` (SSE breaks on scale-to-zero; cold starts).
- Start `max-instances` at **3–5**. Each additional instance adds `connection_limit` DB connections ([§5](#5-the-connection-budget-recalculate-when-scaling-out)) and, without Redis, becomes an island for live events ([§6](#6-memorystore-redis-required-once-multi-instance)).
- Keep `--concurrency=80` at first. If CPU saturation alerting fires while latency is fine, or stream clients dominate, lower to 40–50 so new instances spin up earlier instead of over-packing one.
- Autoscaling signals Cloud Run uses: CPU utilization, request concurrency, request latency ([`backend.md`](./backend.md) §7). With `--no-cpu-throttling` and SSE traffic, CPU stays low — watch latency and concurrency dashboards, not CPU alone.

## 3. Vertical scaling: CPU and memory tiers

**What:** per-instance size. **Why:** the first saturation fix — no architectural consequences, instant revision.

```bash
gcloud run services update acquisitionos --region="$REGION" --cpu=2 --memory=2Gi
# Expected output: revision ... deployed (100% traffic). Brief drain-and-replace; SSE clients reconnect.
```

| Tier | When | Notes |
| --- | --- | --- |
| 1 vCPU / 1 GiB | **start here** | floor for this app with headroom ([`backend.md`](./backend.md) §8) |
| 2 vCPU / 2 GiB | sustained instance CPU or memory > 80% ([`monitoring.md`](./monitoring.md) §4 row 3) | covers most small-team production loads |
| 4 vCPU / 4 GiB+ | heavy AI/analysis workloads; measure first | diminishing returns if DB is the bottleneck |

Changing size replaces instances one revision at a time — safe, but do it off-peak since every replaced instance re-establishes its Prisma pool.

## 4. Cloud SQL scaling

**Tier up** (machine type):

```bash
gcloud sql instances patch "$DB_INSTANCE" --tier=db-custom-2-7680
# Expected output: Patching Cloud SQL instance... done. (Brief restart — do it off-peak.)
```

- Start small (`db-custom-1-3840`, ~1 vCPU/3.75 GiB) and grow on evidence — Query Insights shows whether queries or capacity are the problem ([`database.md`](./database.md) §7).
- **Storage auto-increase** — enable once; disk fills are outages in slow motion ([`database.md`](./database.md) §9).
- **Read replicas** — `OPTIONAL`, only for read-heavy reporting/analytics load; replicas do **not** help write throughput and add replication lag to reason about. `FUTURE/ALTERNATIVE` until the data says otherwise.

## 5. The connection budget: recalculate when scaling out

**This is the constraint people miss.** Every Cloud Run instance holds its own Prisma pool:

```text
total_connections ≈ app_instances × connection_limit + migration/one-off margin
must stay BELOW max_connections (alert at 80% — monitoring.md §4 row 4)
```

Doubling `--max-instances` doubles the connection floor. Options, in order of preference:

1. Keep `connection_limit=10` (in `DATABASE_URL`) and stay inside the budget ([`database.md`](./database.md) §8).
2. Lower `connection_limit` (e.g. 5) when instance count grows — the pooler (`pool_timeout`) absorbs bursts.
3. Tier up Cloud SQL (`max_connections` scales with memory — check yours with `SHOW max_connections;`) only when 1–2 are genuinely exhausted.

Symptom of ignoring this: `Timed out fetching a new connection from the connection pool` in Cloud Run logs ([`troubleshooting.md`](./troubleshooting.md) §db-connections).

## 6. Memorystore Redis: REQUIRED once multi-instance

**The precise statement:** SSE events are produced **in-process**. Without `REDIS_URL`, a payment event on instance A reaches only the SSE clients connected to instance A — clients on instance B hear nothing until they reconnect, and `/api/realtime/recover` can only replay what the database recorded (realtime stream state is not in the DB for every stream type).

```text
1 instance:  in-process bus is fine            → REDIS_URL not needed
>1 instance: live fan-out is instance-local    → REDIS_URL REQUIRED for correct SSE
```

`OPTIONAL` at one instance; **functionally required** the day you depend on `--max-instances > 1` for real traffic. The ioredis-based pub/sub layer lazy-loads and no-ops when the variable is absent (verified: `src/lib/redis-pubsub-service.ts`), so adding Redis is additive.

```bash
# Create Memorystore (Basic tier is enough to start):
gcloud redis instances create acquisitionos-redis \
  --region="$REGION" --size=1 --tier=basic --network=projects/YOUR_PROJECT_ID/global/networks/default
# Expected output: the Redis IP (private VPC — requires VPC access from Cloud Run, networking.md §2)

# Wire it in as a secret, then start a new revision:
gcloud secrets versions add REDIS_URL --data-file=- <<< "redis://REDIS_IP:6379"
gcloud run services update acquisitionos --region="$REGION"   # re-resolves :latest into a new revision
```

Verify: connect two browsers from different instances (or restart one instance) and confirm a notification still arrives live; check Redis metrics (connections, ops) in Monitoring. Also see [`security.md`](./security.md) §5 — Redis additionally enables shared-state rate limiting.

## 7. CDN for static assets — `OPTIONAL`

Next.js emits immutable, content-hashed assets under `/_next/static/` and the app already sends correct `Cache-Control` headers ([`frontend.md`](./frontend.md)). With the LB path you can enable **Cloud CDN** on the backend service for those routes to shave latency and app instances' work:

- Cache only `/_next/static/*` and other immutable paths; **bypass** `/api/*` (and never cache `/api/events/*` — SSE must not be buffered or cached, [`networking.md`](./networking.md) §5).
- `FUTURE/ALTERNATIVE` until static-asset load is measurable; Cloud Run instances are usually not the bottleneck first.

## 8. What NOT to scale blindly

| Temptation | Why it is usually wrong | Do instead |
| --- | --- | --- |
| DB tier-up first | 80% of "DB is slow" is a missing index or N+1 query; a bigger machine makes the query wrong faster | Query Insights review ([`database.md`](./database.md) §7) → fix query → then size |
| `--max-instances=50` because traffic is coming | fragments SSE fan-out (§6) and multiplies DB connections (§5) before you have the supporting pieces | max 3–5 + Redis + connection-budget math |
| Memorystore "because prod needs Redis" | at one instance it adds an outage dependency for nothing | add it **when** instance count grows past 1 |
| REGIONAL HA / replicas before product-market fit | real cost multiplier for a risk you may not have yet | backups + PITR first ([`backups.md`](./backups.md)); HA when uptime promises are contractual |
| Raising `--concurrency` to pack instances | SSE traffic will starve other requests at the limit | keep 80, scale instances, revisit with real data |

## 9. "How do I know when to scale?" — step by step

| Signal (Monitoring / Query Insights) | Threshold | Action |
| --- | --- | --- |
| Instance CPU > 80% (10 min) | warning | 1: raise memory/CPU ([§3](#3-vertical-scaling-cpu-and-memory-tiers)) |
| Instance memory > 80% (10 min) | warning | raise memory before CPU (OOM kills are worse than slowness) |
| Request latency p95 climbing, CPU normal | warning | check DB connections (§5) and slow queries (§8) before scaling anything |
| 503s from max-instances exhaustion / cold starts under load | action | raise `--max-instances` one step (5 → 8); **first confirm Redis** if >1 instance (§6) |
| SQL connections > 80% of budget | action | lower `connection_limit`, reduce instance count, or tier up (§5) |
| SQL CPU > 80% (10 min) after query review | action | tier up (§4) |
| SQL disk > 75% | action | storage auto-increase ON + free space audit ([`database.md`](./database.md) §9) |
| SSE reports of "missed" events with >1 instance | **action** | adopt Redis (§6) — this is correctness, not performance |
| Uploads lost on redeploys reported | action | GCS adoption, not scaling ([`backups.md`](./backups.md) §8) |

Cadence: review these signals weekly at first, monthly once stable. Scale on thresholds, not on vibes.

---

## 10. Official documentation

- Cloud Run autoscaling & concurrency — https://cloud.google.com/run/docs/about-instance-autoscaling and https://cloud.google.com/run/docs/configuring/services/concurrency
- Cloud Run resource limits (CPU/memory) — https://cloud.google.com/run/docs/configuring/services/cpu and /memory
- Cloud SQL scaling & machine types — https://cloud.google.com/sql/docs/postgres/choose-machine-type
- Read replicas — https://cloud.google.com/sql/docs/postgres/read-replicas
- Memorystore for Redis — https://cloud.google.com/memorystore/docs/redis
- Cloud CDN — https://cloud.google.com/cdn/docs
- Prisma connection pool (`connection_limit`, `pool_timeout`) — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
- Handbook: [`database.md`](./database.md) §8 · [`backend.md`](./backend.md) §7 · [`monitoring.md`](./monitoring.md) §4
