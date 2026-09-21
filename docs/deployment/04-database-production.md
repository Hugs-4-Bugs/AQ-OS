# Database Production Guide — PostgreSQL + Prisma

This is the cross-cloud database chapter. Each cloud guide's `database.md` shows how to *create* the managed instance; this page covers everything that is true on every platform.

---

## 1. Dev vs production — what changes

| | Development (this repo, as checked out) | Production (this handbook) |
| --- | --- | --- |
| Engine | SQLite (`db/custom.db`) | **PostgreSQL 14+** (managed service) |
| Schema file | `prisma/schema.prisma` (`provider = "sqlite"`) | `prisma/schema.production.prisma` (`provider = "postgresql"`) |
| Migrations | `prisma/migrations/*` — **SQLite-locked** (`migration_lock.toml: provider = "sqlite"`) | Applied with `prisma db push` against the production schema (§4) |
| Connection | local file | TLS connection string in secret manager |
| Backups | none / manual | automated + PITR + restore drills |

The repo itself ships the tooling for this transition: `prisma/schema.production.prisma` (PostgreSQL datasource with `DATABASE_URL` + `DIRECT_URL`) and `scripts/migrate-to-postgresql.sh` (data migration from an existing SQLite file). This is the verified, intended production path — do **not** invent a different ORM or database.

**Why managed PostgreSQL:** automated backups, high availability, patching, metrics, and connection management you would otherwise operate by hand. All four clouds offer one; Cloudflare connects to any of them (or a provider like Supabase/Neon) via Hyperdrive.

---

## 2. Creating the production database (generic steps)

1. **Create the instance** — smallest sensible tier (2 vCPU / 4–8 GB RAM is a realistic starting point for this app; vertical scaling later is easy). Multi-AZ/HA only when the business justifies it.
2. **Create the database** — name it `acquisitionos`.
3. **Create the application user** — do **not** use the admin/superuser for the app:

