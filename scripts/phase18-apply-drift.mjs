// Phase 18 — apply the reviewed additive drift SQL to the LIVE database.
// Safety protocol:
//   1. Timestamped backups (db-backups/ + upload/presync-*, git-ignored)
//   2. Row-count map of EVERY table captured BEFORE
//   3. Execute the reviewed SQL (purely additive + data-preserving redefines)
//   4. Row-count map AFTER — must be identical for all pre-existing tables
//   5. integrity_check + foreign_key_check
// Usage: bun scripts/phase18-apply-drift.mjs
import { Database } from 'bun:sqlite';
import { copyFileSync, readFileSync, mkdirSync } from 'fs';

const DB_PATH = 'db/custom.db';
const SQL_PATH = '/tmp/phase18-full-drift.sql';
const TS = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 17);

// ── 1. Backups ──
mkdirSync('db-backups', { recursive: true });
copyFileSync(DB_PATH, `db-backups/custom-pre-p18-${TS}.db`);
mkdirSync('upload/presync-20261023-054336', { recursive: true }); // existing presync dir
copyFileSync(DB_PATH, `upload/presync-20261023-054336/custom-pre-p18-${TS}.db`);
console.log(`[backup] db-backups/custom-pre-p18-${TS}.db + upload copy`);

const db = new Database(DB_PATH);

// ── 2. Before-state: row counts of every table ──
function tableCounts() {
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'")
    .all()
    .map((r) => r.name);
  const counts = {};
  for (const t of tables) {
    try { counts[t] = db.query(`SELECT COUNT(*) AS c FROM "${t}"`).get().c; } catch { counts[t] = -1; }
  }
  return counts;
}
const before = tableCounts();
const beforeTotal = Object.values(before).reduce((a, b) => a + b, 0);
console.log(`[before] ${Object.keys(before).length} tables, total rows: ${beforeTotal}`);

// ── 3. Execute the reviewed SQL ──
const sql = readFileSync(SQL_PATH, 'utf8');
try {
  db.exec('BEGIN');
  db.exec(sql);
  db.exec('COMMIT');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
  console.error('[FAILED] migration rolled back:', e.message);
  process.exit(1);
}
console.log('[apply] drift SQL executed and committed');

// ── 4. After-state verification ──
const after = tableCounts();
const afterTotal = Object.values(after).reduce((a, b) => a + b, 0);
let mismatches = 0;
for (const [t, c] of Object.entries(before)) {
  if ((after[t] ?? -1) !== c) {
    console.error(`[ROW-COUNT MISMATCH] ${t}: before=${c} after=${after[t] ?? 'MISSING'}`);
    mismatches++;
  }
}
const newTables = Object.keys(after).filter((t) => !(t in before));
const droppedTables = Object.keys(before).filter((t) => !(t in after));
console.log(`[after] ${Object.keys(after).length} tables, total rows: ${afterTotal}`);
console.log(`[after] new tables: ${newTables.join(', ') || '(none)'}`);
console.log(`[after] dropped tables: ${droppedTables.join(', ') || '(none)'}`);
console.log(`[after] row-count mismatches: ${mismatches}`);
console.log(`[after] total rows preserved: ${beforeTotal === afterTotal ? 'YES' : 'NO'}`);

// Column presence checks
const need = {
  AutopilotRun: ['runKey', 'executionId', 'leadsCompleted', 'leadsFailed'],
  WorkflowExecutionLead: ['executionId', 'leadId', 'status', 'stepSummary'],
  BusinessProfile: ['isDefault'],
  DiscoveryJob: ['outcome', 'targetingJson'],
  Lead: ['discoveryJobId'],
  DailyOutreachUsage: ['userId', 'dateKey', 'used'],
};
let colOk = true;
for (const [table, cols] of Object.entries(need)) {
  const present = db.query(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const c of cols) {
    if (!present.includes(c)) { console.error(`[COLUMN MISSING] ${table}.${c}`); colOk = false; }
  }
}
console.log(`[columns] all Phase 18 + drift columns present: ${colOk ? 'YES' : 'NO'}`);

// Integrity checks
const integrity = db.query('PRAGMA integrity_check').get();
const fk = db.query('PRAGMA foreign_key_check').all();
console.log(`[integrity] integrity_check=${integrity.integrity_check}, fk_violations=${fk.length}`);

// Data-preserving spot check: the one BusinessProfile row survives with isDefault=false
const bp = db.query('SELECT COUNT(*) AS c, SUM(isDefault) AS d FROM BusinessProfile').get();
const runs = db.query('SELECT COUNT(*) AS c, SUM(leadsCompleted) AS lc, SUM(leadsFailed) AS lf FROM AutopilotRun').get();
console.log(`[spot] BusinessProfile rows=${bp.c} defaultSum=${bp.d} | AutopilotRun rows=${runs.c} leadsCompleted=${runs.lc} leadsFailed=${runs.lf}`);

db.close();
const ok = mismatches === 0 && droppedTables.length === 0 && colOk && integrity.integrity_check === 'ok' && fk.length === 0 && beforeTotal === afterTotal;
console.log(ok ? '\nMIGRATION VERIFIED — additive, data preserved' : '\nMIGRATION VERIFICATION FAILED');
process.exit(ok ? 0 : 1);
