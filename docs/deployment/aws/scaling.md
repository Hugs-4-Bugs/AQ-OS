# Scaling — ECS Tasks, ALB, RDS, Redis

Scaling AcquisitionOS is not "add more of everything". The app has one hard ordering constraint (Redis before instance count) and one budget that caps horizontal growth (DB connections). This page gives the scaling order, the concrete policies, and the honest "do not scale this yet" list. Facts used here: SSE heartbeats 15–30 s, `REDIS_URL` optional fan-out, per-task Prisma `connection_limit` ([`../01-architecture.md`](../01-architecture.md) §2.3-2.5, [`../04-database-production.md`](../04-database-production.md) §5).

---

## 1. The order that matters

```text
1. Size the single task up (vertical)          → §3   (1 vCPU/2 GB → 2 vCPU/4 GB)
2. Set autoscaling policies on the service      → §2   (target tracking)
3. Add ElastiCache Redis BEFORE the 2nd task    → §6   (or SSE breaks silently)
4. Watch RDS: connections budget first, then CPU → §5
5. Only then: RDS Proxy, read replicas, CloudFront → §5, §7
```

Why this order: a second task without Redis **splits SSE fan-out** (each instance has an in-process event bus — events published on instance A never reach subscribers connected to instance B; verified — [`../01-architecture.md`](../01-architecture.md) §2.3). Nothing alarms; notifications just stop working "sometimes". Redis first, always.

---

## 2. ECS service autoscaling (target tracking)

**What/Why:** AWS keeps a metric near a target value by adding/removing tasks. Target tracking needs no scaling thresholds to babysit.

```bash
# 2.1 Register the scalable target: between 2 and 4 tasks
aws application-autoscaling register-scalable-target \
  --service-namespace ecs --resource-id service/acquisitionos-prod/acquisitionos-app \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 4 --region ${AWS_REGION}

# 2.2 Primary policy: CPU at 60%
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs --resource-id service/acquisitionos-prod/acquisitionos-app \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name aos-cpu-target --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 60,
    "PredefinedMetricSpecification": { "PredefinedMetricType": "ECSServiceAverageCPUUtilization" },
    "ScaleInCooldown": 300, "ScaleOutCooldown": 60
  }' --region ${AWS_REGION}
```

**Decisions for this app:**

- **`min-capacity 2`** (REQUIRED for HA): with 1 task, every deploy has a gap; with 2, rolls are zero-downtime and AZ loss leaves one alive. Never 0 — SSE clients would lose streams ([`backend.md`](./backend.md) §9).
- **CPU 60% is the primary signal**, not `ALBRequestCountPerTarget`: each SSE stream is *one request held open for a long time*, so request counts undercount concurrent users wildly. CPU reflects the actual per-instance work.
- **`max-capacity` from the DB connection budget, not from vibes:** with `connection_limit=10` per task ([`backend.md`](./backend.md) §4), max tasks × 10 must stay under your RDS `max_connections` headroom — see the budget math in [`../04-database-production.md`](../04-database-production.md) §5. If you need more tasks, first lower `connection_limit` per task or add RDS Proxy (§5).
- **ScaleInCooldown 300 s:** SSE connections land on a new task and stay; premature scale-in would drop live streams. Scale-out can be aggressive (60 s).

**Verify:** `aws application-autoscaling describe-scaling-policies --service-namespace ecs` lists the policy; generate load in staging and watch `aws ecs describe-services ... --query "services[0].[runningCount,desiredCount]"` climb, then fall back.

---

## 3. Fargate task sizes

**What:** the task definition's `cpu`/`memory` (units: vCPU × 1024, memory in MB). Valid combinations are fixed by Fargate:

| CPU | Memory | `"cpu"` / `"memory"` | Fits when |
| --- | --- | --- | --- |
| 0.5 vCPU | 1 GB | `256` / `1024` | Toy/staging only — Prisma + Next SSR is tight |
| 1 vCPU | 2 GB | `1024` / `2048` | **Start here** (the manual-deployment default) |
| 2 vCPU | 4 GB | `2048` / `4096` | Comfortable for real traffic; fewer, fatter tasks = fewer DB connections |
| 4 vCPU | 8 GB | `4096` / `8192` | Heavy AI/analysis workloads before horizontal split |

