# Scaling on Azure — Replicas, Database Tiers, Redis, and Restraint

Scale in the order the app actually needs it: **replicas → Redis → database tier**, and only when a metric says so. Everything here changes cost — the metrics-to-action table (§8) is the discipline that keeps changes justified. Connection-string and tier background: [`database.md`](./database.md); the scaling-shape summary lives in [`../01-architecture.md`](../01-architecture.md) §2.3 (SSE) and §3.

---

## 1. What scales, in what order

```text
More traffic
  1) Container Apps replicas (stateless app)        -- cheap, automatic
  2) Azure Cache for Redis (SSE fan-out)            -- REQUIRED once replicas > 1
  3) PostgreSQL compute/storage (vertical)          -- when DB metrics say so
  4) (rarely) edge caching for static assets        -- Front Door, static only
```

Statefulness rules the order: each replica is a full Next.js server with its own Prisma pool and its own in-process event bus — replicas are cheap, but *cross-replica* behaviors (SSE fan-out, rate limits, connection count) are the real cost of scaling.

---

## 2. Container Apps scale rules

**What:** KEDA-driven autoscaling. The default **HTTP scale rule** adds replicas when concurrent requests per replica cross a threshold.

**Why min 1 is REQUIRED:** `min-replicas 0` kills every live SSE stream on idle and adds cold starts; the notifications bell depends on a warm replica ([`backend.md`](./backend.md) §8, [`architecture.md`](./architecture.md) §3).

```bash
az containerapp update -n "$APP" -g "$RG" \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-rule --scale-rule-type http --scale-rule-http-concurrency 20
# Expected: JSON scale block with minReplicas 1, maxReplicas 5 and the http rule
```

- **`--scale-rule-http-concurrency 20`**: start conservative — each request may hold a Prisma connection or an SSE stream; 20 concurrent per replica keeps p95 latency flat ([`backend.md`](./backend.md) §8; if your az version rejects the flag, check `--help` — coverage varies by version).
- **max 5 to start**: 5 × `connection_limit=10` = 50 connections, comfortably inside the DB budget ([`database.md`](./database.md) §12). Raise `max` only with §5 recalculated.
- **KEDA custom-metrics rules** (queue depth, external metrics): OPTIONAL — nothing in AcquisitionOS produces a queue metric; do not add one until a real workload shape demands it (FUTURE/ALTERNATIVE).
- **Session affinity**: not required — SSE clients reconnect with `Last-Event-ID` replay; revisit only if you observe reconnect storms across replicas ([`networking.md`](./networking.md) §5).

**Verify:** `az containerapp replica list -n "$APP" -g "$RG" -o table` grows under `hey`/`ab` load and shrinks back to 1 after.

---

## 3. CPU / memory per replica

**What:** the Consumption plan gives each replica a CPU/memory allocation; you choose it per revision.

| Stage | CPU | Memory | Trigger to move here |
| --- | --- | --- | --- |
| Launch | 0.5 vCPU | 1.0 Gi | — |
| Comfortable prod | 1.0 vCPU | 2.0 Gi | Sustained CPU > 70–80 %, or memory > 75 % of cap |
| Heavy | 2.0 vCPU | 4.0 Gi | OOM restarts, or CPU saturation with queueing latency |

```bash
az containerapp update -n "$APP" -g "$RG" --cpu 1.0 --memory 2.0Gi   # creates a new revision
```

**Signals to watch** (portal Metrics on the Container App): `Usage nano cores` (CPU), `Working set bytes` (memory), `Restart count` (OOM/crash proxy — an unexplained restart with no deploy is §"container crash" in [`troubleshooting.md`](./troubleshooting.md)). Dedicated **workload profiles** (bigger node pools, more predictable placement) are OPTIONAL — meaningful only when you outgrow Consumption behavior, not before.

**Verify:** after the change, the new revision serves `/api/health` 200 and `Restart count` stays 0 across a deploy.

---

## 4. PostgreSQL Flexible Server scaling

