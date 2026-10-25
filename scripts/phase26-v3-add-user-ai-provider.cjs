// PHASE 26 v3 — Additive migration: UserAIProvider table
//
// Per-user encrypted AI provider credentials.
// Run: node scripts/phase26-v3-add-user-ai-provider.cjs

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BACKUP_PATH = `${DB_PATH}.phase26-v3-user-ai-provider-pre.bak`;

const DDL = [
  `CREATE TABLE IF NOT EXISTS "UserAIProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredential" TEXT NOT NULL,
    "credentialHint" TEXT NOT NULL,
    "modelPreferences" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastValidatedAt" DATETIME,
    "lastValidationError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserAIProvider_userId_provider_key" ON "UserAIProvider"("userId", "provider")`,
  `CREATE INDEX IF NOT EXISTS "UserAIProvider_userId_idx" ON "UserAIProvider"("userId")`,
  `CREATE INDEX IF NOT EXISTS "UserAIProvider_provider_idx" ON "UserAIProvider"("provider")`,
  `CREATE INDEX IF NOT EXISTS "UserAIProvider_status_idx" ON "UserAIProvider"("status")`,
];

const CRITICAL = [
  ['User', 'SELECT COUNT(*) c FROM User'],
  ['Subscription', 'SELECT COUNT(*) c FROM Subscription'],
  ['Lead', 'SELECT COUNT(*) c FROM Lead'],
  ['AutopilotRun', 'SELECT COUNT(*) c FROM AutopilotRun'],
  ['WorkflowExecution', 'SELECT COUNT(*) c FROM WorkflowExecution'],
  ['ModelInvocation', 'SELECT COUNT(*) c FROM ModelInvocation'],
  ['AgentActivity', 'SELECT COUNT(*) c FROM AgentActivity'],
];

function main() {
  console.log('=== PHASE 26 v3 — UserAIProvider ADDITIVE MIGRATION ===');
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  const origSize = fs.statSync(DB_PATH).size;
  const backupSize = fs.statSync(BACKUP_PATH).size;
  console.log(`Backup: ${BACKUP_PATH} (orig=${origSize}, backup=${backupSize})`);
  if (origSize !== backupSize) { console.error('ABORT: backup size mismatch'); process.exit(1); }

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

  const present = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='UserAIProvider'").get();
  console.log('UserAIProvider table:', present ? 'PRESENT ✓' : 'MISSING ✗');

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