```bash
# Change size = new task def revision + service update (rolling)
aws ecs describe-task-definition --task-definition acquisitionos-prod \
  --query "taskDefinition" > td.json
# edit "cpu": "2048", "memory": "4096", drop readonly fields, then:
aws ecs register-task-definition --cli-input-json file://td.json
aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
  --task-definition acquisitionos-prod:NEW_REVISION
```

Rule of thumb: prefer **fewer, bigger tasks** on this app — each task holds a Prisma pool, so 2×4GB tasks cost the database fewer connections than 8×1GB ones. Size guidance vs OOM: [`backend.md`](./backend.md) §9, [`troubleshooting.md`](./troubleshooting.md) §8.

---

## 4. ALB math for SSE (why the timeout and cooldown matter)

Estimate long-lived connections per task:

```text
concurrent_users  ≈  open tabs doing something real
streams_per_user  ≈  1–3   (notifications + sometimes payments/analytics/ai)
streams_per_task  ≈  concurrent_users_per_task × streams_per_user

Example: 200 concurrent users, 2 streams avg, min 2 tasks
→ ~200 streams per task. Each holds a Node socket + event-bus entry.
```

- **ALB capacity is not your problem** — it scales internally; nodes handle thousands of idle connections. The knobs that matter are the ones you already set: idle timeout 3600 s (SSE survives), deregistration delay 30 s ([`backend.md`](./backend.md) §7).
- **Task size is the limit:** Node handles thousands of mostly-idle SSE sockets on 1 vCPU; the *work* (SSR, API, AI calls) drives CPU. This is why CPU target tracking works.
- **Watch for the wrong failure mode:** if SSE clients disconnect on every deploy, that is the 30 s deregistration + client auto-reconnect working as designed ([`../01-architecture.md`](../01-architecture.md) §2.3), not a scaling problem.

**Verify:** `aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name ActiveConnectionCount ...` gives the real connection count; compare with your estimate before raising task count.

---

## 5. RDS scaling

**5.1 Vertical (first move):** bigger instance class — instant-ish, no app change:

```bash
aws rds modify-db-instance --db-instance-identifier acquisitionos-prod \
  --db-instance-class db.t4g.large --apply-immediately
```

`t4g.medium` → `t4g.large` doubles CPU/RAM; apply off-peak (restart happens).

**5.2 Storage:** already autoscaling via `--max-allocated-storage 500` ([`manual-deployment.md`](./manual-deployment.md) §5.3) — confirm with `describe-db-instances` (`MaxAllocatedStorage`). Alarm on `FreeStorageSpace` ([`monitoring.md`](./monitoring.md) §3).

**5.3 The connection budget before anything else:** scaling to 4 tasks × `connection_limit=10` = 40 + margin. When the budget or `DatabaseConnections` alarm ([`monitoring.md`](./monitoring.md) §4) is the constraint, do one of:

- Lower `connection_limit` per task if tasks are small;
- **RDS Proxy (OPTIONAL)** for multiplexing: it pools many client connections onto fewer DB connections. **Prisma caveat (NEEDS VERIFICATION):** Prisma uses prepared statements, which constrain RDS Proxy's default transaction-level pooling — pin the proxy to session-level pinning or verify current Prisma↔RDS Proxy guidance before switching; the alternative is PgBouncer, which you would self-host ([`database.md`](./database.md) §7). Start with `connection_limit` — most deployments of this shape never need the proxy.

**5.4 Read replicas (OPTIONAL, usually premature):** RDS replicas only help if the application sends reads to them — the current app has a single `DATABASE_URL` and no read-splitting code (verified). Adding one now adds cost, lag, and no benefit. Revisit only for genuinely read-heavy analytics loads **with app changes** (FUTURE/ALTERNATIVE).

**Verify:** `aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections ...` stays well under budget; `aws rds describe-db-instances --query "DBInstances[0].[DBInstanceClass,MaxAllocatedStorage]"` matches intent.

---

## 6. ElastiCache Redis — REQUIRED before task count > 1

**What/Why:** the app's SSE events are published in-process; `REDIS_URL` switches the fan-out to Redis pub/sub so any instance reaches every subscriber (verified — `src/lib/redis-pubsub-service.ts` lazy-loads and no-ops when absent). Second task without Redis = silently broken notifications for some users.

