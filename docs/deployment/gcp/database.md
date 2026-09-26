# GCP Database — Cloud SQL for PostgreSQL for AcquisitionOS

Production AcquisitionOS runs on **PostgreSQL 14+ via Prisma** (`prisma/schema.production.prisma`, 53+ models). This page creates that database on Cloud SQL. Cross-platform database concepts (pooled vs direct URLs, schema strategy, restore drills) are in [`../../04-database-production.md`](../04-database-production.md) — read it first or alongside.

Everything here is `REQUIRED FOR CURRENT ACQUISITIONOS` unless labeled `OPTIONAL`.

---

## 1. Create the instance

### Console (click-by-click)

1. Navigation menu → **Cloud SQL** → **Create instance** → **PostgreSQL**.
2. Instance ID: `acquisitionos-pg`. Password: generate one (`openssl rand -hex 24`), store it in your password manager.
3. **Database version:** PostgreSQL 16.
4. **Region:** the single region you chose ([`prerequisites.md`](./prerequisites.md) §9) — **must match Cloud Run and Artifact Registry**.
5. **Zonal availability:** Single zone (start). Multi-zone = HA — see §5.
6. **Machine shape:** Custom → 2 vCPU / 8 GB (`db-custom-2-8192`). Staging can use `db-g1-small` (shared core) honestly.
7. **Storage:** 20 GB, **Enable automatic storage increases** (§9).
8. **Connections:** leave public IP enabled (default) **with no authorized networks** — access works via the Auth Proxy / Cloud Run socket path, not the open internet (§4).
9. **Data protection:** enable automated backups (pick an off-peak time), enable **point-in-time recovery**, retain 30 backups.
10. **Flags** (Advanced): `cloudsql.require_ssl = on` (§3).
11. Create (~5 minutes).

### gcloud (same result)

```bash
export PROJECT_ID="YOUR_PROJECT_ID"; export REGION="us-central1"; export DB_INSTANCE="acquisitionos-pg"

gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-8192 \
  --region="$REGION" \
  --storage-size=20GB --storage-auto-increase \
  --backup-start-time=07:00 --enable-point-in-time-recovery --retained-backups-count=30 \
  --availability-type=ZONAL
gcloud sql instances patch "$DB_INSTANCE" --require-ssl
# Expected: Creating Cloud SQL instance ... done.
```

**Why each setting (What → Why for AcquisitionOS):**

| Setting | Why |
| --- | --- |
| `POSTGRES_16` | The Prisma production schema targets PostgreSQL 14+; 16 is current |
| Same region as Cloud Run | Latency + no cross-region egress; Prisma queries are chatty |
| `--storage-auto-increase` | Disk-full stops writes = outage; auto-grow prevents it (still alert at 75%) |
| Backups + PITR | Backups recover files; PITR recovers from *bad data writes* to any second in the window |
| `--require-ssl` | DB credentials never cross the network unencrypted |

Verify: `gcloud sql instances list` shows `RUNNABLE`; note the **connection name** (`gcloud sql instances describe $DB_INSTANCE --format='value(connectionName)'`) — used by the Auth Proxy and the Cloud Run socket path.

---

## 2. Flags that matter

```bash
# What: set instance flags. WARNING: --database-flags REPLACES the full flag set —
# re-supply existing flags when patching.
gcloud sql instances patch "$DB_INSTANCE" \
  --database-flags=cloudsql.require_ssl=on,max_connections=200
```

| Flag | Default-ish | Guidance for AcquisitionOS |
| --- | --- | --- |
| `cloudsql.require_ssl` | off | **on** — enforce TLS |
| `max_connections` | instance-size dependent (NEEDS VERIFICATION for your tier — check `SHOW max_connections;`) | Size it against the budget in §8; 200 is a reasonable start for 2 vCPU |
| `log_min_duration_statement` | off | `OPTIONAL`: e.g. `1000` (ms) to surface slow queries in logs; Query Insights (§7) is often enough |

---

## 3. Database + application user (least privilege)

```bash
gcloud sql databases create acquisitionos --instance="$DB_INSTANCE"
gcloud sql users create app_user --instance="$DB_INSTANCE" --password="YOUR_DB_PASSWORD"
```