**Compute (vertical):** resize the SKU — a short restart, then everything reconnects (Prisma pool re-establishes; SSE clients replay via `Last-Event-ID`).

```bash
az postgres flexible-server update -g "$RG" -n "$PG" --sku-name Standard_D4ds_v4   # 2 -> 4 vCPU
# Expected: JSON state Ready after a brief update/restart window
```

**Storage:** leave **autogrow Enabled** ([`database.md`](./database.md) §2) and alert at 75 % ([`monitoring.md`](./monitoring.md) §4) — autogrow is the cushion, not the plan.

**Read replicas:** Flexible Server supports them, factually — but AcquisitionOS has **no read/write splitting in its code** (one `DATABASE_URL`), so a replica would sit idle unless you also change the app. FUTURE/ALTERNATIVE; solve slow reads with indexes + Query Store first ([`database.md`](./database.md) §13).

**Why metrics-before-SKU matters:** the classic failure is paying for 8 vCPUs while the real problem is a missing index on `Lead`/`WorkflowRun`-scale tables — Query Store tells you which ([`../04-database-production.md`](../04-database-production.md) §8).

---

## 5. The connection budget, recalculated

**Formula** ([`database.md`](./database.md) §12, [`../04-database-production.md`](../04-database-production.md) §5):

```text
connections_needed ≈ replicas × connection_limit + scheduler + one-off jobs + admin margin (~10)
keep connections_needed < max_connections × 0.8
```

| replicas | × connection_limit 10 | + margin | vs typical D2ds_v4 `max_connections` |
| --- | --- | --- | --- |
| 1 | 10 | ~20 | Comfortable |
| 5 (handbook max) | 50 | ~60 | Comfortable |
| 10 | 100 | ~110 | Check `max_connections` and the SKU before doing this |

Raising replicas without this arithmetic is how "it worked at 3 replicas" becomes `connection_limit`-induced timeouts at 6. Check the real value any time:

```bash
az postgres flexible-server parameter show -g "$RG" -n "$PG" -m max_connections \
  --query "{value: value, default: defaultValue}" -o table
```

---

## 6. Azure Cache for Redis — REQUIRED once replicas > 1

**What/Why:** SSE events originate **in-process**. Without Redis, a payment event is delivered only to browsers streamed by *the same replica* that processed it — with 3 replicas, two-thirds of your users' bells silently stop updating. `REDIS_URL` switches the app to Redis pub/sub fan-out (verified app behavior: `ioredis` lazy-loads and no-ops if absent — [`../01-architecture.md`](../01-architecture.md) §2.3, [`architecture.md`](./architecture.md) §3).

```bash
az redis create -g "$RG" -n redis-acquisitionos -l "$AZ_LOCATION" \
  --sku Basic --vm-size c0     # start smallest; TLS enforced by the service
```

Wire it (Azure Cache requires TLS — port 6380 / `rediss://`):

```bash
az containerapp update -n "$APP" -g "$RG" \
  --set-env-vars REDIS_URL="rediss://:PASSWORD@redis-acquisitionos.redis.cache.windows.net:6380"
```

(Store the password in Key Vault as `redis-url`/`redis-password` per [`secrets.md`](./secrets.md) §3 and reference via `secretref` rather than the inline value above; exact TLS-port/`rediss` handling of Azure Cache + ioredis is worth a smoke test — NEEDS VERIFICATION at the app level. The **C standard** tier is the first with real headroom; Basic has no SLA — FUTURE upgrade, cost-recapped in the Azure pricing calculator.)

**Verify:** open the notifications bell in two browser sessions while watching `az containerapp replica list` — with 2 replicas and Redis configured, events still reach both sessions; without Redis they do not ([`troubleshooting.md`](./troubleshooting.md) §"bell updates only after refresh").

---

## 7. Edge caching — static only

**What:** Front Door (OPTIONAL) may cache **only** hashed immutable assets (`/_next/static/*`) with a dedicated route rule. Everything else — HTML, `/api/**`, SSE — passes through uncached because the app sets its own `Cache-Control` and login state is cookie-based ([`frontend.md`](./frontend.md) §3–4).