```bash
aws elasticache create-cache-cluster --cache-cluster-id acquisitionos-redis \
  --engine redis --cache-node-type cache.t4g.small --num-cache-nodes 1 \
  --cache-subnet-group-name acquisitionos-redis-subnets \
  --security-group-ids ${REDIS_SG_ID} --region ${AWS_REGION}

# then add to the task def secrets/env and roll the service:
#   REDIS_URL=redis://acquisitionos-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379
```

(Subnet group + Redis SG from [`networking.md`](./networking.md); sizing: `cache.t4g.small` is plenty for pub/sub fan-out at this scale.) `REDIS_URL` is not a credential secret on a private subnet — plain env is acceptable; use AUTH on the cluster if you want belt-and-suspenders.

**Verify:** with 2 running tasks, open the notifications bell on two sessions that land on different tasks and confirm both update live; `aws elasticache describe-cache-clusters --show-cache-node-info` shows the endpoint.

---

## 7. CloudFront for static assets (OPTIONAL)

Static `_next` assets are content-hashed and cacheable aggressively at the edge; `/api/**` (especially SSE) must **bypass** cache. Configuration, headers, and the "don't cache /api" warning: [`networking.md`](./networking.md) §6. Adopt only when (a) you have geographically spread users and (b) ALB bandwidth is a real line item — it is the last OPTIONAL on this page for a reason: it adds a moving part in front of the exact headers `src/lib/app-url.ts` depends on ([`backend.md`](./backend.md) §5).

---

## 8. What NOT to scale blindly

| Tempting move | Why it fails here | Do instead |
| --- | --- | --- |
| More tasks to fix slow API | If slow queries are the cause, 10 tasks make the DB worse (more connections hammering the same index scans) | Check RDS CPU + slow queries first ([`monitoring.md`](./monitoring.md) §3) |
| More tasks without Redis | Splits SSE fan-out; "works on my instance" | §6 first, always |
| Bigger RDS to fix CPU 100% | Often one missing index or one bad query | `EXPLAIN ANALYZE` the top offenders before upsizing ([`../04-database-production.md`](../04-database-production.md) §8) |
| Multi-region "for scale" | Data is in one RDS; two regions ≠ two sources of truth | Single region + backups ([`backups.md`](./backups.md)) until product needs say otherwise |
| RDS Proxy "because pooling" | Prepared-statement caveat; complexity | `connection_limit` first; §5.3 when the budget actually binds (NEEDS VERIFICATION) |
| CloudFront "for speed" | Headers/SSE risk, extra moving part | Only with §7's constraints |

---

## 9. Metrics-to-action table

| Signal (metric) | Threshold | Action |
| --- | --- | --- |
| `ECSServiceAverageCPUUtilization` > 60% sustained | autoscaling handles it | Confirm max-capacity not reached; else §3 vertical |
| `MemoryUtilization` (ECS service) > 80% sustained | manual | New task def with more memory (§3); investigate leak if trend, not load |
| `HTTPCode_Target_5XX` rising with CPU flat | app problem | Logs first ([`troubleshooting.md`](./troubleshooting.md) §1) — not a scaling fix |
| `TargetResponseTime` p95 up, RDS CPU up | DB pressure | §5.1 vertical / §5.3 budget work; slow-query hunt |
| `DatabaseConnections` > 80% of budget | budget | Fewer-bigger tasks (§3), `connection_limit` tuning, then §5.3 |
| `UnHealthyHostCount` > 0 during deploys only | transient | Normal roll behavior; alarm on sustained only ([`monitoring.md`](./monitoring.md) §3) |
| Users report missed SSE events with 2+ tasks | fan-out split | Redis (§6) — highest-priority item on this page |
| `FailedInvocations` (cron rules) | any | Not scaling — [`troubleshooting.md`](./troubleshooting.md) §17 |

---

## 10. Official Documentation

- ECS service autoscaling — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
- Application Auto Scaling target tracking — https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking.html
- Fargate task size table — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-defs.html
- ALB connection handling / scaling — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/how-application-load-balancer-work.html
- RDS instance classes & resizing — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html
- RDS Proxy + prepared statements — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html (and the Prisma caveat: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- ElastiCache for Redis — https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/index.html