```sql
-- run as admin in the cloud console / psql
CREATE ROLE app_user WITH LOGIN PASSWORD 'YOUR_DB_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;   -- CREATE needed for migrations
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

4. **Enforce TLS** — enable "Require SSL"/`rds.force_ssl`/`require_secure_transport` on the instance.
5. **Record two connection strings** (see §5): pooled `DATABASE_URL` + direct `DIRECT_URL`. They go straight into the secret manager — never into Git or docs.

---

## 3. First schema deployment

The repo's documented production command (from the header of `prisma/schema.production.prisma`):

```bash
# from your machine / CI with DATABASE_URL + DIRECT_URL set to the production Postgres
npx prisma db push --schema=prisma/schema.production.prisma
```

`db push` syncs the Prisma schema to the database (creates 53+ tables, indexes, constraints) **without** a migrations folder. It is the fastest correct path for a fresh database and is how the production schema is designed to be applied in this repo.

**Verify:**

```bash
psql "$DIRECT_URL" -c '\dt' | head -20          # tables exist
npx prisma validate --schema=prisma/schema.production.prisma   # schema valid
```

Then seed anything the app expects (billing plans/entitlements) using the repo's seed tooling if you use it locally (`scripts/seed.ts`, `scripts/seed-entitlements.ts`) — inspect them before running against production.

---

## 4. Ongoing schema changes — two verified options

### Option A — `prisma db push` (repo default, simple)

```bash
npx prisma db push --schema=prisma/schema.production.prisma
```

- ✅ Always matches the schema file; no migration files to manage.
- ⚠️ Destructive changes can require a `--accept-data-loss` flag — **that flag is your signal to stop and plan** (§6).
- ⚠️ No history of who changed what, when. Compensate with Git history + a deploy log.

### Option B — `prisma migrate deploy` (formal history)

The **committed** `prisma/migrations/*` are locked to SQLite (`migration_lock.toml`) and cannot be replayed onto PostgreSQL. To use formal migrations:

1. Maintain a PostgreSQL migration line: point a copy of the schema at Postgres with a shadow database and run `prisma migrate dev` to generate SQL migration folders.
2. Apply with `npx prisma migrate deploy --schema=...` in CI.

This is the more auditable path but requires the extra setup above. `NEEDS VERIFICATION` for your team's choice — pick one and stay consistent. Never mix `db push` and `migrate deploy` on the same database.

---

## 5. Connection strings & pooling (critical for stability)

| Variable | Route through | Used for |
| --- | --- | --- |
| `DATABASE_URL` | **pooled** (PgBouncer/RDS Proxy/Cloud SQL connector/Hyperdrive or Prisma `connection_limit`) | the running app |
| `DIRECT_URL` | **direct** to the instance | migrations / `db push` |

Why: every Next.js server instance keeps its own Prisma connection pool. Unbounded × many instances = exhausted `max_connections`.

```text
DATABASE_URL="postgresql://app_user:YOUR_DB_PASSWORD@POOLED_HOST:5432/acquisitionos?sslmode=require&connection_limit=10&pool_timeout=20"
DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@DB_HOST:5432/acquisitionos?sslmode=require"
```

Budget check (do this after choosing instance size):

```text
total_connections_needed ≈ app_instances × connection_limit (+ scheduler/one-off jobs margin)
keep total < max_connections (instance default varies; check your cloud docs)
```

On serverless-style platforms prefer the platform pooler; on Container Apps/ECS/Cloud Run with a handful of instances, `connection_limit=10` per instance is a sane start.

---

## 6. Zero/minimal-downtime schema changes

The **expand → migrate → contract** pattern (works with `db push` too):

1. **Expand** — add new tables/columns as *nullable* or with defaults; add indexes `CONCURRENTLY`-equivalent (off-peak). Old code ignores them. Deploy app version N+1 that writes both old and new fields if needed.
2. **Migrate** — backfill data in batches:
   ```sql
   UPDATE big_table SET new_col = derived_value WHERE new_col IS NULL LIMIT 1000;  -- loop
   ```
3. **Contract** — only after N+2 is fully rolled out: drop old columns/indexes.

**Hard rules:**

- Never combine a destructive column change with an app release in one step.
- Never run `--accept-data-loss` without a fresh backup and a written rollback plan.
- Test every schema change on staging (or a restored backup copy) first.
- The repo's schema comments (`[MIGRATE-SAFE]`, `[MIGRATE-CAUTION]`, `[MIGRATE-RISK]`, `[CRITICAL-FK]`) already annotate field-level migration risk — honor them. `infra/db-migration-rollback.md` and `scripts/backup/migration-rollback.sh` contain the repo's own rollback procedures.

---

## 7. Backups & restore (summary — details per cloud)

- **Automated backups + PITR** — enable on day one (7–35 days retention). PITR (point-in-time recovery) lets you restore to *any second* within the window — the antidote to bad data writes, not just file loss.
- **Logical dumps** for extra safety (portable across providers):
  ```bash
  pg_dump --no-owner --format=custom "$DIRECT_URL" > aos-$(date +%F).dump
  ```
  The repo also ships shell tooling under `scripts/backup/` (backup.sh, restore.sh, retention.sh, cron-setup.sh) — self-managed approach, useful on VMs; on managed platforms prefer the cloud-native backup.
- **Restore testing** — a backup is real only after a restore proves it. Quarterly: restore latest backup into a scratch instance, run `prisma validate` + app smoke test, record the duration. That duration **is** your realistic RTO.

| Term | Meaning | Realistic target for this app |
| --- | --- | --- |
| **RPO** | max tolerable data loss | 5–15 min (PITR) |
| **RTO** | max tolerable restore time | ≤ 1 h (restore + deploy + verify) |

---

## 8. Monitoring the database

Watch from day one (all four clouds expose these):

- **Connections** (approaching the budget from §5 → alert at 80%)
- **CPU / RAM / disk** (disk-full stops writes — alert at 75%)
- **Replication lag** (if replicas)
- **Slow queries** (pg_stat_statements / Cloud SQL Query Insights / Performance Insights / Query Store)
- **Deadlocks & lock waits**, **cache hit ratio** (< 95% → consider more RAM)

Missing indexes show up as slow queries on `Lead`, `WorkflowRun`, `Notification`-style high-volume tables — the schema already defines the common indexes; verify with `EXPLAIN ANALYZE` before adding more.

---

## 9. Checklist

```text
[ ] Managed PostgreSQL created (TLS enforced, correct region)
[ ] app_user created with least privilege; admin user NOT used by the app
[ ] DATABASE_URL (pooled) + DIRECT_URL (direct) in secret manager
[ ] npx prisma db push --schema=prisma/schema.production.prisma succeeded
[ ] /api/health shows database.status = healthy
[ ] Automated backups + PITR enabled, retention ≥ 7 days
[ ] Restore drill performed once before launch; RTO measured
[ ] Connection budget: instances × connection_limit < max_connections
[ ] Schema-change process documented (db push vs migrate deploy — one only)
[ ] Monitoring/alerts on connections, CPU, disk, slow queries
```
