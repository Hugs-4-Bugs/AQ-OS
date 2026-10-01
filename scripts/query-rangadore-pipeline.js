// READ-ONLY forensic query for the Rangadore Memorial Hospital pipeline failure.
// Opens db/custom.db in readonly mode. No writes. No secret values printed.
const { DatabaseSync } = require('node:sqlite');

const DB = '/home/z/my-project/db/custom.db';
const db = new DatabaseSync(DB, { readOnly: true });

const q = (sql, params = []) => db.prepare(sql).all(...params);

// 1. Find the lead
const leads = q(
  `SELECT id, businessName, website, niche, city, country, createdAt, updatedAt
   FROM Lead WHERE businessName LIKE '%Rangadore%'`
);
console.log('=== LEAD ===');
console.log(JSON.stringify(leads, null, 2));

for (const lead of leads) {
  // 2. Pipeline runs for this lead
  const runs = q(
    `SELECT id, status, currentStep, totalSteps, stepStatus, progress, error,
            createdAt, startedAt, completedAt
     FROM ProspectPipeline WHERE leadId = ? ORDER BY createdAt DESC LIMIT 5`,
    [lead.id]
  );
  console.log('=== PIPELINE RUNS ===');
  console.log(JSON.stringify(runs, null, 2));

  // 3. Lead activity entries
  const acts = q(
    `SELECT type, description, createdAt, metadata
     FROM LeadActivity WHERE leadId = ? ORDER BY createdAt DESC LIMIT 6`,
    [lead.id]
  );
  console.log('=== LEAD ACTIVITY ===');
  console.log(JSON.stringify(acts, null, 2));
}

// 4. Recent failed AI provider usage rows (UsageTracking has monthly aggregate,
//    so instead check audit tables if present)
const tables = q(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%Audit%' OR name LIKE '%audit%')`);
console.log('=== AUDIT TABLES ===');
console.log(JSON.stringify(tables.map(t => t.name), null, 2));

for (const t of tables) {
  const name = t.name;
  try {
    const cols = q(`PRAGMA table_info(${name})`).map(c => c.name);
    const timeCol = cols.find(c => /createdAt|at$/i.test(c));
    const rows = q(
      `SELECT * FROM ${name} ${timeCol ? `ORDER BY ${timeCol} DESC` : ''} LIMIT 12`
    );
    console.log(`=== ${name} (recent 12) ===`);
    // Redact anything that looks like a token/key
    const redacted = rows.map(r => {
      const copy = { ...r };
      for (const k of Object.keys(copy)) {
        if (/token|key|secret|password/i.test(k) && typeof copy[k] === 'string' && copy[k]) {
          copy[k] = `<redacted len=${copy[k].length}>`;
        }
      }
      return copy;
    });
    console.log(JSON.stringify(redacted, null, 2));
  } catch (e) {
    console.log(`(${name} query failed: ${e.message})`);
  }
}

// 5. UsageTracking recent ai_provider rows
const usage = q(
  `SELECT id, userId, feature, action, count, periodStart, periodEnd
   FROM UsageTracking WHERE feature = 'ai_provider' ORDER BY periodStart DESC LIMIT 5`
);
console.log('=== UsageTracking ai_provider ===');
console.log(JSON.stringify(usage, null, 2));

db.close();