Then, connected as the **admin** user through the Auth Proxy (§4), grant `app_user` only what it needs (identical to [`../../04-database-production.md`](../04-database-production.md) §2):

```sql
CREATE ROLE app_user WITH LOGIN PASSWORD 'YOUR_DB_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;   -- CREATE needed by prisma db push
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

**Why:** the app must never run as the `postgres` superuser; a compromised `app_user` still cannot drop the instance or other databases. `CREATE ON SCHEMA public` is required — `prisma db push` creates/alters tables.

---

## 4. Connectivity: public IP + Auth Proxy vs private IP

| | **Public IP + Auth Proxy / unix socket (default in this guide)** | **Private IP (+ Direct VPC egress)** |
| --- | --- | --- |
| Setup effort | Low — no VPC needed | Needs a VPC, subnet, egress config ([`networking.md`](./networking.md) §2) |
| Exposure | Public endpoint exists but refuses connections without TLS + credentials + IAM (no authorized networks) | Not internet-routable at all |
| From your laptop (migrations) | Cloud SQL Auth Proxy tunnel | VPN / bastion / IAP tunnel required |
| From Cloud Run | Built-in: `--add-cloudsql-instances` mounts a unix socket | Direct VPC egress or VPC connector |
| Latency | Slightly higher than in-VPC (still same-region) | Lowest |
| Recommended for | **Start here** — the whole handbook path assumes it | Production hardening once traffic justifies it |

The runtime connection string (unix socket, what Cloud Run uses with `--add-cloudsql-instances`):

```text
DATABASE_URL="postgresql://app_user:YOUR_DB_PASSWORD@/acquisitionos?host=/cloudsql/YOUR_PROJECT_ID:us-central1:acquisitionos-pg&connection_limit=10"
```

The migration connection string (your machine, through the Auth Proxy):

```text
DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@127.0.0.1:5432/acquisitionos"
```

Both live in Secret Manager ([`secrets.md`](./secrets.md)) — never in Git. Why two variables: `directUrl` is what Prisma uses for migrations; `DATABASE_URL` carries the pooling parameters the running app uses ([`../../04-database-production.md`](../04-database-production.md) §5).

Cloud SQL has **no built-in PgBouncer** — per-instance `connection_limit` inside `DATABASE_URL` is the pooling control you have. The **Auth Proxy is not a pooler**; it is a secure transport.

---

## 5. High availability — the trade-offs

| | `ZONAL` (single zone) | `REGIONAL` (HA) |
| --- | --- | --- |
| Cost | 1x | ~2x (standby replica always on) |
| Behavior on zone outage | Downtime until Cloud SQL restarts the instance | Automatic failover (~60 s target; NEEDS VERIFICATION for current SLA numbers — check the Cloud SQL HA docs) |
| Backups/PITR | Yes | Yes |
| Recommendation | Dev/staging; early production | Production once an hour of DB downtime costs more than the 2x |

Change later with one command (brief failover/restart during the switch): `gcloud sql instances patch "$DB_INSTANCE" --availability-type=REGIONAL`.

---

## 6. Backups + PITR — enable and PROVE

```bash
# Verify the configuration:
gcloud sql instances describe "$DB_INSTANCE" --format="yaml(settings.backupConfiguration)"
# Expect: enabled: true, pointInTimeRecoveryEnabled: true, startTime: '07:00'
```

Then do what makes a backup real ([`../../04-database-production.md`](../04-database-production.md) §7): restore into a **scratch instance** and smoke-test it.

```bash
gcloud sql backups list --instance="$DB_INSTANCE"
gcloud sql backups restore BACKUP_ID --restore-instance=acquisitionos-restore-test --backup-instance="$DB_INSTANCE"
# run prisma validate + /api/health check against the restore instance, then DELETE it
gcloud sql instances delete acquisitionos-restore-test
```

Quarterly drill; measure how long the restore took — that is your realistic RTO. Also export a portable logical dump (`pg_dump --format=custom`) — the Auth Proxy tunnel works for that too.

---

## 7. Observing the database

- **Query Insights** (Cloud SQL console → Query Insights): slowest queries, execution plans, tags — no agent needed. First place to look when the app feels slow.
- **Cloud SQL Studio** (console SQL editor): run the admin SQL from §3, check `SHOW max_connections;`, inspect tables — without installing psql.
- **Metrics to alert on** ([`monitoring.md`](./monitoring.md)): connections at 80% of `max_connections`, CPU, disk usage at 75%, replication lag (HA), deadlocks.
- High-volume tables for missing indexes (`Lead`, `WorkflowRun`, `Notification`-style): confirm with `EXPLAIN ANALYZE` before adding indexes — the schema already defines the common ones.

---

## 8. The connection budget (formula)

Every Cloud Run instance runs its own Prisma pool. Keep the math true:

```text
total_connections ≈ app_instances × connection_limit  +  migration/one-off jobs margin
must stay BELOW max_connections (alert at 80%)
```

With the handbook defaults: `3 instances × connection_limit=10 = 30` + migrations (1–2) — comfortably inside 200. If you raise `--max-instances` on Cloud Run, raise this math first. Symptoms of an exhausted budget: `Error: Timed out fetching a new connection from the connection pool` in Cloud Run logs.

---

## 9. Storage auto-increase & maintenance windows

```bash
# Auto-grow (already set in §1; verify):
gcloud sql instances describe "$DB_INSTANCE" --format="value(settings.storageAutoResize)"   # True

