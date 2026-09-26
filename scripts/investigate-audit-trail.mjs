// READ-ONLY: find today's activity — audit events, sessions, any discovery traces
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });
const q = (sql, p = []) => { try { return db.prepare(sql).all(...p); } catch (e) { console.log(`ERR(${sql.slice(0,40)}): ${e.message}`); return []; } };

console.log('=== tables with audit/lead ===');
const tables = q("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
console.log(tables.filter(t => /audit|session|discovery/i.test(t)).join(', '));

console.log('\n=== AuditEvent-ish table recent 25 (any table containing "audit") ===');
for (const t of tables.filter(t => /audit/i.test(t))) {
  const cols = q(`PRAGMA table_info("${t}")`).map(c => c.name);
  console.log(`\n-- table ${t} cols: ${cols.join(',')}`);
  const rows = q(`SELECT * FROM "${t}" ORDER BY rowid DESC LIMIT 25`);
  for (const r of rows) console.log(JSON.stringify(r).slice(0, 400));
}

console.log('\n=== Recent sessions (last 10 by createdAt) ===');
for (const r of q(`SELECT id, substr(userId,1,12) uid, datetime(createdAt/1000,'unixepoch') created, datetime(lastActivityAt/1000,'unixepoch') lastAct, status FROM Session ORDER BY createdAt DESC LIMIT 10`)) console.log(JSON.stringify(r));

console.log('\n=== Users modified/created recently (top 5) ===');
const ucols = q(`PRAGMA table_info("User")`).map(c => c.name);
const hasUpd = ucols.includes('updatedAt');
for (const r of q(`SELECT id, email, role, datetime(createdAt/1000,'unixepoch') created ${hasUpd ? ", datetime(updatedAt/1000,'unixepoch') updated" : ''} FROM User ORDER BY rowid DESC LIMIT 5`)) console.log(JSON.stringify(r));

console.log('\n=== ANY table written in last 3 hours? (mtime probe via max rowid datetime cols) ===');
for (const t of ['AuditEvent','AuditLog','Session','Notification','CreditsLedger','UsageTracking','MeetingIntentLog','Lead','DiscoveryJob']) {
  if (!tables.includes(t)) continue;
  const cols = q(`PRAGMA table_info("${t}")`).map(c => c.name);
  const tsCol = cols.find(c => /createdAt/i.test(c));
  if (!tsCol) continue;
  const recent = q(`SELECT COUNT(*) c FROM "${t}" WHERE "${tsCol}" >= (strftime('%s','now') - 3*3600) * 1000`)[0];
  console.log(`${t}: ${recent.c} rows in last 3h`);
}
db.close();
console.log('DONE');
