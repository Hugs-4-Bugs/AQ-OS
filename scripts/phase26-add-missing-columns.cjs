// PHASE 26 STABILIZATION — Additive migration for missing COLUMNS
//
// Four columns exist in the Prisma schema but are missing from the live
// SQLite DB, causing runtime Prisma errors:
//
//   1. AutopilotWorkflow.profileMappings  — Phase 20 niche→profile
//      mapping; missing column causes the autopilot scheduler tick to
//      throw on EVERY heartbeat (every 5 min) and breaks the
//      autopilot page (which queries AutopilotWorkflow rows).
//
//   2. BusinessProfile.isDefault          — used by profile CRUD.
//
//   3. DiscoveryJob.outcome               — discovery job outcome
//      summary; missing breaks the discovery job listing/detail API.
//
//   4. DiscoveryJob.targetingJson          — JSON targeting snapshot
//      (multi-country + city snapshot); missing breaks discovery job
//      reads.
//
// This migration is STRICTLY ADDITIVE:
//   - Backup DB first (timestamped .bak file)
//   - ALTER TABLE ADD COLUMN with safe defaults for each
//   - Verify integrity_check after
//   - Compare row counts of CRITICAL tables before/after to prove no
//     existing data was modified
//   - NO DROP, NO TRUNCATE, NO DELETE
//
// Run: node scripts/phase26-add-missing-columns.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.phase26-missing-cols-pre.bak`;

// Each statement: ADD COLUMN with a type-appropriate default that
// matches the Prisma @default() in schema.prisma.
// SQLite ADD COLUMN with NOT NULL requires a non-NULL default — every
// statement below has one, so existing rows are backfilled safely.
const DDL_STATEMENTS = [
  // AutopilotWorkflow.profileMappings  Prisma: String @default("{}")
  `ALTER TABLE "AutopilotWorkflow" ADD COLUMN "profileMappings" TEXT NOT NULL DEFAULT '{}'`,
  // BusinessProfile.isDefault         Prisma: Boolean @default(false)
  `ALTER TABLE "BusinessProfile" ADD COLUMN "isDefault" INTEGER NOT NULL DEFAULT 0`,
  // DiscoveryJob.outcome              Prisma: String?  (nullable — no default)
  // We ADD as nullable TEXT so existing rows get NULL (schema-compliant).
  `ALTER TABLE "DiscoveryJob" ADD COLUMN "outcome" TEXT`,
  // DiscoveryJob.targetingJson         Prisma: String?  (nullable — no default)
  `ALTER TABLE "DiscoveryJob" ADD COLUMN "targetingJson" TEXT`,
];

const CRITICAL_COUNT_QUERIES = [
  ['User', 'SELECT COUNT(*) c FROM User'],
  ['Subscription', 'SELECT COUNT(*) c FROM Subscription'],
  ['Lead', 'SELECT COUNT(*) c FROM Lead'],
  ['AutopilotRun', 'SELECT COUNT(*) c FROM AutopilotRun'],
  ['WorkflowExecution', 'SELECT COUNT(*) c FROM WorkflowExecution'],
  ['ModelInvocation', 'SELECT COUNT(*) c FROM ModelInvocation'],
  ['ExecutionActivity', 'SELECT COUNT(*) c FROM ExecutionActivity'],
  ['AutopilotWorkflow', 'SELECT COUNT(*) c FROM AutopilotWorkflow'],
  ['BusinessProfile', 'SELECT COUNT(*) c FROM BusinessProfile'],
  ['DiscoveryJob', 'SELECT COUNT(*) c FROM DiscoveryJob'],
];

function snapshotCounts(db) {
  const counts = {};
  for (const [name, q] of CRITICAL_COUNT_QUERIES) {
    try {
      counts[name] = db.prepare(q).get().c;
    } catch (e) {
      counts[name] = `ERROR: ${e.message}`;
    }
  }
  return counts;
}

