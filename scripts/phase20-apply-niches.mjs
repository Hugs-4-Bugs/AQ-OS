// Phase 20 — apply the reviewed additive niche SQL to the LIVE database.
//
// This migration does TWO things (both purely additive + data-preserving):
//   A. Re-applies the Phase 14/18 schema drift that the live DB lost when
//      the workspace was restored from an Oct-19 snapshot (AutopilotRun
//      runKey/executionId/leadsCompleted/leadsFailed, DiscoveryJob
//      outcome/targetingJson, Lead.discoveryJobId, BusinessProfile
//      isDefault, DailyOutreachUsage + WorkflowExecutionLead tables).
//      The Phase 19 code baseline requires these — without them every
//      autopilot run would fail at the first runKey write.
//   B. Adds the Phase 20 niche schema: CustomNiche table + AutopilotWorkflow
//      .profileMappings column.
//
// Safety protocol (identical to scripts/phase18-apply-drift.mjs):
//   1. Timestamped backups (db-backups/ + upload/presync-*, git-ignored)
//   2. Row-count map of EVERY table captured BEFORE
//   3. Execute the reviewed SQL (data-preserving redefines only — every
//      INSERT INTO new_* SELECT copies ALL pre-existing columns)
//   4. Row-count map AFTER — must be identical for all pre-existing tables
//   5. integrity_check + foreign_key_check
// Usage: bun scripts/phase20-apply-niches.mjs
import { Database } from 'bun:sqlite';
import { copyFileSync, readFileSync, mkdirSync } from 'fs';

const DB_PATH = 'db/custom.db';
const SQL_PATH = 'scripts/phase20-niches.sql';
const TS = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 17);

// ── 1. Backups ──
mkdirSync('db-backups', { recursive: true });
copyFileSync(DB_PATH, `db-backups/custom-pre-p20-${TS}.db`);
mkdirSync('upload/presync-20261023-054336', { recursive: true });
copyFileSync(DB_PATH, `upload/presync-20261023-054336/custom-pre-p20-${TS}.db`);
console.log(`[backup] db-backups/custom-pre-p20-${TS}.db + upload copy`);

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
// FK pragmas OUTSIDE the transaction (no-ops inside one); the DDL itself
// keeps defer_foreign_keys=ON so the table redefines never trip FK checks.
const sql = readFileSync(SQL_PATH, 'utf8');
try {
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN');
  db.exec(sql);
  db.exec('COMMIT');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
  try { db.exec('PRAGMA foreign_keys=ON'); } catch { /* ignore */ }
  console.error('[FAILED] migration rolled back:', e.message);
  process.exit(1);
} finally {
  try { db.exec('PRAGMA foreign_keys=ON'); } catch { /* ignore */ }
}
console.log('[apply] niche SQL executed and committed');

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
  AutopilotWorkflow: ['profileMappings'],
  AutopilotRun: ['runKey', 'executionId', 'leadsCompleted', 'leadsFailed'],
  WorkflowExecutionLead: ['executionId', 'leadId', 'status', 'stepSummary'],
  BusinessProfile: ['isDefault'],
  DiscoveryJob: ['outcome', 'targetingJson'],
  Lead: ['discoveryJobId'],
  DailyOutreachUsage: ['userId', 'dateKey', 'used'],
  CustomNiche: ['userId', 'name', 'nicheKey', 'status'],
};
let colMissing = 0;
for (const [table, cols] of Object.entries(need)) {
  const present = db.query(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
  for (const c of cols) {
    if (!present.includes(c)) {
      console.error(`[COLUMN MISSING] ${table}.${c}`);
      colMissing++;
    }
  }
}
console.log(`[after] column checks: ${colMissing === 0 ? 'ALL PRESENT' : colMissing + ' MISSING'}`);

// Index presence checks (uniqueness contracts)
const idx = db
  .query("SELECT name FROM sqlite_master WHERE type='index'")
  .all()
  .map((r) => r.name);
for (const want of ['CustomNiche_userId_nicheKey_key', 'AutopilotRun_runKey_key', 'DailyOutreachUsage_userId_dateKey_key']) {
  console.log(`[index] ${want}: ${idx.includes(want) ? 'PRESENT' : 'MISSING'}`);
}

// ── 5. Integrity + FK checks ──
const integrity = db.query('PRAGMA integrity_check').get();
console.log('[integrity]', JSON.stringify(integrity));
const fk = db.query('PRAGMA foreign_key_check').all();
console.log('[foreign_key_check]', fk.length === 0 ? 'OK (0 violations)' : JSON.stringify(fk.slice(0, 5)));

const ok =
  mismatches === 0 &&
  colMissing === 0 &&
  droppedTables.length === 0 &&
  beforeTotal === afterTotal &&
  integrity.integrity_check === 'ok' &&
  fk.length === 0;
console.log(ok ? '[RESULT] MIGRATION SAFE-VERIFIED' : '[RESULT] VERIFICATION FAILED');
process.exit(ok ? 0 : 1);
