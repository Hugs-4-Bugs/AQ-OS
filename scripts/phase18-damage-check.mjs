// DAMAGE ASSESSMENT (read-only): compare autopilot domain rows between the
// pre-P18 backup and the current live DB, and check old executions.
import { Database } from 'bun:sqlite';

const live = new Database('db/custom.db', { readonly: true });
const backup = new Database('db-backups/custom-pre-p18-2026-10-23_06-06-.db', { readonly: true });

function counts(db, label) {
  const q = (sql) => { try { return db.query(sql).get().c; } catch (e) { return `ERR:${e.message}`; } };
  console.log(`\n=== ${label} ===`);
  console.log('AutopilotWorkflow:', q('SELECT COUNT(*) c FROM AutopilotWorkflow'));
  console.log('AutopilotRun:     ', q('SELECT COUNT(*) c FROM AutopilotRun'));
  console.log('AutopilotLead:    ', q('SELECT COUNT(*) c FROM AutopilotLead'));
  console.log('WorkflowExecution:', q('SELECT COUNT(*) c FROM WorkflowExecution'));
  console.log('Lead:             ', q('SELECT COUNT(*) c FROM Lead'));
  console.log('CreditsLedger:    ', q('SELECT COUNT(*) c FROM CreditsLedger'));
}
counts(backup, 'BACKUP (pre-P18, before drift migration)');
counts(live, 'LIVE (now)');

// Old per-lead autopilot executions still present?
const oldExecs = live.query("SELECT COUNT(*) c FROM WorkflowExecution WHERE idempotencyKey LIKE 'autopilot:%:lead:%'").get();
console.log('\nLIVE old-style autopilot executions (per-lead keys):', oldExecs.c);
const wfCount = live.query("SELECT COUNT(*) c FROM WorkflowDefinition").get();
console.log('LIVE WorkflowDefinition count:', wfCount.c);
const qaWfs = live.query("SELECT name FROM WorkflowDefinition WHERE name LIKE '%Phase3%' OR name LIKE '%Autopilot E2E%'").all();
console.log('LIVE QA/autopilot workflows:', JSON.stringify(qaWfs));

// What did the backup have for autopilots?
const backupAps = backup.query('SELECT id, name, status FROM AutopilotWorkflow').all();
console.log('\nBACKUP autopilots:', JSON.stringify(backupAps, null, 1));
const backupRuns = backup.query('SELECT COUNT(*) c FROM AutopilotRun').get();
console.log('BACKUP runs:', backupRuns.c);
const backupLedger = backup.query('SELECT COUNT(*) c FROM AutopilotLead').get();
console.log('BACKUP ledger rows:', backupLedger.c);

live.close();
backup.close();
