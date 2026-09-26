// READ-ONLY DB inspection for discovery + assistant investigation.
// Opens db/custom.db in readonly mode. Never writes.
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = '/home/z/my-project/db/custom.db';
const db = new DatabaseSync(DB_PATH, { readOnly: true });

const q = (sql, params = []) => db.prepare(sql).all(...params);

function safe(label, fn) {
  try {
    return fn();
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
    return null;
  }
}

console.log('=== 1. CORE TABLE HEALTH ===');
const tables = q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r.name);
console.log('total tables:', tables.length);
for (const t of ['User', 'Lead', 'DiscoveryJob', 'Conversation', 'Message', 'ChatSession', 'AiUsage', 'CreditTransaction', 'Notification', 'MeetingIntentLog', 'AiCost']) {
  const exists = tables.includes(t);
  console.log(`${exists ? 'OK ' : 'MISSING'} ${t}`);
}

console.log('\n=== 2. USER / LEAD COUNTS ===');
console.log(safe('users', () => q('SELECT COUNT(*) c FROM User')[0]));
console.log(safe('leads', () => q('SELECT COUNT(*) c FROM Lead')[0]));
console.log(safe('notifications', () => q('SELECT COUNT(*) c FROM Notification')[0]));

console.log('\n=== 3. DISCOVERY JOBS (latest 12) ===');
const jobs = safe('jobs', () => q(`SELECT id, userId, source, niche, country, city, status,
  totalFound, imported, duplicates, failed, filteredOut,
  substr(COALESCE(errorMessage,''),1,300) AS errorMessage,
  datetime(startedAt/1000,'unixepoch') AS started,
  datetime(completedAt/1000,'unixepoch') AS completed,
  datetime(createdAt/1000,'unixepoch') AS created
  FROM DiscoveryJob ORDER BY createdAt DESC LIMIT 12`));
if (jobs) for (const j of jobs) console.log(JSON.stringify(j));

console.log('\n=== 3b. DISCOVERY JOB STATUS COUNTS ===');
console.log(safe('job statuses', () => q(`SELECT status, source, COUNT(*) c FROM DiscoveryJob GROUP BY status, source ORDER BY c DESC`)));

console.log('\n=== 4. RECENT discovery notifications ===');
const notifs = safe('notifs', () => q(`SELECT substr(title,1,40) title, substr(message,1,220) message, datetime(createdAt/1000,'unixepoch') at
  FROM Notification WHERE type IN ('discovery_completed','discovery_failed') ORDER BY createdAt DESC LIMIT 8`));
if (notifs) for (const n of notifs) console.log(JSON.stringify(n));

console.log('\n=== 5. ASSISTANT / CHAT TABLES ===');
// Find conversation-ish tables
for (const t of tables.filter(t => /conversation|chat|message|assistant/i.test(t))) {
  const c = safe(`count ${t}`, () => q(`SELECT COUNT(*) c FROM "${t}"`)[0]);
  console.log(`table ${t}: ${c ? c.c : '?'} rows`);
}

console.log('\n=== 6. RECENT MeetingIntentLog (assistant side effect) ===');
const mil = safe('meeting intent log', () => q(`SELECT datetime(createdAt/1000,'unixepoch') at, detectedIntent, confidence, substr(originalText,1,50) txt FROM MeetingIntentLog ORDER BY createdAt DESC LIMIT 5`));
if (mil) for (const m of mil) console.log(JSON.stringify(m));

console.log('\n=== 7. CREDIT / AI USAGE TABLES ===');
for (const t of tables.filter(t => /credit|usage|cost/i.test(t))) {
  const rows = safe(`recent ${t}`, () => q(`SELECT * FROM "${t}" ORDER BY rowid DESC LIMIT 3`));
  console.log(`table ${t}:`);
  if (rows) for (const r of rows) console.log('  ' + JSON.stringify(r).slice(0, 300));
}

console.log('\n=== 8. LEADS BY SOURCE (recent 7 days) ===');
const leadsBySource = safe('leads by source', () => q(`SELECT source, COUNT(*) c, MAX(datetime(createdAt/1000,'unixepoch')) latest FROM Lead GROUP BY source ORDER BY c DESC LIMIT 12`));
if (leadsBySource) for (const l of leadsBySource) console.log(JSON.stringify(l));

db.close();
console.log('\nDONE (readonly)');