function main() {
  console.log('=== PHASE 26 — ADDITIVE MISSING-COLUMNS MIGRATION ===');
  console.log('DB path: ' + DB_PATH);

  // ── 1. Backup ──────────────────────────────────────────────────
  console.log('Step 1: Backup DB → ' + BACKUP_PATH);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const origSize = fs.statSync(DB_PATH).size;
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log('  Original size:  ' + origSize + ' bytes');
  console.log('  Backup size:    ' + backupSize + ' bytes');
  if (origSize !== backupSize) {
    console.error('  ABORT: backup size mismatch — copy was incomplete');
    process.exit(1);
  }

  // ── 2. Pre-migration counts + integrity ────────────────────────
  const db = new DatabaseSync(DB_PATH);
  console.log('Step 2: Pre-migration integrity check + critical row counts');
  const preIntegrity = db.prepare('PRAGMA integrity_check').get();
  console.log('  integrity: ' + JSON.stringify(preIntegrity));
  const preCounts = snapshotCounts(db);
  console.log('  pre counts: ' + JSON.stringify(preCounts));

  // ── 3. Apply additive DDL ───────────────────────────────────────
  console.log('Step 3: Apply additive DDL (ALTER TABLE ADD COLUMN)');
  // Note: SQLite does not allow ADD COLUMN inside a transaction with
  // other DDL — execute one at a time and treat any "duplicate column"
  // error as a no-op success (idempotent).
  for (const ddl of DDL_STATEMENTS) {
    try {
      db.exec(ddl);
      console.log('  ✓ ' + ddl);
    } catch (err) {
      if (err.message && err.message.includes('duplicate column name')) {
        console.log('  (skip, already exists) ' + ddl);
      } else {
        console.error('  ABORT: DDL failed: ' + err.message);
        db.close();
        process.exit(1);
      }
    }
  }

  // ── 4. Post-migration counts + integrity ────────────────────────
  console.log('Step 4: Post-migration integrity check + critical row counts');
  const postIntegrity = db.prepare('PRAGMA integrity_check').get();
  console.log('  integrity: ' + JSON.stringify(postIntegrity));
  const postCounts = snapshotCounts(db);
  console.log('  post counts: ' + JSON.stringify(postCounts));

  // ── 5. Verify columns now exist ──────────────────────────────────
  console.log('Step 5: Verify all four columns now exist');
  const checks = [
    ['AutopilotWorkflow', 'profileMappings'],
    ['BusinessProfile', 'isDefault'],
    ['DiscoveryJob', 'outcome'],
    ['DiscoveryJob', 'targetingJson'],
  ];
  for (const [tbl, col] of checks) {
    const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
    const present = cols.includes(col);
    console.log(`  ${tbl}.${col}: ${present ? 'PRESENT ✓' : 'STILL MISSING ✗'}`);
  }

  // ── 6. Verify counts unchanged ──────────────────────────────────
  console.log('Step 6: Verify critical row counts unchanged');
  let allMatch = true;
  for (const [name, afterVal] of Object.entries(postCounts)) {
    const beforeVal = preCounts[name];
    if (String(beforeVal) === String(afterVal)) {
      console.log(`  ✓ ${name}: ${beforeVal} → ${afterVal}`);
    } else {
      console.log(`  ✗ ${name}: ${beforeVal} → ${afterVal}  (DIFFERENT)`);
      allMatch = false;
    }
  }

  // ── 7. Foreign-key consistency ───────────────────────────────────
  console.log('Step 7: Foreign-key consistency check');
  db.exec('PRAGMA foreign_keys = ON');
  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  console.log('  foreign_key_check: ' + (fkCheck.length === 0 ? 'OK (0 violations)' : `${fkCheck.length} VIOLATIONS`));

  db.close();

  if (!allMatch) {
    console.error('=== ABORT: row count drift detected — investigate before continuing ===');
    process.exit(1);
  }
  console.log('=== MIGRATION COMPLETE — additive only, all critical counts unchanged ===');
}

main();
