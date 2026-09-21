# Database Operations — AcquisitionOS

> Owner: Operations + Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `prisma/schema.prisma`, `scripts/backup/`, `scripts/migrate.sh`, `scripts/migrate-to-postgresql.sh`, `src/lib/db.ts`, `src/lib/db-pool.ts`.

## 1. Current State

- **Provider:** SQLite (`datasource db { provider = "sqlite" }`).
- **File:** `db/custom.db` (or `/tmp/custom.db` fallback in `src/lib/db.ts`).
- **Migration tool:** Prisma Migrate (`bun run db:migrate`) + `db:push` (schema push, no migration history) + `db:generate` (regenerate client).
- **Connection pool:** Prisma's default (SQLite: 1 connection).
- **Backups:** `scripts/backup/backup.sh` (file copy) + `scripts/backup/snapshot.sh` + `scripts/backup/cron-setup.sh`.
- **Target:** PostgreSQL (managed — Supabase or Neon); see [SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md) ADR-012.

## 2. Backup

### What to back up
- The `db/custom.db` file (the entire SQLite database). For PostgreSQL, use `pg_dump` or the provider's managed backups.
- `.env` (separately, encrypted; see [SECRETS-MANAGEMENT.md](../security/SECRETS-MANAGEMENT.md)).
- The `public/` folder (user-uploaded avatars, generated invoices).

### Backup strategy
- **Daily** full backup via `scripts/backup/backup.sh` → copies `db/custom.db` to `db/backups/custom-YYYY-MM-DD.db`.
- **Snapshot** (point-in-time) via `scripts/backup/snapshot.sh` — uses SQLite's online backup API (consistent snapshot without locking the DB for the whole copy).
- **Retention** via `scripts/backup/retention.sh` — keep 30 days of daily backups + 12 months of monthly.
- **Offsite** — copy the daily backup to object storage (S3 / R2) via `scripts/backup/cron-setup.sh`. Configure the destination in the script.
- **For PostgreSQL (when live):** use the provider's PITR (point-in-time recovery) — Supabase/Neon offer this; configure 7-day PITR + 30 daily snapshots.

### Backup verification
- **Weekly** — restore the latest backup to a test instance; verify a smoke test passes; verify row counts match production.
- **Monthly** — restore a random older backup; verify integrity.

### Backup commands
```bash
# Manual backup
./scripts/backup/backup.sh

# Snapshot (online, consistent)
./scripts/backup/snapshot.sh

# Restore from a backup
./scripts/backup/restore.sh <backup-file>

# Set up the cron schedule (daily 02:00, retention runs weekly)
./scripts/backup/cron-setup.sh

# Apply retention (delete backups older than the policy)
./scripts/backup/retention.sh
```

## 3. Restore

### From a SQLite file backup
1. Stop the app (or put it in maintenance mode).
2. `./scripts/backup/restore.sh <backup-file>` — copies the backup over `db/custom.db` (the script prompts for confirmation).
3. Restart the app.
4. Smoke test (signin, lead list, billing).
5. Investigate the root cause before accepting new writes.

### From a PostgreSQL PITR (when live)
1. Use the provider's restore-to-timestamp feature (Supabase/Neon).
2. Verify in a branch / staging first.
3. Promote the restored branch to production (or fail back to the original).

### Point-in-time recovery (SQLite)
- SQLite doesn't natively support PITR. The daily backup is the granularity. **For finer recovery, migrate to PostgreSQL** (ADR-012).

## 4. Migrations

### Safe migration workflow
1. **In dev:** edit `prisma/schema.prisma`; `bun run db:push` to apply to the dev DB.
2. **Test** the change end-to-end in dev.
3. **Generate the migration:** `bun run db:migrate -- --name describe_the_change` (creates a SQL file in `prisma/migrations/`).
4. **Review the generated SQL** — ensure it's not destructive; if it is, add a backfill first.
5. **Test the migration against a copy of the production DB:**
   ```bash
   cp db/custom.db db/custom.db.test
   DATABASE_URL=file:./db/custom.db.test bun run db:migrate deploy
   ```
6. **Back up production** before applying (see §2).
7. **Apply in production:** `bun run db:migrate deploy` (or `db:push` for schema-push without history).
8. **Smoke test** production.

### Destructive migrations (DROP / type-change)
- **Never** run a destructive migration without:
  1. A backup.
  2. A backfill plan (if the column is being dropped, archive the data first).
  3. A down-migration (the reverse SQL, tested).
  4. A maintenance window (for large tables; the migration locks the DB).

