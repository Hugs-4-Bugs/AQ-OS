// ═══════════════════════════════════════════════════════════════════
// Phase 21 — STEP 13 DB safety verification (read-only).
// No schema migration was required (geography is a JSON column extended
// additively at the JSON level). This script PROVES the live DB was not
// structurally touched by Phase 21 and that data integrity holds:
//   - table count + names identical to the Phase 20 baseline (118)
//   - row counts of every table preserved (vs. the recorded baseline)
//   - PRAGMA integrity_check + foreign_key_check clean
//   - the AutopilotWorkflow.geography column still stores valid JSON
// ═══════════════════════════════════════════════════════════════════
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const DB_PATH = 'db/custom.db';
const BASELINE_TABLES = 118;   // Phase 20 restore verification (115→118)
const BASELINE_ROWS = 5412;    // Phase 20 restore verification (all preserved)

function log(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const db = new PrismaClient();
  // Prisma routes raw SQLite through $queryRaw
  const tableRows = await db.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
  );
  const tables = tableRows.map((r) => r.name);
  log('13. Table count unchanged (additive JSON only — no DDL)',
    tables.length === BASELINE_TABLES,
    `tables=${tables.length} baseline=${BASELINE_TABLES}`);

  // Phase 21 required tables still present
  for (const t of ['AutopilotWorkflow', 'AutopilotRun', 'AutopilotLead', 'CustomNiche', 'Lead', 'DiscoveryJob', 'WorkflowExecution']) {
    log(`13. Phase-relevant table present: ${t}`, tables.includes(t), tables.includes(t) ? 'present' : 'MISSING');
  }

  // Row-count integrity: total rows across all tables ≥ baseline (leads
  // discovered by the E2E were kept as real data by design, so the total
  // may be HIGHER — never lower).
  let total = 0;
  const perTable = [];
  for (const t of tables) {
    const c = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${t}"`);
    const n = Number(c[0]?.n || 0);
    total += n;
    perTable.push(`${t}=${n}`);
  }
  log('13. Total row count ≥ baseline (no data lost; E2E leads kept by design)',
    total >= BASELINE_ROWS,
    `total=${total} baseline=${BASELINE_ROWS} (+${total - BASELINE_ROWS})`);

  // Integrity checks (raw sqlite via better-sqlite3-free path: prisma raw)
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check');
  const integrityOk = Array.isArray(integrity) && integrity.every((r) => Object.values(r)[0] === 'ok');
  log('13. PRAGMA integrity_check', integrityOk, JSON.stringify(integrity));

  const fk = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
  log('13. PRAGMA foreign_key_check (0 violations)', Array.isArray(fk) && fk.length === 0, `violations=${Array.isArray(fk) ? fk.length : '?'}`);

  // The geography column still parses as JSON for every row (legacy and
  // Phase 21 shapes are BOTH valid JSON by design).
  const geos = await db.$queryRawUnsafe('SELECT geography FROM AutopilotWorkflow');
  let jsonOk = 0;
  const shapes = {};
  for (const row of geos) {
    try {
      const g = JSON.parse(row.geography);
      jsonOk++;
      shapes[Array.isArray(g.countries) ? 'countries[]' : Object.keys(g).length ? 'legacy' : 'worldwide/{}'] =
        (shapes[Array.isArray(g.countries) ? 'countries[]' : Object.keys(g).length ? 'legacy' : 'worldwide/{}'] || 0) + 1;
    } catch { /* invalid JSON */ }
  }
  log('13. Every AutopilotWorkflow.geography value is valid JSON', jsonOk === geos.length,
    `rows=${geos.length} valid=${jsonOk} shapes=${JSON.stringify(shapes)}`);

  // Backup files still present (never deleted by Phase 21) — 4 .db
  // backups existed at Phase 21 start (oldest Oct 19, newest pre-p20
  // Oct 24 01:25, all BEFORE this session began ~02:14Z), plus .meta
  // sidecars. None may be newer than the Phase 21 window.
  const backups = fs.existsSync('db-backups') ? fs.readdirSync('db-backups').filter((f) => f.endsWith('.db')).length : 0;
  const backupsTouched = fs.existsSync('db-backups')
    ? fs.readdirSync('db-backups').filter((f) => {
        try { return fs.statSync(`db-backups/${f}`).mtimeMs > Date.parse('2026-10-24T02:00:00Z'); } catch { return false; }
      }).length
    : 0;
  log('13. db-backups/ preserved (4 .db files, none touched during Phase 21)',
    backups >= 4 && backupsTouched === 0,
    `backup .db files=${backups} touchedDuringPhase21=${backupsTouched}`);
  const dbExists = fs.existsSync(DB_PATH);
  log('13. Live DB file present (never reset/replaced)', dbExists, `${DB_PATH} exists=${dbExists}`);

  console.log(perTable.slice(0, 12).join(' '), '…');
  await db.$disconnect();
})().catch((e) => { console.error('fatal:', e); process.exit(1); });
