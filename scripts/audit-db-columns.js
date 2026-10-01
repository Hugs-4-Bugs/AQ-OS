// Read-only DB column audit — operates on a SNAPSHOT copy, never the live file.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const src = '/home/z/my-project/db/custom.db';
const tmpDir = '/home/z/my-project/.test-tmp';
fs.mkdirSync(tmpDir, { recursive: true });
const snap = path.join(tmpDir, `audit-snapshot-${Date.now()}.db`);
fs.copyFileSync(src, snap);

const db = new DatabaseSync(snap, { readOnly: true });

function cols(table) {
  try {
    const rows = db.prepare(`PRAGMA table_info("${table}")`).all();
    return rows.map((r) => r.name);
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

for (const t of ['Lead', 'DiscoveryJob', 'User', 'CreditsLedger']) {
  const c = cols(t);
  console.log(`\n=== ${t} (${Array.isArray(c) ? c.length : c} cols) ===`);
  if (Array.isArray(c)) console.log(c.join(', '));
}

// Row counts for context (no data values printed)
for (const t of ['Lead', 'DiscoveryJob', 'User']) {
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
    console.log(`${t}: ${n.n} rows`);
  } catch (e) {
    console.log(`${t}: ERROR ${e.message}`);
  }
}

// Check a sample of discovery jobs for outcome distribution
try {
  const jobs = db
    .prepare(
      `SELECT status, COUNT(*) AS n, SUM(imported) AS imported, SUM(duplicates) AS dups,
              SUM(filteredOut) AS filtered, SUM(failed) AS failed
       FROM DiscoveryJob GROUP BY status`
    )
    .all();
  console.log('\n=== DiscoveryJob outcome distribution ===');
  console.log(JSON.stringify(jobs));
} catch (e) {
  console.log('DiscoveryJob stats ERROR:', e.message);
}

db.close();
fs.unlinkSync(snap);
console.log('\n(snapshot deleted)');
