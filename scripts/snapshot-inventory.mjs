#!/usr/bin/env node
/**
 * PART 1 — Read-only inventory of every recoverable DB snapshot.
 * Reports per snapshot: size, sha256, table count, schema drift vs live schema,
 * and business-critical row counts. Never writes to any DB.
 */
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FOR = path.join(ROOT, 'tool-results/db-forensics');
const LIVE = path.join(ROOT, 'db/custom.db');

const SNAPSHOTS = [
  { label: 'LIVE (db/custom.db)', file: LIVE, origin: 'current workspace (born 2026-09-23 00:53 UTC)' },
  ...fs.readdirSync(FOR).filter(f => f.endsWith('.db') && fs.statSync(path.join(FOR, f)).size > 0)
    .map(f => {
      let origin = 'git blob';
      if (f.startsWith('git-2026-09-12')) origin = 'git 5a02aa5 (initial commit, 2026-09-12)';
      else if (f.includes('2026-09-2103304')) origin = 'git 9f3aab7 2026-09-21 03:30';
      else if (f.includes('2026-09-2103470')) origin = 'git 8d7bb12 2026-09-21 03:47';
      else if (f.includes('2026-09-2108440')) origin = 'git 5fe5a25 2026-09-21 08:44 +05:30';
      else if (f.includes('2026-09-2104521')) origin = 'git 3cc5fcf 2026-09-21 04:52';
      else if (f.includes('2026-09-2119171')) origin = 'git e51fdad 2026-09-21 19:17';
      else if (f.includes('2026-09-2202272')) origin = 'git 2793670 2026-09-22 02:27';
      else if (f.includes('2026-09-2204153')) origin = 'git efbc216 2026-09-22 04:15 (db/custom.db — LAST TRACKED)';
      else if (f === 'git-restore-backup.db') origin = 'git efbc216 .restore-backups/live-data/custom.db';
      else if (f === 'git-backup-0921.db') origin = 'git efbc216 scripts/custom.db.backup-20260921-113257';
      else if (f === 'custom-2026-09-22T0415.db') origin = '(same blob as git-...0415, duplicate)';
      return { label: f, file: path.join(FOR, f), origin };
    }),
];

const COUNT_TABLES = {
  User: 'users', Lead: 'leads', Subscription: 'subscriptions', CreditsLedger: 'creditLedger',
  CreditAddon: 'creditAddons', PaymentOrder: 'paymentOrders', Invoice: 'invoices',
  FeedbackReport: 'feedback', AuditLog: 'auditLogs', ApiKey: 'apiKeys',
  WorkflowDefinition: 'workflows', WorkflowExecution: 'workflowRuns',
  OutreachSequence: 'outreachSequences', Deal: 'deals', EmailAccount: 'emailAccounts',
  Organization: 'orgs', UserSession: 'userSessions', EmailMessage: 'emailMessages',
  LeadActivity: 'leadActivities', DiscoveryJob: 'discoveryJobs',
};

function profile(file) {
  const size = fs.statSync(file).size;
  const sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const mtime = fs.statSync(file).mtime.toISOString();
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const out = {};
      const tables = await p.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
      out.tableCount = tables.length;
      out.tableNames = tables.map(t => t.name);
      for (const [tbl, key] of ${JSON.stringify(Object.entries(COUNT_TABLES))}) {
        if (!out.tableNames.includes(tbl)) { out[key] = 'MISSING-TABLE'; continue; }
        try { const r = await p.$queryRawUnsafe('SELECT count(*) c FROM "' + tbl + '"'); out[key] = Number(r[0].c); }
        catch (e) { out[key] = 'ERR'; }
      }
      // freshest activity
      try { const r = await p.$queryRawUnsafe('SELECT max(createdAt) m FROM User'); out.newestUser = r[0].m ? r[0].m.toString() : null; } catch {}
      try { const r = await p.$queryRawUnsafe('SELECT max(lastLoginAt) m FROM User'); out.newestLogin = r[0].m ? r[0].m.toString() : null; } catch {}
      console.log(JSON.stringify(out, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
      await p.$disconnect();
    })().catch(e => { console.log(JSON.stringify({ error: e.message.slice(0, 150) })); });
  `;
  const res = spawnSync('node', ['-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, DATABASE_URL: 'file:' + file },
  });
  let data = {};
  try { data = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { data = { error: 'parse-failed: ' + (res.stderr || '').slice(0, 120) }; }
  return { size, sha: sha.slice(0, 16), mtime, ...data };
}

// live schema model count for drift comparison
const schemaModels = (fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8').match(/^model /gm) || []).length;

const rows = SNAPSHOTS.filter(s => fs.existsSync(s.file)).map(s => {
  try { return { label: s.label, origin: s.origin, ...profile(s.file) }; }
  catch (e) { return { label: s.label, origin: s.origin, error: e.message.slice(0, 100) }; }
});

for (const r of rows) {
  console.log('─'.repeat(100));
  console.log(`${r.label}  [${r.origin}]`);
  console.log(`  size=${(r.size / 1e6).toFixed(2)}MB sha256=${r.sha}… tables=${r.tableCount} (schema has ${schemaModels} models → drift=${r.tableCount !== undefined ? schemaModels - r.tableCount : '?'})`);
  const keys = Object.values(COUNT_TABLES);
  const line = keys.map(k => `${k}=${r[k]}`).filter(x => !x.endsWith('=undefined')).join(' ');
  console.log('  ' + line);
  if (r.newestUser) console.log(`  newest user created: ${r.newestUser} | newest login: ${r.newestLogin}`);
  if (r.error) console.log('  ERROR:', r.error);
}
console.log('─'.repeat(100));
