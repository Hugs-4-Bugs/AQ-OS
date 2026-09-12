# AcquisitionOS — PostgreSQL Migration Report

**Phase L9: Production Database Migration Path**
**Generated:** 2025-07-10
**Schema Version:** v2.0 (86 models, 150+ indexes)

---

## Table of Contents

1. [Current Database State](#1-current-database-state)
2. [Schema Changes Required](#2-schema-changes-required)
3. [SQLite-Specific Code Patterns to Fix](#3-sqlite-specific-code-patterns-to-fix)
4. [Connection Pooling Recommendations](#4-connection-pooling-recommendations)
5. [Production Indexing Strategy](#5-production-indexing-strategy)
6. [Backup Strategy](#6-backup-strategy)
7. [Restore Strategy](#7-restore-strategy)
8. [Migration Strategy (Prisma Migrate)](#8-migration-strategy-prisma-migrate)
9. [Environment Variables](#9-environment-variables)
10. [Migration Checklist](#10-migration-checklist)

---

## 1. Current Database State

### Database Engine
| Property | Value |
|---|---|
| **Engine** | SQLite (via Prisma) |
| **Schema File** | `prisma/schema.prisma` |
| **Provider** | `provider = "sqlite"` |
| **Connection** | `url = env("DATABASE_URL")` — file-based (`file:./dev.db`) |
| **Models** | 86 |
| **Indexes** | 150+ `@@index` declarations |
| **ID Strategy** | `cuid()` on all models (String PKs) |
| **Migration Tool** | `prisma db push` (no migration history) |
| **Migrations Directory** | `prisma/migrations/` — **EMPTY** (no migration history exists) |

### Known Limitations (from worklog Phase L3 audit)
- **Item 9 (MEDIUM):** SQLite not suitable for production concurrent writes
- Server crashes after ~3-4 consecutive requests due to memory constraints (SQLite file locking contributes)
- All 86 models use `cuid()` string IDs — **no autoincrement Int IDs** to worry about

---

## 2. Schema Changes Required

### 2.1 Datasource Configuration

**File:** `prisma/schema.prisma`

```diff
  datasource db {
-   provider = "sqlite"
-   url      = env("DATABASE_URL")
+   provider = "postgresql"
+   url      = env("DATABASE_URL")
+   directUrl = env("DIRECT_URL")   // Optional: for migrations/Prisma Migrate
  }
```

> **Note:** The `directUrl` is optional but recommended for Prisma Migrate to bypass connection poolers during schema changes.

### 2.2 ID Strategy (No Change Needed)

All 86 models use `String @id @default(cuid())`. Since `cuid()` generates string IDs, they map directly to PostgreSQL `TEXT` columns without issue. **No `@db.Uuid` or `@db.BigInt` annotations are required** unless you want to migrate to native UUIDs later (see Section 2.4).

### 2.3 DateTime Fields (Automatic Mapping)

SQLite stores `DateTime` as ISO-8601 text. PostgreSQL maps `DateTime` to `timestamp(3)`. Prisma handles this automatically — **no schema changes needed** for the 100+ `DateTime` fields across the 86 models.

If you want explicit control, you can add `@db.Timestamp(3)` but it is optional:
```prisma
  createdAt DateTime @default(now()) @db.Timestamp(3)  // Optional
```

### 2.4 Float Fields (Float → Double consideration)

Several models use `Float` for monetary values (`amount`, `subtotal`, `total`, `pricePaid`, etc.). In PostgreSQL, `Float` maps to `REAL` (32-bit). For financial data, consider changing to `Double` (maps to `DOUBLE PRECISION`, 64-bit):

| Model | Field | Current | Recommendation |
|---|---|---|---|
| `PaymentOrder` | `amount`, `subtotal`, `taxAmount`, `discountAmount` | `Float` | Change to `Double` |
| `CreditAddon` | `pricePaid` | `Float` | Change to `Double` |
| `Invoice` | `subtotal`, `taxAmount`, `total` | `Float` | Change to `Double` |
| `Coupon` | `discountValue` | `Float` | Change to `Double` |
| `TaxRate` | `rate` | `Float` | Change to `Double` |
| `Lead` | `replyScore`, `conversionScore`, `urgencyScore`, `revenuePotentialScore` | `Float` | Keep as `Float` (scores, not money) |
| `Rating` | `rating` | `Float?` | Keep as `Float` |

### 2.5 Boolean Fields (No Change)

SQLite stores booleans as `0`/`1` integers. PostgreSQL has native `BOOLEAN`. Prisma handles the mapping automatically — **no schema changes needed**.

### 2.6 Enum Handling

The schema uses `String` fields with comment-based enum documentation (e.g., `status String @default("draft") // draft, active, paused, completed`). This is **Prisma-compatible with PostgreSQL** as-is. No changes needed.

### 2.7 JSON Fields

Multiple models store JSON as `String` fields (e.g., `tags String @default("[]")`, `metadata String? // JSON`). In PostgreSQL, these could optionally be changed to `Json` type for native JSON querying, but this is **not required** for migration. Recommend keeping as `String` initially and converting selectively later.

### 2.8 Optional: Native UUID

If you want native UUIDs for better index performance:

```prisma
  id String @id @default(uuid()) @db.Uuid
```

> **Warning:** This changes ID format from `clxyz...` CUID to `550e8400-e29b-...` UUID. Requires a data migration to update all foreign key references. **Not recommended for initial migration — do this as a follow-up task.**

---

## 3. SQLite-Specific Code Patterns to Fix

### 3.1 CRITICAL — Raw SQLite Commands (`PRAGMA`)

**File:** `src/lib/performance/db-optimizer.ts`

Three SQLite-specific raw SQL commands will **crash** on PostgreSQL:

| Line | Code | Fix |
|---|---|---|
| 226 | `await db.$executeRawUnsafe('PRAGMA optimize')` | Replace with `ANALYZE` (PostgreSQL equivalent) or remove |
| 245 | `await db.$executeRawUnsafe('ANALYZE')` | This **works in PostgreSQL too** — keep as-is |
| 264 | `await db.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')` | Remove — PostgreSQL handles WAL internally |

**Recommended replacement for `optimizeDatabase()`:**

```typescript
export async function optimizeDatabase(): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = [];

  // PostgreSQL: ANALYZE updates statistics for the query planner
  const analyzeStart = performance.now();
  try {
    await db.$executeRawUnsafe('ANALYZE');
    results.push({
      action: 'ANALYZE',
      success: true,
      details: 'Table statistics updated for query planner',
      durationMs: performance.now() - analyzeStart,
    });
  } catch (error) {
    results.push({ action: 'ANALYZE', success: false, details: String(error), durationMs: performance.now() - analyzeStart });
  }

  // PostgreSQL: VACUUM ANALYZE reclaims space (run during low-traffic)
  // NOTE: VACUUM FULL locks tables — use regular VACUUM in production
  const vacuumStart = performance.now();
  try {
    await db.$executeRawUnsafe('VACUUM');
    results.push({
      action: 'VACUUM',
      success: true,
      details: 'Dead tuples reclaimed (non-blocking)',
      durationMs: performance.now() - vacuumStart,
    });
  } catch (error) {
    results.push({ action: 'VACUUM', success: false, details: String(error), durationMs: performance.now() - vacuumStart });
  }

  return results;
}
```

### 3.2 CRITICAL — `sqlite_master` Direct Query

**File:** `src/app/api/admin/backup/route.ts` (line 210)

```typescript
`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null`
```

This invokes the `sqlite3` CLI tool directly via `exec()`. **Will fail on PostgreSQL.**

**Fix:** Replace with Prisma query or PostgreSQL equivalent:

```typescript
async function getBackupRecordCount(): Promise<number> {
  try {
    // Use Prisma to count models or query information_schema
    const result = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`
    );
    return Number(result[0]?.count) || 0;
  } catch {
    return 0;
  }
}
```

Also update the `dbPath` extraction (line 207) which assumes `file:` prefix:
```typescript
// Remove SQLite-specific path extraction
const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
```

### 3.3 CRITICAL — EXPLAIN QUERY PLAN Format

**File:** `src/lib/performance/db-optimizer.ts` (line 140)

```typescript
await db.$queryRawUnsafe<{ id: number; parent: number; notused: number; detail: string }[]>(
  `EXPLAIN QUERY PLAN ${sql}`
);
```

SQLite's `EXPLAIN QUERY PLAN` returns columns `{id, parent, notused, detail}`. PostgreSQL's `EXPLAIN` returns a different format (text-based or JSON with `EXPLAIN (FORMAT JSON)`).

**Fix:** Use PostgreSQL's EXPLAIN:

```typescript
export async function analyzeQueryPerformance(sql: string): Promise<ExplainPlan> {
  try {
    const result = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN ${sql}`
    );
    const plan = result.map(r => r["QUERY PLAN"]);
    const usesIndex = plan.some(line => line.toUpperCase().includes('INDEX') || line.toUpperCase().includes('BITMAP'));
    const tableScans = plan
      .filter(line => line.toUpperCase().includes('SEQ SCAN'))
      .map(line => {
        const match = line.match(/SEQ SCAN ON (\w+)/i);
        return match ? match[1] : line;
      });

    return { sql, plan, usesIndex, tableScans };
  } catch (error) {
    return { sql, plan: [`Error: ${error}`], usesIndex: false, tableScans: [] };
  }
}
```

### 3.4 MEDIUM — Observability Tracing Hardcoded to SQLite

**File:** `src/lib/observability/tracing.ts` (line 225)
```typescript
span.setAttribute('db.system', 'sqlite');
```

**File:** `src/lib/observability/tracer.ts` (line 114)
```typescript
'db.system': 'sqlite',
```

**Fix:** Make dynamic based on provider:
```typescript
span.setAttribute('db.system', process.env.DATABASE_URL?.startsWith('postgresql') ? 'postgresql' : 'sqlite');
```

### 3.5 MEDIUM — Connection Pool Stats Stub

**File:** `src/lib/db.ts` (lines 207-219)

Currently returns hardcoded `{ activeConnections: 1, idleConnections: 0, totalConnections: 1, waitingCount: 0 }` because "SQLite doesn't have a traditional connection pool."

**Fix:** Implement real PostgreSQL pool stats:
```typescript
export async function getConnectionPoolStats(): Promise<ConnectionPoolStats> {
  if (process.env.DATABASE_URL?.startsWith('postgres')) {
    const result = await db.$queryRawUnsafe<{ count: number; state: string }[]>(
      `SELECT count(*)::int as count, state FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`
    );
    // ...parse result
  }
  return { activeConnections: 1, idleConnections: 0, totalConnections: 1, waitingCount: 0 };
}
```

### 3.6 MEDIUM — Health Check SQLite-Specific Logic

**File:** `src/app/api/health/detailed/route.ts` (lines 131-155)

Checks SQLite file size using `statSync()`:
```typescript
if (dbPath && dbPath !== ':memory:') {
  const stats = statSync(realPath);
  const sizeMB = stats.size / (1024 * 1024);
  const maxSizeMB = 1024; // 1GB warning threshold for SQLite
}
```

**Fix:** Replace with PostgreSQL database size query:
```typescript
const result = await db.$queryRawUnsafe<{ size_mb: number }[]>(
  `SELECT pg_database_size(current_database()) / 1024 / 1024 AS size_mb`
);
const sizeMB = Number(result[0]?.size_mb) || 0;
```

### 3.7 LOW — Comments Referencing SQLite

Several files have comments referencing SQLite that should be updated:

| File | Line | Comment |
|---|---|---|
| `src/lib/vector-search-service.ts` | 6 | `SQLite-compatible JSON storage for embedding vectors` |
| `src/lib/rag-enhanced-service.ts` | 9 | `TF-IDF based keyword search (since we use SQLite, no vector DB)` |
| `src/lib/broadcast-service.ts` | 144 | `Batch create targets (in chunks of 100 for SQLite)` |
| `src/lib/workflow-dead-letter.ts` | 205 | `Manual grouping since SQLite groupBy on text` |
| `src/app/api/leads/search/route.ts` | 47 | `Text search (SQLite LIKE-based)` |
| `src/lib/db.ts` | 207 | `SQLite doesn't have a traditional connection pool` |
| `src/lib/performance/db-optimizer.ts` | 341 | `Build WHERE clause ordering for SQLite optimization` |

### 3.8 LOW — Backup/Routes SQLite Type Detection

**File:** `src/app/api/admin/backup/route.ts` (line 56)
```typescript
const backupType = name.startsWith('sqlite') ? 'sqlite' : ...
```

**File:** `src/app/api/admin/backup/[id]/route.ts` (line 202)
```typescript
const typeFlag = backupType === 'postgres' ? '--type postgres' : '--type sqlite';
```

These have PostgreSQL detection already but should be updated to default to PostgreSQL after migration.

### 3.9 Full Breakage Risk Summary

| Severity | File | Issue | Lines |
|---|---|---|---|
| **CRITICAL** | `src/lib/performance/db-optimizer.ts` | `PRAGMA optimize`, `PRAGMA wal_checkpoint` will throw errors | 226, 264 |
| **CRITICAL** | `src/app/api/admin/backup/route.ts` | `sqlite3` CLI call, `sqlite_master` query | 207-210 |
| **CRITICAL** | `src/lib/performance/db-optimizer.ts` | `EXPLAIN QUERY PLAN` result format mismatch | 140-144 |
| **MEDIUM** | `src/lib/observability/tracing.ts` | Hardcoded `'sqlite'` in span attribute | 225 |
| **MEDIUM** | `src/lib/observability/tracer.ts` | Hardcoded `'sqlite'` in span attributes | 114 |
| **MEDIUM** | `src/lib/db.ts` | Connection pool stats stub assumes SQLite | 207-219 |
| **MEDIUM** | `src/app/api/health/detailed/route.ts` | SQLite file size check logic | 131-155 |
| **LOW** | 7 files | SQLite comments, chunk sizes, text search | Various |

---

## 4. Connection Pooling Recommendations

### 4.1 Recommended Architecture

```
App (Next.js) → PgBouncer (pool) → PostgreSQL
```

### 4.2 PgBouncer Configuration

| Setting | Value | Rationale |
|---|---|---|
| **Pool Mode** | `transaction` | Each transaction gets a connection; released at tx end. Safe for Prisma. |
| **Max Client Connections** | 100 | App-level connections |
| **Default Pool Size** | 20 | Actual PostgreSQL connections |
| **Min Pool Size** | 5 | Keep warm connections |
| **Reserve Pool Size** | 5 | Spike handling |
| **Server Idle Timeout** | 60 | Reclaim unused PG connections |
| **Server Lifetime** | 3600 | Rotate connections periodically |
| **Server Connect Timeout** | 15 | Fail fast on PG unavailability |

### 4.3 PostgreSQL `postgresql.conf` Tuning

| Setting | Value | Rationale |
|---|---|---|
| `max_connections` | 100 | PG-side max connections |
| `shared_buffers` | 256MB-1GB (25% of RAM) | Main cache |
| `effective_cache_size` | 1GB-4GB (75% of RAM) | Query planner hint |
| `work_mem` | 16MB-64MB | Sort/hash memory per operation |
| `maintenance_work_mem` | 256MB | VACUUM/ANALYZE/CREATE INDEX |
| `wal_level` | `replica` | Enables WAL archiving |
| `max_wal_size` | 2GB | WAL recycling threshold |
| `checkpoint_completion_target` | 0.9 | Spread checkpoint I/O |
| `random_page_cost` | 1.1 | SSD assumption for query planner |
| `default_statistics_target` | 100 | Good enough for most queries |

### 4.4 Prisma Connection Pool

Prisma's built-in connection pool (via `@prisma/client`) works well with PgBouncer in transaction mode:

```typescript
// src/lib/db.ts — no changes needed for basic PgBouncer compatibility
export const db = new PrismaClient({
  log: [...existing logs...],
})
```

> **Important:** Do NOT set `connection_limit` in DATABASE_URL when using PgBouncer. Let PgBouncer manage pooling.

### 4.5 Connection Limits Reference

| Component | Connections | Notes |
|---|---|---|
| Next.js (serverless) | Up to 100 per instance | Depends on concurrent requests |
| PgBouncer | 100 client conns → 20 PG conns | 5:1 multiplexing |
| PostgreSQL | 20 direct + 100 via PgBouncer | Keep PG-side low |

---

## 5. Production Indexing Strategy

### 5.1 Current Index State (Good)

The schema already has 150+ `@@index` declarations covering all foreign keys, status fields, timestamps, and commonly queried columns. **These will carry over to PostgreSQL automatically via Prisma Migrate.**

### 5.2 Recommended Additional Indexes for PostgreSQL

Add these via a custom SQL migration after the base migration:

```sql
-- Composite indexes for common query patterns

-- Lead search: filter by org + stage + active
CREATE INDEX CONCURRENTLY idx_lead_org_stage_active
  ON "Lead" ("orgId", "stage", "isActive")
  WHERE "isActive" = true;

-- Lead search: filter by user + stage + active
CREATE INDEX CONCURRENTLY idx_lead_user_stage_active
  ON "Lead" ("userId", "stage", "isActive")
  WHERE "isActive" = true;

-- Outreach messages: sent messages by lead + channel for conversation threading
CREATE INDEX CONCURRENTLY idx_outreach_lead_channel_sent
  ON "OutreachMessage" ("leadId", "channel", "sentAt")
  WHERE "sentAt" IS NOT NULL;

-- Notifications: unread by user (most common query)
CREATE INDEX CONCURRENTLY idx_notification_user_unread
  ON "Notification" ("userId", "createdAt" DESC)
  WHERE "read" = false;

-- Workflow executions: active by workflow
CREATE INDEX CONCURRENTLY idx_workflow_exec_active
  ON "WorkflowExecution" ("workflowId", "startedAt" DESC)
  WHERE "status" IN ('running', 'paused');

-- Credits ledger: balance tracking by user
CREATE INDEX CONCURRENTLY idx_credits_ledger_user_created
  ON "CreditsLedger" ("userId", "createdAt" DESC);

-- Email messages: inbox by thread (latest first)
CREATE INDEX CONCURRENTLY idx_email_message_thread_created
  ON "EmailMessage" ("threadId", "createdAt" DESC);

-- Audit logs: recent activity by user
CREATE INDEX CONCURRENTLY idx_audit_log_user_recent
  ON "AuditLog" ("userId", "createdAt" DESC);

-- Sessions: non-expired sessions for cleanup
CREATE INDEX CONCURRENTLY idx_session_expires
  ON "UserSession" ("expiresAt")
  WHERE "isRevoked" = false;

-- Sequence enrollments: active by nextSendAt (for cron jobs)
CREATE INDEX CONCURRENTLY idx_seq_enrollment_nextsend
  ON "SequenceEnrollment" ("nextSendAt")
  WHERE "status" = 'active' AND "nextSendAt" IS NOT NULL;
```

### 5.3 Partial Indexes

PostgreSQL supports `WHERE` clauses on indexes (partial indexes). These are especially valuable for:

- **Soft-deleted records:** `WHERE deletedAt IS NULL`
- **Status filtering:** `WHERE status = 'active'`
- **Boolean flags:** `WHERE isActive = true`

The 150+ existing `@@index` in the schema will become standard B-tree indexes. The partial indexes above add query-specific optimization.

### 5.4 Full-Text Search (Future Enhancement)

Currently, lead search uses `LIKE`/`contains` (Prisma translates to `ILIKE` in PostgreSQL). For production at scale, consider:

```sql
-- PostgreSQL full-text search
ALTER TABLE "Lead" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce("businessName", '') || ' ' ||
      coalesce("ownerName", '') || ' ' ||
      coalesce("email", '') || ' ' ||
      coalesce("niche", '') || ' ' ||
      coalesce("city", '') || ' ' ||
      coalesce("country", '')
    )
  ) STORED;

CREATE INDEX idx_lead_search ON "Lead" USING GIN ("search_vector");
```

> **Note:** This is a follow-up optimization, not required for initial migration.

---

## 6. Backup Strategy

### 6.1 pg_dump (Logical Backups)

**Frequency:** Daily full + Hourly incremental (via WAL archiving)

```bash
# Full backup (daily at 2 AM via cron)
pg_dump -Fc -f /opt/acquisitionos/backups/postgres/full_$(date +%Y%m%d_%H%M%S).dump \
  "postgresql://user:pass@localhost:5432/acquisitionos"

# Custom format allows parallel restore
pg_restore -j 4 -d acquisitionos backup.dump
```

### 6.2 WAL Archiving (Point-in-Time Recovery)

Configure in `postgresql.conf`:

```conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /opt/acquisitionos/backups/wal/%f'
archive_timeout = 300   # 5 minutes max between WAL switches
```

This enables recovery to any point in time within the WAL retention window.

### 6.3 pg_basebackup (Physical Backups)

For faster restore of the entire cluster:

```bash
pg_basebackup -h localhost -D /opt/acquisitionos/backups/physical/ \
  -Ft -z -P --checkpoint=fast
```

### 6.4 Backup Retention Policy

| Backup Type | Retention | Schedule |
|---|---|---|
| Full logical (pg_dump) | 30 days | Daily at 2 AM |
| WAL archives | 7 days | Continuous |
| Physical (pg_basebackup) | 7 days | Weekly |

### 6.5 Monitoring

- Monitor `pg_stat_archiver` for archiving failures
- Alert if WAL archive directory exceeds 80% disk
- Verify backup integrity weekly with `pg_restore --list`

---

## 7. Restore Strategy

### 7.1 Full Restore from pg_dump

```bash
# Create fresh database
createdb acquisitionos_restored

# Restore (parallel for speed)
pg_restore -j 4 -d acquisitionos_restored \
  /opt/acquisitionos/backups/postgres/full_20250710.dump

# Verify
psql -d acquisitionos_restored -c "SELECT count(*) FROM \"User\";"
```

### 7.2 Point-in-Time Recovery (PITR)

```bash
# 1. Stop PostgreSQL
pg_ctl stop -m fast

# 2. Restore from base backup
cp -r /opt/acquisitionos/backups/physical/* /var/lib/postgresql/data/

# 3. Create recovery configuration
cat > /var/lib/postgresql/data/recovery.conf << EOF
restore_command = 'cp /opt/acquisitionos/backups/wal/%f %p'
recovery_target_time = '2025-07-10 14:30:00'
recovery_target_action = 'promote'
EOF

# 4. Start PostgreSQL (enters recovery mode)
pg_ctl start

# 5. PostgreSQL replays WAL up to target time, then promotes
```

### 7.3 Data Migration Script (SQLite → PostgreSQL)

Since there is no migration history, the recommended approach is:

```bash
# 1. Export data from SQLite
sqlite3 dev.db .dump > /tmp/sqlite_dump.sql

# 2. Set up new PostgreSQL database
npx prisma migrate dev --name init

# 3. Use a migration tool (recommended: pgloader)
pgloader /tmp/sqlite_load.ini
```

**pgloader configuration (`sqlite_load.ini`):**
```ini
LOAD DATABASE
  FROM sqlite:///path/to/dev.db
  INTO postgresql://user:pass@localhost:5432/acquisitionos

WITH include drop, create tables, create indexes,
     reset sequences

CAST type datetime to timestamptz
CAST type integer to integer
```

> **Alternative:** Use Prisma's seed script to re-populate from CSV exports if the SQLite database has minimal production data.

---

## 8. Migration Strategy (Prisma Migrate)

### 8.1 Why Migrate (Not `db push`)

- `prisma db push` does not create migration files — no rollback capability
- `prisma db push` cannot handle data transformations
- Production requires auditable, reversible migrations
- Current project has **zero migration files** in `prisma/migrations/`

### 8.2 Step-by-Step Migration Process

#### Phase 1: Baseline (Development)

```bash
# 1. Create a baseline migration against the CURRENT SQLite schema
# This captures the current schema as the first migration
npx prisma migrate dev --name init --create-only

# 2. This will fail if the DB already exists — resolve with:
npx prisma migrate resolve --applied init

# 3. Switch provider to postgresql in schema.prisma
# (Make the provider change in schema.prisma)

# 4. Start fresh PostgreSQL database
npx prisma migrate dev --name init_postgresql
```

> **Warning:** Prisma Migrate cannot transition between providers in the same migration history. You must **reset** the migration history when switching from SQLite to PostgreSQL.

#### Phase 2: Clean Migration Path

```bash
# 1. Set up PostgreSQL database
createdb acquisitionos

# 2. Apply schema from scratch
npx prisma migrate dev --name "000_init_postgresql"

# 3. Verify all 86 tables created
npx prisma db execute --stdin <<EOF
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
EOF

# 4. Seed data (if applicable)
npx prisma db seed
```

#### Phase 3: Data Migration (if needed)

```bash
# Option A: pgloader (for existing SQLite data)
pgloader sqlite_load.ini

# Option B: Re-seed (for dev/test environments)
npx prisma db seed

# Option C: Manual export/import
# Export from SQLite → Transform → Import to PostgreSQL
```

#### Phase 4: Production Deployment

```bash
# 1. Create migration in dev
npx prisma migrate dev --name "production_ready"

# 2. Deploy migration to production
npx prisma migrate deploy

# 3. Verify
npx prisma migrate status
```

### 8.3 Migration Safety Checklist

- [ ] All `prisma/migrations/` files committed to git
- [ ] Migration tested on staging environment
- [ ] Rollback procedure documented (`npx prisma migrate resolve --rolled-back <name>`)
- [ ] Database backup taken BEFORE applying migration
- [ ] Application code changes deployed BEFORE or AT THE SAME TIME as migration

---

## 9. Environment Variables

### 9.1 DATABASE_URL Formats

```bash
# Current (SQLite)
DATABASE_URL="file:./dev.db"

# PostgreSQL (with PgBouncer)
DATABASE_URL="postgresql://acquisitionos:PASSWORD@pgbouncer:6432/acquisitionos?pgbouncer=true&connect_timeout=15"

# PostgreSQL (direct — for migrations)
DIRECT_URL="postgresql://acquisitionos:PASSWORD@postgres:5432/acquisitionos"

# PostgreSQL (without PgBouncer — simple setup)
DATABASE_URL="postgresql://acquisitionos:PASSWORD@localhost:5432/acquisitionos"
```

### 9.2 Additional Variables to Add

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."                    # Optional: for Prisma Migrate
DATABASE_POOL_SIZE=20                             # Prisma connection pool (if not using PgBouncer)

# Backup
BACKUP_DIR="/opt/acquisitionos/backups"           # Already exists
PGHOST="localhost"
PGPORT="5432"
PGDATABASE="acquisitionos"
PGUSER="acquisitionos"
PGPASSWORD="***"                                  # Prefer .pgpass file

# Optional: SSL
DATABASE_SSL_MODE="require"                       # For managed PostgreSQL (RDS, Supabase, etc.)
```

### 9.3 `.pgpass` File (Recommended)

```bash
# ~/.pgpass
localhost:5432:acquisitionos:acquisitionos:PASSWORD
```

```bash
chmod 600 ~/.pgpass
```

---

## 10. Migration Checklist

### Pre-Migration
- [ ] Fix 3 CRITICAL SQLite-specific code patterns (Section 3.1-3.3)
- [ ] Fix 4 MEDIUM SQLite-specific patterns (Section 3.4-3.6)
- [ ] Update comments in 7 files (Section 3.7)
- [ ] Switch `provider = "postgresql"` in `prisma/schema.prisma`
- [ ] Consider changing `Float` to `Double` for monetary fields
- [ ] Set up PostgreSQL instance (local, Docker, or managed)
- [ ] Set up PgBouncer (production)
- [ ] Update `DATABASE_URL` environment variable
- [ ] Remove `prisma/migrations/` (empty) or baseline
- [ ] Test `npx prisma migrate dev` against PostgreSQL
- [ ] Run `npx tsc --noEmit` to verify TypeScript compilation

### During Migration
- [ ] Run `npx prisma migrate dev --name "000_init_postgresql"`
- [ ] Verify all 86 tables created in PostgreSQL
- [ ] Verify all 150+ indexes created
- [ ] Verify all foreign keys and cascade rules
- [ ] Seed data if needed (`npx prisma db seed`)
- [ ] Run integration tests

### Post-Migration
- [ ] Run full application smoke test
- [ ] Verify all API endpoints respond correctly
- [ ] Set up automated backups (pg_dump cron + WAL archiving)
- [ ] Configure monitoring (pg_stat_statements, connection pool stats)
- [ ] Add PostgreSQL-specific indexes (Section 5.2)
- [ ] Update observability traces (`db.system = 'postgresql'`)
- [ ] Remove SQLite backup scripts or keep for reference
- [ ] Update health check endpoint for PostgreSQL
- [ ] Document connection pool configuration

### Files Requiring Code Changes

| # | File | Change Type | Priority |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | Provider switch + Float→Double | CRITICAL |
| 2 | `src/lib/performance/db-optimizer.ts` | Replace PRAGMA + EXPLAIN | CRITICAL |
| 3 | `src/app/api/admin/backup/route.ts` | Replace sqlite3 CLI call | CRITICAL |
| 4 | `src/lib/db.ts` | Connection pool stats + hardcoded refs | MEDIUM |
| 5 | `src/app/api/health/detailed/route.ts` | Replace SQLite file size check | MEDIUM |
| 6 | `src/lib/observability/tracing.ts` | Dynamic db.system attribute | MEDIUM |
| 7 | `src/lib/observability/tracer.ts` | Dynamic db.system attribute | MEDIUM |
| 8 | `src/lib/vector-search-service.ts` | Update comment | LOW |
| 9 | `src/lib/rag-enhanced-service.ts` | Update comment | LOW |
| 10 | `src/lib/broadcast-service.ts` | Update chunk comment | LOW |
| 11 | `src/lib/workflow-dead-letter.ts` | Update comment | LOW |
| 12 | `src/app/api/leads/search/route.ts` | Update comment | LOW |
| 13 | `.env` | Update DATABASE_URL | CRITICAL |

---

**Total files to modify:** 13
**Critical changes:** 4 (schema + 3 raw SQL patterns)
**Medium changes:** 4 (pool stats + health check + 2 tracing files)
**Low changes:** 6 (comment updates)

**Estimated effort:** 4-6 hours for code changes + 2-4 hours for migration testing
