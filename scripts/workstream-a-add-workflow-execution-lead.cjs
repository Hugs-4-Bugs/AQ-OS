// Workstream A — add WorkflowExecutionLead table (additive, idempotent).
//
// WHY: develop's prisma/schema.prisma defines model WorkflowExecutionLead
// (line 1407; referenced by WorkflowExecution.leadItems), but the DB reached
// only 127 tables after the 7 standard migrations — this table was created by
// scripts/runtime-recovery/add-missing-columns-r2.cjs in a prior session,
// which is absent from develop and unrecoverable from git objects (GC'd).
// This script recreates it faithfully from the schema definition.
//
// SAFETY: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS only.
// No DROP, no DELETE, no ALTER, no data touch. Row counts verified before/after.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB = path.join(__dirname, '..', 'db', 'custom.db');
const db = new DatabaseSync(DB);

console.log('=== Workstream A: add WorkflowExecutionLead (additive) ===');

// Pre-checks
const before = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'").get().n;
const pre = {};
for (const t of ['User', 'Subscription', 'Lead', 'WorkflowExecution']) {
  pre[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
}
console.log('Pre: tables =', before, '| rows:', JSON.stringify(pre));

// Additive DDL (schema-faithful to prisma model WorkflowExecutionLead)
db.exec(`
CREATE TABLE IF NOT EXISTS "WorkflowExecutionLead" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowExecutionLead_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution" ("id") ON DELETE CASCADE
);
`);
db.exec(`CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_executionId_idx" ON "WorkflowExecutionLead"("executionId");`);
db.exec(`CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_leadId_idx" ON "WorkflowExecutionLead"("leadId");`);
db.exec(`CREATE INDEX IF NOT EXISTS "WorkflowExecutionLead_status_idx" ON "WorkflowExecutionLead"("status");`);

// Post-verification
const after = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'").get().n;
const present = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='WorkflowExecutionLead'").get().n === 1;
const post = {};
for (const t of ['User', 'Subscription', 'Lead', 'WorkflowExecution']) {
  post[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
}
const ic = db.prepare('PRAGMA integrity_check').get();
db.prepare('PRAGMA foreign_keys=ON').run();
const fk = db.prepare('PRAGMA foreign_key_check').all();

console.log('Post: tables =', after, '| WorkflowExecutionLead present:', present ? 'YES' : 'NO');
console.log('Row counts unchanged:', JSON.stringify(pre) === JSON.stringify(post) ? 'YES ✓' : 'NO ✗ ' + JSON.stringify(post));
console.log('integrity:', ic.integrity_check, '| FK violations:', fk.length);
console.log(present && JSON.stringify(pre) === JSON.stringify(post) && ic.integrity_check === 'ok' && fk.length === 0
  ? '=== MIGRATION COMPLETE — additive only, all critical counts unchanged ==='
  : '=== WARNING — check output above ===');
db.close();
