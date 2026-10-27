#!/usr/bin/env node
/**
 * RUNTIME RECOVERY (r2) — Additive migration for residual schema drift
 * discovered AFTER the platform rollback, beyond the 7 known phase scripts.
 *
 * Found via /api/leads HTTP 500 -> Prisma error:
 *   "The column `main.Lead.discoveryJobId` does not exist in the current database."
 * plus a full column scan (scripts/phase26-column-scan.cjs):
 *
 *   Missing columns:
 *     - Lead.discoveryJobId          String?   (nullable, @@index([discoveryJobId]))
 *     - AutopilotRun.runKey          String?   @unique (Phase 18 idempotency)
 *     - AutopilotRun.executionId     String?   (Phase 18 parent execution)
 *     - AutopilotRun.leadsCompleted  Int @default(0)
 *     - AutopilotRun.leadsFailed     Int @default(0)
 *   Missing table:
 *     - WorkflowExecutionLead        (Phase 18 per-lead execution ledger)
 *
 * STRICTLY ADDITIVE + IDEMPOTENT:
 *   - Backup DB first
 *   - ALTER TABLE ADD COLUMN (nullable where Prisma says String?/Int? nullable)
 *   - CREATE TABLE/INDEX IF NOT EXISTS
 *   - duplicate-column / already-exists errors treated as no-op success
 *   - pre/post integrity + FK + critical row counts (must be unchanged)
 *   - NO DROP, NO TRUNCATE, NO DELETE, NO reset
 *
 * Run: node scripts/runtime-recovery/add-missing-columns-r2.cjs
 */
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.runtime-recovery-r2-pre.bak`;

const DDL_STATEMENTS = [
  // ── Lead.discoveryJobId (nullable provenance pointer, Phase 9) ──
  `ALTER TABLE "Lead" ADD COLUMN "discoveryJobId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Lead_discoveryJobId_idx" ON "Lead"("discoveryJobId")`,

  // ── AutopilotRun Phase 18 columns ──
  `ALTER TABLE "AutopilotRun" ADD COLUMN "runKey" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AutopilotRun_runKey_key" ON "AutopilotRun"("runKey")`,
  `ALTER TABLE "AutopilotRun" ADD COLUMN "executionId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "AutopilotRun_executionId_idx" ON "AutopilotRun"("executionId")`,
  `ALTER TABLE "AutopilotRun" ADD COLUMN "leadsCompleted" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AutopilotRun" ADD COLUMN "leadsFailed" INTEGER NOT NULL DEFAULT 0`,

  // ── WorkflowExecutionLead (Phase 18 per-lead execution ledger) ──
  `CREATE TABLE IF NOT EXISTS "WorkflowExecutionLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "leadId" TEXT,
    "leadName" TEXT,
    "niche" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "stepSummary" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_executionId_idx" ON "WorkflowExecutionLead"("executionId")`,
  `CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_leadId_idx" ON "WorkflowExecutionLead"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_status_idx" ON "WorkflowExecutionLead"("status")`,
];

const CRITICAL_COUNT_QUERIES = [
  ['User', 'SELECT COUNT(*) c FROM User'],
  ['Subscription', 'SELECT COUNT(*) c FROM Subscription'],
  ['Lead', 'SELECT COUNT(*) c FROM Lead'],
  ['AutopilotRun', 'SELECT COUNT(*) c FROM AutopilotRun'],
  ['AutopilotLead', 'SELECT COUNT(*) c FROM AutopilotLead'],
  ['WorkflowExecution', 'SELECT COUNT(*) c FROM WorkflowExecution'],
  ['AutopilotWorkflow', 'SELECT COUNT(*) c FROM AutopilotWorkflow'],
  ['BusinessProfile', 'SELECT COUNT(*) c FROM BusinessProfile'],
  ['DiscoveryJob', 'SELECT COUNT(*) c FROM DiscoveryJob'],
  ['CreditsLedger', 'SELECT COUNT(*) c FROM CreditsLedger'],
];

