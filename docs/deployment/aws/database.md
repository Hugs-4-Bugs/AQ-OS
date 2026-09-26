# Database — RDS for PostgreSQL for AcquisitionOS

Cross-cloud database theory (why two connection strings, how `prisma db push` works, expand→migrate→contract changes) lives in [`../04-database-production.md`](../04-database-production.md) — read it first or alongside. This page is the AWS implementation: creating, securing, sizing, backing up, and pooling RDS PostgreSQL.

---

## 1. What → Why summary

| Decision | This handbook's default | Why for AcquisitionOS |
| --- | --- | --- |
| Engine / version | PostgreSQL **16.x** (pick newest 16.x RDS lists) | Prisma 6 + `schema.production.prisma` target PostgreSQL; 16.x is current mainstream |
| Instance class | `db.t4g.medium` (2 vCPU / 4 GB, Graviton) | Starting point for 53+ models at low traffic; vertical scale = one modify call |
| Storage | gp3, 50 GB + `max-allocated-storage` 500 | Autoscaling headroom; gp3 decouples IOPS from size |
| Multi-AZ | Production: yes (eventually). Staging: no | Zone failure ≠ outage; costs ~2× the instance |
| TLS | `rds.force_ssl = 1` | All app↔DB traffic encrypted; `sslmode=require` in both URLs |
| Placement | Private/database subnets + RDS SG (5432 from app SG only) | DB never touches the internet |
| Backups | Automated daily + retention ≥ 7 days (this repo's Terraform uses 30) + PITR | Point-in-time recovery for every schema-change accident |
| Pooling | Start: `connection_limit=10` in `DATABASE_URL`. Later: RDS Proxy (OPTIONAL) | Each app instance holds its own Prisma pool |

---

## 2. Creating the instance (condensed from manual-deployment §5)

Creation commands with explanations are in [`manual-deployment.md`](./manual-deployment.md) §5. The setting checklist to verify afterwards:

```bash
aws rds describe-db-instances --db-instance-identifier acquisitionos-prod \
  --query "DBInstances[0].{Engine:Engine,Version:EngineVersion,Class:DBInstanceClass,MultiAZ:MultiAZ,Storage:AllocatedStorage,Encrypted:StorageEncrypted,BackupDays:BackupRetentionPeriod,Public:PubliclyAccessible,Status:DBInstanceStatus}"
```

Expected: postgres / 16.x / db.t4g.medium / true (prod) / 50 / true / >= 7 / false / available.

Components and their purpose:

- **DB subnet group** = the 2 private (or dedicated database) subnets; forces RDS off public networks (`--no-publicly-accessible`).
- **Parameter group** (`postgres16` family): `rds.force_ssl = 1` is the REQUIRED one. `max_connections` is the other knob (§7). The repo's `deploy/terraform/main.tf` also enables connection/disconnection logging — useful, keep it.
- **Security group**: 5432 from the **app** SG only ([`networking.md`](./networking.md) §3). Test the negative case: `psql` from your laptop should time out.

## 3. Multi-AZ vs Single-AZ — the honest trade-off

| | Single-AZ | Multi-AZ |
| --- | --- | --- |
| Cost | 1× instance | ~2× instance (standby replica, not user-readable) |
| AZ outage | Downtime until instance recovers | Automatic failover, typically 60–120 s |
| Patching/maintenance | Restart window | Failover window instead |
| Write latency | baseline | slightly higher (synchronous standby sync) |

Recommendation: **staging = Single-AZ; production = Multi-AZ** (enable it at or before real users). Failover is automatic but your app must survive a blip: Prisma pools reconnect, SSE clients reconnect; the deployment circuit breaker also tolerates transient health failures during failover windows.

## 4. Backups, PITR, and snapshot discipline

- **Automated backups:** RDS takes a daily snapshot (set `backup_window` e.g. `03:00-04:00` UTC) and ships **transaction logs** — together they give **point-in-time recovery** to any second within `backup_retention_period` (set ≥ 7; the repo's Terraform uses 30).
- **PITR restore = a new instance**, not in-place:

  ```bash
  aws rds restore-db-instance-to-point-in-time \
    --source-db-instance-identifier acquisitionos-prod \
    --target-db-instance-identifier acquisitionos-prod-restore \
    --use-latest-restorable-time
  # verify, then repoint (or swap identifiers) — drill this ONCE before you need it
  ```

- **Manual snapshot before every schema change** (the `prisma db push` rule, §6):

  ```bash
  aws rds create-db-snapshot \
    --db-instance-identifier acquisitionos-prod \
    --db-snapshot-identifier pre-db-push-$(date +%Y%m%d-%H%M)
  ```

- Deletion protection (`--deletion-protection`) + `skip_final_snapshot=false` (repo Terraform sets both) guard the "destroy" failure mode. Restore drills and the full backup strategy: [`../04-database-production.md`](../04-database-production.md) §7.

## 5. Connection strings (pooled vs direct)

Two secrets were created in [`manual-deployment.md`](./manual-deployment.md) §6; their shapes matter:

```text
DATABASE_URL="postgresql://app_user:YOUR_DB_PASSWORD@DB_HOST:5432/acquisitionos?sslmode=require&connection_limit=10&pool_timeout=20"
DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@DB_HOST:5432/acquisitionos?sslmode=require"
```

- `DATABASE_URL` — used by the **running app** through your pooling layer (RDS Proxy if you adopt it, else Prisma's own pool via `connection_limit`).
- `DIRECT_URL` — used by **`prisma db push`** (schema sync) and anything that must not be pooled. `schema.production.prisma` wires it via `directUrl`.

Both go through Secrets Manager, never through Git or the image. `rds.force_ssl=1` makes the `sslmode=require` part non-optional.

## 6. `prisma db push` — the procedure

1. Snapshot (§4). 2. Run from your machine or CI with `DIRECT_URL` exported (command + expected output in [`manual-deployment.md`](./manual-deployment.md) §10). 3. If Prisma asks for `--accept-data-loss` — **stop**; that is the destructive-change signal; plan the expand→migrate→contract version instead ([`../04-database-production.md`](../04-database-production.md) §6). 4. Verify `psql "$DIRECT_URL" -c '\dt'`. 5. Watch CloudWatch/`aws logs tail` while the new code meets the new schema.

## 7. Connection pooling and the connection budget

The problem: every Next.js task instance runs its own Prisma connection pool. Unbounded instances × unbounded pool = exhausted `max_connections`, and the app starts failing auth checks (which the ALB health check notices).

**Connection budget formula:**

```text
total ≈ (app_instances × connection_limit) + migrations + admin + safety margin
keep total < max_connections
```

Defaults (approximate — verify per instance class): RDS PostgreSQL derives `max_connections` from instance memory (e.g. `db.t4g.medium` ≈ 400-ish; check with `psql "$DIRECT_URL" -c 'SHOW max_connections;'`). With 2 instances × `connection_limit=10`, you use ~20 + margin — comfortable. Scale both numbers together: 10 instances × 10 = 100, still fine; 20 instances × 20 = 400, at the edge → time for RDS Proxy or explicit tuning.

`connection_limit` guidance: `2–4 × vCPU of the app task` per instance (1 vCPU task → ~4; 2 vCPU → ~8–10).

### RDS Proxy (OPTIONAL hardening)

What it is: a managed pooler between the app and RDS (own endpoint, in your VPC, auto-failover aware). Adopt when: many instances, connection churn, or you want fewer direct DB connections and faster failover reconnects.

- Point `DATABASE_URL` at the proxy endpoint; keep `DIRECT_URL` at the instance.
- Set up via console or Terraform (`aws_db_proxy`, `aws_db_proxy_default_target_group`, `aws_db_proxy_target`, IAM auth or Secrets Manager credential attachment).
- **Prisma + RDS Proxy caveat (NEEDS VERIFICATION):** RDS Proxy's **transaction-level** pinning/multiplexing is historically problematic with PostgreSQL **prepared statements** (Prisma uses them). Workarounds documented in the field range from "works with recent RDS Proxy + Prisma versions" to "disable prepared statements / use session pinning". Verify against the current Prisma + RDS Proxy docs **before** adopting transaction mode, and test with your real workload. https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql-connection-pooling and https://docs.aws.amazon.com/rds/latest/userguide/rds-proxy.html are the sources of truth.
- The zero-risk alternative (default in this handbook): no proxy, `connection_limit=10` in `DATABASE_URL`. It is what the cross-cloud chapter assumes.

## 8. Observability: Performance Insights + CloudWatch

Enable Performance Insights (repo Terraform already sets `performance_insights_enabled = true`; free tier covers 7-day history) — console shows the top SQL by load; that is how you find the one Prisma query holding the connection pool hostage.

CloudWatch metrics to watch (RDS namespace, per instance):

| Metric | Healthy-ish | Alarm when |
| --- | --- | --- |
| `CPUUtilization` | < 60% | > 80% sustained 10 min |
| `DatabaseConnections` | near your budget formula (§7) | trend up without traffic growth (pool leak) |
| `FreeableMemory` | steady | sustained drop (working-set too big for class) |
| `ReadIOPS` / `WriteIOPS` | < gp3 baseline | sustained maxing (scale class or IOPS) |
| `FreeStorageSpace` | > 20% of allocated | < 5 GB (repo Terraform has this exact alarm) |
| `Deadlocks` | 0 | > 0 repeatedly (needs app-level attention) |

Application-side cross-checks: `GET /api/health/detailed` shows DB check + heap in app terms; CloudWatch alarms wiring guidance is in [`manual-deployment.md`](./manual-deployment.md) §13.

## 9. Checklist

- [ ] Instance in private subnets; `PubliclyAccessible = false`; SG allows 5432 only from app SG
- [ ] `rds.force_ssl = 1` in the parameter group; both URLs use `sslmode=require`
- [ ] Backup retention ≥ 7 (prod: 30), `backup_window` off-peak, PITR verified once via a drill restore
- [ ] Manual snapshot taken before the first and every `prisma db push`
- [ ] `DATABASE_URL` (pooled/`connection_limit=10`) and `DIRECT_URL` (direct) in Secrets Manager
- [ ] Connection budget computed and documented (instances × connection_limit < max_connections)
- [ ] (When many instances) RDS Proxy evaluated — with the prepared-statement caveat verified first
- [ ] Performance Insights on; CloudWatch alarms for CPU/connections/storage in place

## 10. Official Documentation

- RDS for PostgreSQL — https://docs.aws.amazon.com/rds/
- Creating a DB instance — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html
- Backups & PITR — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
- Multi-AZ deployments — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html
- Working with parameter groups — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithParamGroups.html
- RDS Proxy — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html
- Performance Insights — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PerfInsights.html
- Prisma + PostgreSQL connections — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
