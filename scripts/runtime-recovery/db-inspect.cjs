#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — Step 0 / Step 2 pre-check
 * READ-ONLY DB inspection: table inventory, expected-table presence,
 * integrity_check, foreign_key_check, critical row counts, journal mode.
 * Never writes to the database.
 */
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';

const EXPECTED_PHASE_TABLES = [
  'ExecutionActivity', 'ModelInvocation', 'DailyOutreachUsage', 'CustomNiche',
  'AgentActivity', 'MessageDraft', 'Task',
  'UserAIProvider', 'Agent', 'AgentRun', 'AgentMemory', 'AgentApproval',
];

const COUNT_TABLES = [
  'User', 'Subscription', 'Lead', 'WorkflowExecution', 'AutopilotRun',
  'AutopilotWorkflow', 'BusinessProfile', 'DiscoveryJob', 'AutopilotLead',
  'CreditsLedger', 'Session', 'EmailAccount',
  'ExecutionActivity', 'ModelInvocation', 'DailyOutreachUsage', 'CustomNiche',
  'AgentActivity', 'MessageDraft', 'Task',
  'UserAIProvider', 'Agent', 'AgentRun', 'AgentMemory', 'AgentApproval',
];

function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  const tables = rows.map((r) => r.name);
  console.log('TABLE_COUNT=' + tables.length);

  for (const t of EXPECTED_PHASE_TABLES) {
    console.log((tables.includes(t) ? 'PRESENT ' : 'MISSING ') + t);
  }

  console.log('JOURNAL_MODE=' + db.prepare('PRAGMA journal_mode').get().journal_mode);
  console.log('INTEGRITY=' + db.prepare('PRAGMA integrity_check').get().integrity_check);
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  console.log('FK_VIOLATIONS=' + fk.length);

  for (const t of COUNT_TABLES) {
    if (tables.includes(t)) {
      const c = db.prepare('SELECT COUNT(*) AS c FROM "' + t + '"').get().c;
      console.log('COUNT ' + t + '=' + c);
    }
  }

  // Show User + Subscription columns (non-secret structural info) for elite-account probe.
  for (const t of ['User', 'Subscription']) {
    if (tables.includes(t)) {
      const cols = db.prepare('PRAGMA table_info("' + t + '")').all().map((c) => c.name);
      console.log('COLUMNS ' + t + '=' + cols.join(','));
    }
  }

  db.close();
}

main();