### Migration failure
- If `db:migrate deploy` fails:
  1. The DB is in a half-applied state; Prisma marks the migration as failed in the `_prisma_migrations` table.
  2. **Don't** just re-run; first inspect the failure (the SQL error).
  3. Fix the SQL or the schema; re-run.
  4. If the DB is corrupted, restore from the backup taken before the migration.

### SQLite → PostgreSQL migration (ADR-012)
- Follow the phased plan in `prisma/schema.prisma` (header):
  - Phase 1: User, Organization, FeatureFlag, PlanEntitlement.
  - Phase 2: Subscription, CreditsLedger, PaymentOrder, Coupon.
  - Phase 3: Lead, PipelineStage, OutreachSequence.
  - Phase 4: EmailAccount, Conversation, AiChatSession.
  - Phase 5: All remaining tables.
- Use `scripts/migrate-to-postgresql.sh` (the script wraps the phases).
- Verify FK integrity at each phase.
- Test against a copy of production first.

## 5. Connection Pool Management

### Current (SQLite)
- Prisma's SQLite driver uses 1 connection. No pool to manage.
- The `src/lib/db-pool.ts` module exists but is a no-op for SQLite.

### PostgreSQL (when live)
- **`connection_limit`** in the `DATABASE_URL` query string (`?connection_limit=10`).
- **`directUrl`** for migrations + connection pooling through PgBouncer (Supabase/Neon provide this).
- **Pool sizing rule:** `num_instances × connection_limit ≤ max_connections × 0.8`. Leave headroom for migrations + admin queries.
- **Pool exhaustion symptoms:** `Too many connections` errors; request latency spikes; new requests fail. **Fix:** reduce `connection_limit` per instance, or scale the DB's `max_connections`.

## 6. Performance Operations

### Slow queries
- Enable Prisma query logging in dev: `prisma: { log: ['query', 'warn', 'error'] }` in `src/lib/db.ts`.
- In production, sample 1% of queries (the `api-logger.ts` logs duration).
- For PostgreSQL, use `pg_stat_statements` to find the slow queries.
- Add indexes for queries that scan > 1k rows. Use `EXPLAIN ANALYZE` to verify.

### Vacuum / analyze (PostgreSQL)
- `VACUUM ANALYZE` is auto-managed by the provider. Manual `VACUUM FULL` only on extreme bloat (locks the table).

### Indexes
- Review the schema's indexes quarterly. Drop unused indexes (they slow down writes).
- For PostgreSQL, `pg_stat_user_indexes` shows usage.

## 7. Common DB Issues + Fixes

| Issue | Cause | Fix |
|---|---|---|
| `SQLITE_BUSY: database is locked` | Concurrent writers (SQLite single-writer) | Retry with backoff; migrate to PostgreSQL (ADR-012) |
| `Too many connections` (Postgres) | Pool exhaustion | Reduce `connection_limit`; scale DB |
| `relation does not exist` | Migration not applied | `bun run db:migrate deploy` |
| `column does not exist` | Schema drift (code expects a column the DB doesn't have) | Apply the migration; or revert the code |
| `Prisma Client not generated` | Schema changed but `db:generate` not run | `bun run db:generate` |
| `db/custom.db does not exist` | First deploy / file deleted | `bun run db:push` (creates the file) or restore from backup |
| DB file growing unbounded | Logs / audit data / RAG content | Apply retention (see [DATA-PRIVACY-POLICY.md](../security/DATA-PRIVACY-POLICY.md)); vacuum |
| Query times out | Slow query / DB load | Add an index; tune the query; scale the DB |

## 8. Maintenance Window

For destructive migrations or major upgrades:
1. Announce 48 h in advance (email + in-app banner).
2. Put the app in maintenance mode (a feature flag or a 503 from the gateway).
3. Back up the DB.
4. Run the migration.
5. Smoke test.
6. Take the app out of maintenance mode.
7. Confirm in the status page.

## 9. Review Cadence

- **Weekly** — verify the latest backup restored cleanly.
- **Monthly** — review slow queries; review index usage; review storage growth.
- **Quarterly** — review the retention policy; review the backup-restore drill results; review the migration plan for the next quarter.

---

*See also: [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md), [../technical/DATABASE-SCHEMA.md](../technical/DATABASE-SCHEMA.md), [../technical/SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md), [../security/DATA-PRIVACY-POLICY.md](../security/DATA-PRIVACY-POLICY.md), [../security/SECRETS-MANAGEMENT.md](../security/SECRETS-MANAGEMENT.md), `scripts/backup/`.*
