// PHASE 26 v3 — Additive migration: Agent system tables
// Run: node scripts/phase26-v3-add-agent-system.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.phase26-v3-agent-system-pre.bak`;

const DDL = [
  `CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'z-ai',
    "model" TEXT NOT NULL DEFAULT 'glm-4.6',
    "toolPermissions" TEXT NOT NULL DEFAULT '{}',
    "schedule" TEXT NOT NULL DEFAULT '{"type":"none"}',
    "triggers" TEXT NOT NULL DEFAULT '[]',
    "approvalPolicy" TEXT NOT NULL DEFAULT 'approval_required',
    "retryPolicy" TEXT NOT NULL DEFAULT '{"maxRetries":2,"backoffMs":1000}',
    "memoryConfig" TEXT NOT NULL DEFAULT '{"windowSize":20,"maxTokens":4000}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "maxIterations" INTEGER NOT NULL DEFAULT 25,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "Agent_userId_idx" ON "Agent"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent"("status")`,
  `CREATE INDEX IF NOT EXISTS "Agent_provider_idx" ON "Agent"("provider")`,

  `CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "triggerSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "result" TEXT,
    "error" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "iterationsUsed" INTEGER NOT NULL DEFAULT 0,
    "toolsCalled" INTEGER NOT NULL DEFAULT 0,
    "approvalState" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_agentId_idx" ON "AgentRun"("agentId")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_userId_idx" ON "AgentRun"("userId")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_status_idx" ON "AgentRun"("status")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_triggerSource_idx" ON "AgentRun"("triggerSource")`,
  `CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx" ON "AgentRun"("createdAt")`,

  `CREATE TABLE IF NOT EXISTS "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentMemory_agentId_idx" ON "AgentMemory"("agentId")`,
  `CREATE INDEX IF NOT EXISTS "AgentMemory_runId_idx" ON "AgentMemory"("runId")`,
  `CREATE INDEX IF NOT EXISTS "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt")`,

  `CREATE TABLE IF NOT EXISTS "AgentApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "invocationResult" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentApproval_agentId_idx" ON "AgentApproval"("agentId")`,
  `CREATE INDEX IF NOT EXISTS "AgentApproval_runId_idx" ON "AgentApproval"("runId")`,
  `CREATE INDEX IF NOT EXISTS "AgentApproval_status_idx" ON "AgentApproval"("status")`,
  `CREATE INDEX IF NOT EXISTS "AgentApproval_requestedAt_idx" ON "AgentApproval"("requestedAt")`,
];

const CRITICAL = [
  ['User', 'SELECT COUNT(*) c FROM User'],
  ['Subscription', 'SELECT COUNT(*) c FROM Subscription'],
  ['Lead', 'SELECT COUNT(*) c FROM Lead'],
  ['AutopilotRun', 'SELECT COUNT(*) c FROM AutopilotRun'],
  ['WorkflowExecution', 'SELECT COUNT(*) c FROM WorkflowExecution'],
  ['ModelInvocation', 'SELECT COUNT(*) c FROM ModelInvocation'],
  ['AgentActivity', 'SELECT COUNT(*) c FROM AgentActivity'],
  ['UserAIProvider', 'SELECT COUNT(*) c FROM UserAIProvider'],
];

function main() {
  console.log('=== PHASE 26 v3 — AGENT SYSTEM ADDITIVE MIGRATION ===');
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const origSize = fs.statSync(DB_PATH).size;
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log(`Backup: ${BACKUP_PATH} (orig=${origSize}, backup=${backupSize})`);
  if (origSize !== backupSize) { console.error('ABORT: backup mismatch'); process.exit(1); }

  const db = new DatabaseSync(DB_PATH);
  console.log('Pre-integrity:', db.prepare('PRAGMA integrity_check').get().integrity_check);
  const pre = {};
  for (const [n, q] of CRITICAL) pre[n] = db.prepare(q).get().c;
  console.log('Pre-counts:', JSON.stringify(pre));

  for (const ddl of DDL) {
    try { db.exec(ddl); console.log('  ✓', ddl.split('\n')[0].slice(0, 80)); }
    catch (e) { if (e.message.includes('already exists')) console.log('  (skip)', ddl.slice(0, 60)); else { console.error('ABORT:', e.message); process.exit(1); } }
  }

  console.log('Post-integrity:', db.prepare('PRAGMA integrity_check').get().integrity_check);
  const post = {};
  for (const [n, q] of CRITICAL) post[n] = db.prepare(q).get().c;
  console.log('Post-counts:', JSON.stringify(post));

  for (const t of ['Agent', 'AgentRun', 'AgentMemory', 'AgentApproval']) {
    const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    console.log(`  ${t}: ${r ? 'PRESENT ✓' : 'MISSING ✗'}`);
  }

  db.exec('PRAGMA foreign_keys = ON');
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  console.log('foreign_key_check:', fk.length === 0 ? 'OK (0 violations)' : `${fk.length} VIOLATIONS`);
  db.close();

  let allMatch = true;
  for (const [n] of CRITICAL) if (String(pre[n]) !== String(post[n])) { console.log(`✗ ${n}: ${pre[n]} → ${post[n]}`); allMatch = false; }
  if (!allMatch) process.exit(1);
  console.log('=== MIGRATION COMPLETE — additive, all critical counts unchanged ===');
}
main();