**Why not "turn on CDN to scale":** a cached HTML shell after login or a buffered `/api/events/*` stream are *regressions* that look like scaling wins and cost you real-time correctness. Default stays **caching Disabled** globally ([`manual-deployment.md`](./manual-deployment.md) §8.3); add the static-asset rule deliberately, and test a login after enabling it.

---

## 8. What NOT to scale blindly

| Temptation | Why it backfires | Do instead |
| --- | --- | --- |
| Bumping the DB SKU at the first slow dashboard | CPU spikes are usually a missing index; you pay 2× for the same latency | Query Store / `EXPLAIN ANALYZE` first ([`database.md`](./database.md) §13) |
| Adding replicas before Redis | SSE events become instance-local; support tickets, not outages | §6 first, then replicas |
| Raising `max_connections` to "fix" connection errors | Each connection costs RAM on the DB; the formula was the point | §5 recalc; raise `connection_limit` or SKU deliberately |
| Zone-redundant HA "while we're at it" | ~2× DB compute for an outage class backups already cover at this stage | [`database.md`](./database.md) §4 trade-off; revisit post-launch |
| KEDA custom metrics "for control" | Nothing emits the metrics; rules that never fire are config debt | HTTP concurrency rule is enough (§2) |
| CDN-for-everything | Breaks login freshness + SSE | §7 static-only rule |

---

## 9. Metrics-to-action table

| Metric (source) | Threshold | Action |
| --- | --- | --- |
| `Usage nano cores` > 80 % sustained (app) | 15 min | `--cpu` up one step (§3); only then look at replicas |
| `Working set bytes` > 75 % of cap (app) | 15 min | `--memory` up; check for OOM restarts |
| `Restart count` > 0 without a deploy | any | Crash investigation — [`troubleshooting.md`](./troubleshooting.md) §Container crash |
| Replicas pinned at max under normal traffic | 30 min | Raise `--max-replicas` **after** §5 budget check + §6 Redis |
| `connections_active` > 80 % of budget (DB) | 5 min | Fewer replicas, lower `connection_limit`, or bigger SKU (§5) |
| `cpu_percent` > 80 % sustained (DB) | 10 min | Query Store review → index → then SKU (§4) |
| `storage_percent` > 75 % (DB) | any | Confirm autogrow; plan cleanup/archival |
| SSE "bell needs refresh" reports | any | §6 Redis if replicas > 1; else edge buffering check ([`networking.md`](./networking.md) §6) |
| Cold-start latency after idle | any | Confirm `--min-replicas 1` survived config changes (§2) |

---

## 10. Scaling checklist

```text
[ ] min-replicas 1 everywhere (SSE); http-concurrency rule set; max 5 until budget-checked
[ ] CPU/memory: 0.5-1 vCPU / 1-2 Gi start; growth driven by Working set + CPU metrics, not vibes
[ ] Connection budget recalculated BEFORE any replica or max_connections change
[ ] Redis created + REDIS_URL wired via secretref the day replicas go > 1
[ ] Front Door caching (if any): static assets only; login + SSE retested after enabling
[ ] DB SKU changes preceded by Query Store review
[ ] Zone-redundant HA deferred until cost-justified (database.md §4)
[ ] Every scaling change has an alert that would have suggested it (monitoring.md §4, §9)
```

## 11. Official Documentation

- Container Apps scale rules — https://learn.microsoft.com/azure/container-apps/scale-app
- KEDA scalers (custom metrics) — https://keda.sh/docs/latest/scalers/
- Azure Cache for Redis — https://learn.microsoft.com/azure/azure-cache-for-redis/
- Flexible Server compute + storage scaling — https://learn.microsoft.com/azure/postgresql/flexible-server/
- Read replicas (Flexible Server) — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-read-replicas
- Prisma connection pool (`connection_limit`) — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
