#!/usr/bin/env node
/**
 * READ-ONLY database forensics for recovery verification.
 * Inspects: live db/custom.db and boot-time backup db-backups/custom-20261003011952Z.db
 * Reports: table list, DiscoveryJob columns (looking for the 2 additive columns
 * idempotencyKey + useBusinessContext), key row counts, newest user/login.
 * Opens both files with readOnly:true. Never writes.
 */
import { DatabaseSync } from 'node:sqlite';

const targets = [
  ['LIVE db/custom.db', '/home/z/my-project/db/custom.db'],
  ['BOOT-BACKUP db-backups/custom-20261003011952Z.db', '/home/z/my-project/db-backups/custom-20261003011952Z.db'],
];

for (const [label, file] of targets) {
  console.log('='.repeat(80));
  console.log(label, '->', file);
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
  } catch (e) {
    console.log('  OPEN FAILED:', e.message);
    continue;
  }
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    console.log('  tables(' + tables.length + '):', tables.join(', '));
    const dj = db.prepare("PRAGMA table_info(DiscoveryJob)").all().map(c => c.name);
    console.log('  DiscoveryJob cols(' + dj.length + '):', dj.join(', '));
    console.log('  >> has idempotencyKey:', dj.includes('idempotencyKey'), '| has useBusinessContext:', dj.includes('useBusinessContext'));
    for (const t of ['User', 'Lead', 'Subscription', 'CreditsLedger', 'DiscoveryJob', 'PaymentOrder', 'WorkflowDefinition', 'WorkflowExecution', 'FeedbackReport', 'UserSession']) {
      if (!tables.includes(t)) { console.log(`  ${t}: MISSING-TABLE`); continue; }
      try { console.log('  ' + t + ': ' + db.prepare('SELECT count(*) c FROM "' + t + '"').get().c + ' rows'); }
      catch (e) { console.log(`  ${t}: ERR ${e.message.slice(0, 60)}`); }
    }
    try {
      const u = db.prepare('SELECT max(createdAt) m, count(*) c FROM User').get();
      const l = db.prepare('SELECT max(lastLoginAt) m FROM User').get();
      console.log(`  newest user createdAt: ${u.m} (of ${u.c}) | newest login: ${l.m}`);
    } catch (e) { console.log('  user-time ERR:', e.message.slice(0, 80)); }
  } finally {
    db.close();
  }
}