# Maintenance window: pick a quiet hour so patching lands predictably (OPTIONAL but recommended)
gcloud sql instances patch "$DB_INSTANCE" \
  --maintenance-window-day=SUN --maintenance-window-hour=05
```

Cloud SQL applies security patches during the window; connections may drop briefly — Cloud Run's Prisma pool reconnects automatically, so keep `--min-instances=1` so the app recovers itself.

---

## 10. Schema changes — the standing procedure

1. Edit `prisma/schema.production.prisma` in a PR; run `npx prisma validate --schema=prisma/schema.production.prisma`.
2. Deploy the schema first (or with the release): from a machine with the Auth Proxy running —
   ```bash
   ./cloud-sql-proxy "$DB_CONN_NAME" --port 5432
   npx prisma db push --schema=prisma/schema.production.prisma
   ```
   If it demands `--accept-data-loss`: **stop**, take a backup, plan an expand → migrate → contract rollout ([`../../04-database-production.md`](../04-database-production.md) §6).
3. Verify `psql "$DIRECT_URL" -c '\dt'`, then `curl /api/health`.
4. Never mix `db push` and `migrate deploy` on the same database (pick one — [`../../04-database-production.md`](../04-database-production.md) §4).

---

## 11. Checklist

```text
[ ] Cloud SQL PostgreSQL 16 instance, same region as Cloud Run, tier db-custom-2-8192
[ ] cloudsql.require_ssl = on; storage auto-resize on; maintenance window set
[ ] database acquisitionos + user app_user with least-privilege grants (admin user unused by app)
[ ] DATABASE_URL (unix-socket + connection_limit=10) and DIRECT_URL in Secret Manager
[ ] prisma db push succeeded; /api/health reports database healthy
[ ] Automated backups + PITR enabled (retention ≥ 7 days); one restore drill completed
[ ] Connection budget documented: instances × connection_limit < max_connections
[ ] Query Insights enabled; alerts on connections/CPU/disk
```

---

## 12. Official documentation

- Cloud SQL for PostgreSQL overview — https://cloud.google.com/sql/docs/postgres
- Create instances — https://cloud.google.com/sql/docs/postgres/create-instance
- Configure flags — https://cloud.google.com/sql/docs/postgres/flags
- Backups & PITR — https://cloud.google.com/sql/docs/postgres/backup-recovery
- High availability — https://cloud.google.com/sql/docs/postgres/high-availability
- Best practices — https://cloud.google.com/sql/docs/postgres/best-practices
- Query Insights — https://cloud.google.com/sql/docs/using-query-insights
- Connect from Cloud Run — https://cloud.google.com/sql/docs/postgres/connect-run
- Cloud SQL Auth Proxy — https://cloud.google.com/sql/docs/postgres/sql-proxy
- Prisma connection management — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
