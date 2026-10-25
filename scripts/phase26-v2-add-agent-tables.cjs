// PHASE 26 v2 — Additive migration for Agentic Tool Layer tables
//
// Three new tables required by src/lib/ai/agent-tools/:
//   1. AgentActivity — audit log for every tool invocation
//   2. MessageDraft  — drafts created by message.draft tool
//   3. Task          — generic tasks created by task.create tool
//
// All additive: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// No DROP, no TRUNCATE, no ALTER on existing tables.
//
// Run: node scripts/phase26-v2-add-agent-tables.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.phase26-v2-agent-tables-pre.bak`;

const DDL_STATEMENTS = [
  // ── AgentActivity ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "AgentActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "toolName" TEXT NOT NULL,
    "invocationId" TEXT,
    "executionId" TEXT,
    "runId" TEXT,
    "leadId" TEXT,
    "input" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "output" TEXT,
    "error" TEXT,
    "fromCache" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_userId_idx" ON "AgentActivity"("userId")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_toolName_idx" ON "AgentActivity"("toolName")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_invocationId_idx" ON "AgentActivity"("invocationId")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_executionId_idx" ON "AgentActivity"("executionId")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_runId_idx" ON "AgentActivity"("runId")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_leadId_idx" ON "AgentActivity"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "AgentActivity_createdAt_idx" ON "AgentActivity"("createdAt")`,

  // ── MessageDraft ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "MessageDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "leadId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "MessageDraft_userId_idx" ON "MessageDraft"("userId")`,
  `CREATE INDEX IF NOT EXISTS "MessageDraft_leadId_idx" ON "MessageDraft"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "MessageDraft_status_idx" ON "MessageDraft"("status")`,
  `CREATE INDEX IF NOT EXISTS "MessageDraft_createdAt_idx" ON "MessageDraft"("createdAt")`,

  // ── Task ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Task_userId_idx" ON "Task"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Task_leadId_idx" ON "Task"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status")`,
  `CREATE INDEX IF NOT EXISTS "Task_dueAt_idx" ON "Task"("dueAt")`,
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
  console.log('=== PHASE 26 v2 — AGENT TOOL LAYER ADDITIVE MIGRATION ===');
  console.log('DB path: ' + DB_PATH);

  // 1. Backup
  console.log('Step 1: Backup DB → ' + BACKUP_PATH);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const origSize = fs.statSync(DB_PATH).size;
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log('  Original: ' + origSize + ' bytes');
  console.log('  Backup:   ' + backupSize + ' bytes');
  if (origSize !== backupSize) {
    console.error('  ABORT: backup size mismatch');
    process.exit(1);
  }

  // 2. Pre-migration
  const db = new DatabaseSync(DB_PATH);
  console.log('Step 2: Pre-migration integrity + counts');
  const preIntegrity = db.prepare('PRAGMA integrity_check').get();
  console.log('  integrity: ' + JSON.stringify(preIntegrity));
  const preCounts = snapshotCounts(db);
  console.log('  pre counts: ' + JSON.stringify(preCounts));

  // 3. Apply DDL
  console.log('Step 3: Apply additive DDL');
  for (const ddl of DDL_STATEMENTS) {
    try {
      db.exec(ddl);
      console.log('  ✓ ' + ddl.split('\n')[0].slice(0, 100));
    } catch (err) {
      if (err.message && err.message.includes('already exists')) {
        console.log('  (skip, exists) ' + ddl.split('\n')[0].slice(0, 80));
      } else {
        console.error('  ABORT: ' + err.message);
        db.close();
        process.exit(1);
      }
    }
  }

  // 4. Post-migration
  console.log('Step 4: Post-migration integrity + counts');
  const postIntegrity = db.prepare('PRAGMA integrity_check').get();
  console.log('  integrity: ' + JSON.stringify(postIntegrity));
  const postCounts = snapshotCounts(db);
  console.log('  post counts: ' + JSON.stringify(postCounts));

  // 5. Verify tables exist
  console.log('Step 5: Verify new tables exist');
  const checks = ['AgentActivity', 'MessageDraft', 'Task'];
  for (const t of checks) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    console.log(`  ${t}: ${row ? 'PRESENT ✓' : 'STILL MISSING ✗'}`);
  }

  // 6. Verify counts unchanged
  console.log('Step 6: Verify critical counts unchanged');
  let allMatch = true;
  for (const [name, afterVal] of Object.entries(postCounts)) {
    const beforeVal = preCounts[name];
    if (String(beforeVal) === String(afterVal)) {
      console.log(`  ✓ ${name}: ${beforeVal} → ${afterVal}`);
    } else {
      console.log(`  ✗ ${name}: ${beforeVal} → ${afterVal}`);
      allMatch = false;
    }
  }

  // 7. Foreign-key check
  console.log('Step 7: Foreign-key consistency check');
  db.exec('PRAGMA foreign_keys = ON');
  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  console.log('  foreign_key_check: ' + (fkCheck.length === 0 ? 'OK (0 violations)' : `${fkCheck.length} VIOLATIONS`));

  db.close();
  if (!allMatch) {
    console.error('=== ABORT: row count drift detected ===');
    process.exit(1);
  }
  console.log('=== MIGRATION COMPLETE — additive only, all critical counts unchanged ===');
}

main();
