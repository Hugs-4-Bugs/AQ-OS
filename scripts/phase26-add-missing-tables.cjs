// PHASE 26 STABILIZATION — Additive migration for missing tables
//
// Two tables exist in the Prisma schema but are missing from the live
// SQLite DB, causing runtime failures:
//
//   1. DailyOutreachUsage  — referenced by src/lib/daily-outreach-quota.ts
//      and called from /api/subscriptions/current. Missing table → the
//      route throws → 503 "Subscription service is temporarily
//      unavailable" → frontend shows "Free Plan" for Elite users.
//
//   2. CustomNiche         — referenced by src/lib/niches.ts (autopilot
//      custom niche CRUD). Missing table → custom niche features broken.
//
// This migration is STRICTLY ADDITIVE:
//   - Backup DB first (timestamped .bak file)
//   - CREATE TABLE IF NOT EXISTS for both tables
//   - CREATE INDEX IF NOT EXISTS for all indexes
//   - Verify integrity_check after
//   - Compare row counts of CRITICAL tables before/after to prove no
//     existing data was modified
//   - NO DROP, NO TRUNCATE, NO DELETE
//
// Run: node scripts/phase26-add-missing-tables.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.phase26-missing-tables-pre.bak`;

const DDL_STATEMENTS = [
  // ── DailyOutreachUsage ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "DailyOutreachUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DailyOutreachUsage_userId_dateKey_key"
     ON "DailyOutreachUsage"("userId", "dateKey")`,
  `CREATE INDEX IF NOT EXISTS "DailyOutreachUsage_userId_idx"
     ON "DailyOutreachUsage"("userId")`,
  `CREATE INDEX IF NOT EXISTS "DailyOutreachUsage_dateKey_idx"
     ON "DailyOutreachUsage"("dateKey")`,

  // ── CustomNiche ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "CustomNiche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nicheKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustomNiche_userId_nicheKey_key"
     ON "CustomNiche"("userId", "nicheKey")`,
  `CREATE INDEX IF NOT EXISTS "CustomNiche_userId_status_idx"
     ON "CustomNiche"("userId", "status")`,
];

const CRITICAL_COUNT_QUERIES = [
  ['User', 'SELECT COUNT(*) c FROM User'],
  ['Subscription', 'SELECT COUNT(*) c FROM Subscription'],
  ['Lead', 'SELECT COUNT(*) c FROM Lead'],
  ['AutopilotRun', 'SELECT COUNT(*) c FROM AutopilotRun'],
  ['WorkflowExecution', 'SELECT COUNT(*) c FROM WorkflowExecution'],
  ['ModelInvocation', 'SELECT COUNT(*) c FROM ModelInvocation'],
  ['ExecutionActivity', 'SELECT COUNT(*) c FROM ExecutionActivity'],
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
  console.log('=== PHASE 26 — ADDITIVE MISSING-TABLES MIGRATION ===');
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
  console.log('Step 3: Apply additive DDL (CREATE TABLE IF NOT EXISTS)');
  db.exec('BEGIN');
  try {
    for (const ddl of DDL_STATEMENTS) {
      db.exec(ddl);
      const firstLine = ddl.split('\n')[0].slice(0, 80);
      console.log('  ✓ ' + firstLine + (ddl.length > 80 ? ' …' : ''));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('  ABORT: DDL failed — rolled back. Error: ' + err.message);
    db.close();
    process.exit(1);
  }

  // ── 4. Post-migration counts + integrity ────────────────────────
  console.log('Step 4: Post-migration integrity check + critical row counts');
  const postIntegrity = db.prepare('PRAGMA integrity_check').get();
  console.log('  integrity: ' + JSON.stringify(postIntegrity));
  const postCounts = snapshotCounts(db);
  console.log('  post counts: ' + JSON.stringify(postCounts));

  // ── 5. Verify tables now exist ──────────────────────────────────
  console.log('Step 5: Verify both tables now exist');
  const t1 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='DailyOutreachUsage'").get();
  const t2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CustomNiche'").get();
  console.log('  DailyOutreachUsage: ' + (t1 ? 'PRESENT ✓' : 'STILL MISSING ✗'));
  console.log('  CustomNiche:        ' + (t2 ? 'PRESENT ✓' : 'STILL MISSING ✗'));

  // ── 6. Verify counts unchanged ──────────────────────────────────
  console.log('Step 6: Verify critical row counts unchanged');
  let allMatch = true;
  for (const [name, afterVal] of Object.entries(postCounts)) {
    const beforeVal = preCounts[name];
    if (beforeVal === afterVal) {
      console.log(`  ✓ ${name}: ${beforeVal} → ${afterVal}`);
    } else {
      console.log(`  ✗ ${name}: ${beforeVal} → ${afterVal}  (DIFFERENT)`);
      allMatch = false;
    }
  }

  // ── 7. Verify foreign-key consistency ───────────────────────────
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
