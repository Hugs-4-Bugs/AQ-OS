// SCHEMA REPAIR — real DB, additive-only, idempotent, with backup + integrity checks.
// Restores the 3 UserSession columns that schema.prisma (Task A, commit ed256c2)
// declares but the workspace-restored DB snapshot lost. Proven on a copy first
// (scripts/otp-schema-proof.js). NO row data is changed except backfilling the
// NEW lastActivityAt column from each row's own createdAt.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB = '/home/z/my-project/db/custom.db';
const BACKUP = '/home/z/my-project/db/custom.db.backup-20260929-otp-schema';

// ── Pre-flight ──
for (const f of [DB + '-wal', DB + '-shm']) {
  if (fs.existsSync(f)) { console.error('ABORT: WAL file present:', f); process.exit(1); }
}
fs.copyFileSync(DB, BACKUP);
console.log('[1] backup created:', BACKUP, fs.statSync(BACKUP).size, 'bytes');

const db = new DatabaseSync(DB); // read+write (DDL only)
const COUNT_TABLES = ['UserSession', 'User', 'AuditLog', 'LoginHistory', 'Lead'];
const before = {};
for (const t of COUNT_TABLES) before[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
console.log('[2] row counts BEFORE:', JSON.stringify(before));

// Current columns
let cols = db.prepare("PRAGMA table_info('UserSession')").all().map(c => c.name);
const has = name => cols.includes(name);
if (has('rememberMe') && has('lastActivityAt') && has('absoluteExpiresAt')) {
  console.log('[skip] columns already present — nothing to do');
  process.exit(0);
}

// ── Repair (single transaction) ──
console.log('[3] applying additive ALTERs...');
db.exec('BEGIN IMMEDIATE');
try {
  if (!has('rememberMe')) db.exec('ALTER TABLE "UserSession" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT 0');
  if (!has('lastActivityAt')) db.exec('ALTER TABLE "UserSession" ADD COLUMN "lastActivityAt" DATETIME');
  if (!has('absoluteExpiresAt')) db.exec('ALTER TABLE "UserSession" ADD COLUMN "absoluteExpiresAt" DATETIME');
  db.exec('UPDATE "UserSession" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL');
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('FAILED — rolled back:', e.message);
  process.exit(1);
}

// ── Post-checks ──
cols = db.prepare("PRAGMA table_info('UserSession')").all().map(c => c.name);
const after = {};
for (const t of COUNT_TABLES) after[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
console.log('[4] columns now:', cols.join(', '));
console.log('[5] row counts AFTER: ', JSON.stringify(after));
const identical = COUNT_TABLES.every(t => before[t] === after[t]);
console.log('[6] all row counts identical:', identical);
const integrity = db.prepare('PRAGMA integrity_check').get();
console.log('[7] integrity_check:', JSON.stringify(integrity));
const sample = db.prepare('SELECT rememberMe, lastActivityAt, absoluteExpiresAt, createdAt FROM UserSession ORDER BY createdAt DESC LIMIT 2').all();
console.log('[8] sample old rows (backfilled):', JSON.stringify(sample));
const idx = db.prepare("PRAGMA index_list('UserSession')").all().map(i => i.name);
console.log('[9] indexes intact:', idx.join(', '));

db.close();
console.log(identical && integrity.integrity_check === 'ok' ? 'REPAIR OK' : 'REPAIR NEEDS REVIEW');
