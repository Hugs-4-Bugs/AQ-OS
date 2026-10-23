// RESTORE: re-insert the 3 AutopilotWorkflow + 13 AutopilotRun + 134
// AutopilotLead rows that a buggy E2E cleanup deleted (deleteMany with an
// undefined id = no-filter). Source: the verified pre-P18 backup taken
// BEFORE any Phase 18 work. Purely additive — live tables are currently
// empty, so there are no conflicts. New Phase 18 columns get defaults.
import { Database } from 'bun:sqlite';

const live = new Database('db/custom.db');
const backup = new Database('db-backups/custom-pre-p18-2026-10-23_06-06-.db', { readonly: true });

// Safety: verify live tables are actually empty (no conflicts possible).
for (const t of ['AutopilotWorkflow', 'AutopilotRun', 'AutopilotLead']) {
  const c = live.query(`SELECT COUNT(*) c FROM ${t}`).get().c;
  if (c !== 0) {
    console.error(`ABORT: ${t} is not empty (${c} rows) — manual review needed.`);
    process.exit(1);
  }
}

function restoreTable(table, columns) {
  const colList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const rows = backup.query(`SELECT ${colList} FROM ${table}`).all();
  const insert = live.prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`);
  const tx = live.transaction(() => {
    for (const row of rows) insert.run(...columns.map((c) => row[c]));
  });
  tx();
  console.log(`restored ${rows.length} rows into ${table}`);
  return rows.length;
}

const n1 = restoreTable('AutopilotWorkflow', [
  'id', 'userId', 'orgId', 'name', 'status', 'niches', 'geography', 'workflowId',
  'schedule', 'lastRunAt', 'nextRunAt', 'lastError', 'runCount',
  'totalDiscovered', 'totalSaved', 'totalProcessed', 'totalExecutions',
  'createdAt', 'updatedAt',
]);
const n2 = restoreTable('AutopilotRun', [
  'id', 'autopilotId', 'userId', 'status', 'trigger', 'config',
  'discovered', 'saved', 'skippedDupes', 'processed', 'executionsCreated',
  'error', 'createdAt', 'startedAt', 'completedAt',
]);
const n3 = restoreTable('AutopilotLead', [
  'id', 'autopilotId', 'runId', 'leadId', 'userId', 'status', 'executionId', 'error', 'createdAt',
]);

// Verification: counts + spot checks against the backup.
const okCounts =
  live.query('SELECT COUNT(*) c FROM AutopilotWorkflow').get().c === n1 &&
  live.query('SELECT COUNT(*) c FROM AutopilotRun').get().c === n2 &&
  live.query('SELECT COUNT(*) c FROM AutopilotLead').get().c === n3;

const names = live.query('SELECT name, status FROM AutopilotWorkflow ORDER BY createdAt').all();
const expectedNames = backup.query('SELECT name, status FROM AutopilotWorkflow ORDER BY createdAt').all();
const namesMatch = JSON.stringify(names) === JSON.stringify(expectedNames);

const runSample = live.query("SELECT id, status, trigger FROM AutopilotRun WHERE id = 'cmvfqytpe00h0m2qkj1fvxluq'").get();
const runExpected = backup.query("SELECT id, status, trigger FROM AutopilotRun WHERE id = 'cmvfqytpe00h0m2qkj1fvxluq'").get();
const runMatch = JSON.stringify(runSample) === JSON.stringify(runExpected);

const ledgerStatuses = live.query('SELECT status, COUNT(*) c FROM AutopilotLead GROUP BY status').all();
const ledgerExpected = backup.query('SELECT status, COUNT(*) c FROM AutopilotLead GROUP BY status').all();
const ledgerMatch = JSON.stringify(ledgerStatuses) === JSON.stringify(ledgerExpected);

const integrity = live.query('PRAGMA integrity_check').get();
const fk = live.query('PRAGMA foreign_key_check').all();

console.log('\nverification:');
console.log('  counts restored:', okCounts);
console.log('  autopilot rows byte-identical:', namesMatch, JSON.stringify(names));
console.log('  run row spot-check:', runMatch, JSON.stringify(runSample));
console.log('  ledger status distribution:', ledgerMatch, JSON.stringify(ledgerStatuses));
console.log('  integrity_check:', integrity.integrity_check, '| fk violations:', fk.length);

live.close();
backup.close();
const ok = okCounts && namesMatch && runMatch && ledgerMatch && integrity.integrity_check === 'ok' && fk.length === 0;
console.log(ok ? '\nRESTORE VERIFIED' : '\nRESTORE VERIFICATION FAILED');
process.exit(ok ? 0 : 1);