function snapshotCounts(db) {
  const counts = {};
  for (const [name, q] of CRITICAL_COUNT_QUERIES) {
    try { counts[name] = db.prepare(q).get().c; }
    catch (e) { counts[name] = `ERROR: ${e.message}`; }
  }
  return counts;
}

function main() {
  console.log('=== RUNTIME RECOVERY r2 — ADDITIVE MIGRATION (residual drift) ===');
  console.log('DB path: ' + DB_PATH);

  // 1. Backup
  console.log('Step 1: Backup DB -> ' + BACKUP_PATH);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const origSize = fs.statSync(DB_PATH).size;
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log('  Original: ' + origSize + ' bytes');
  console.log('  Backup:   ' + backupSize + ' bytes');
  if (origSize !== backupSize) {
    console.error('  ABORT: backup size mismatch');
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);

  // 2. Pre-migration state
  console.log('Step 2: Pre-migration integrity + counts');
  console.log('  integrity: ' + db.prepare('PRAGMA integrity_check').get().integrity_check);
  const preCounts = snapshotCounts(db);
  console.log('  pre counts: ' + JSON.stringify(preCounts));

  // 3. Apply additive DDL (idempotent)
  console.log('Step 3: Apply additive DDL');
  for (const ddl of DDL_STATEMENTS) {
    try {
      db.exec(ddl);
      console.log('  + ' + ddl.split('\n')[0].slice(0, 100));
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('duplicate column name') || msg.includes('already exists')) {
        console.log('  (skip, exists) ' + ddl.split('\n')[0].slice(0, 80));
      } else {
        console.error('  ABORT: ' + msg);
        db.close();
        process.exit(1);
      }
    }
  }

  // 4. Post-migration verification
  console.log('Step 4: Post-migration integrity + counts');
  console.log('  integrity: ' + db.prepare('PRAGMA integrity_check').get().integrity_check);
  const postCounts = snapshotCounts(db);
  console.log('  post counts: ' + JSON.stringify(postCounts));

  console.log('Step 5: Verify structures present');
  const leadCols = db.prepare('PRAGMA table_info("Lead")').all().map((c) => c.name);
  console.log('  Lead.discoveryJobId: ' + (leadCols.includes('discoveryJobId') ? 'PRESENT' : 'MISSING'));
  const arCols = db.prepare('PRAGMA table_info("AutopilotRun")').all().map((c) => c.name);
  for (const c of ['runKey', 'executionId', 'leadsCompleted', 'leadsFailed']) {
    console.log('  AutopilotRun.' + c + ': ' + (arCols.includes(c) ? 'PRESENT' : 'MISSING'));
  }
  const wel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkflowExecutionLead'").get();
  console.log('  WorkflowExecutionLead table: ' + (wel ? 'PRESENT' : 'MISSING'));

  console.log('Step 6: Critical counts unchanged');
  let allMatch = true;
  for (const [name, afterVal] of Object.entries(postCounts)) {
    const beforeVal = preCounts[name];
    if (String(beforeVal) === String(afterVal)) {
      console.log('  = ' + name + ': ' + beforeVal + ' -> ' + afterVal);
    } else {
      console.log('  X ' + name + ': ' + beforeVal + ' -> ' + afterVal + ' (DIFFERENT)');
      allMatch = false;
    }
  }

  console.log('Step 7: Foreign-key consistency');
  db.exec('PRAGMA foreign_keys = ON');
  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  console.log('  foreign_key_check: ' + (fkCheck.length === 0 ? 'OK (0 violations)' : fkCheck.length + ' VIOLATIONS'));

  db.close();
  if (!allMatch) {
    console.error('=== ABORT: row count drift detected ===');
    process.exit(1);
  }
  console.log('=== MIGRATION COMPLETE — additive only, all critical counts unchanged ===');
}

main();
