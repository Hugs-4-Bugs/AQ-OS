// Phase 2 DB safety snapshot — BEFORE any changes (read-only).
// Counts only; no credentials, no PII.
import { Database } from 'bun:sqlite';

const db = new Database('/home/z/my-project/db/custom.db', { readonly: true });

const tables = db.query("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
const users = db.query('SELECT count(*) as c FROM User').get();
const leads = db.query('SELECT count(*) as c FROM Lead').get();
const subs = db.query('SELECT count(*) as c FROM Subscription').get();
const discoveryJobs = db.query('SELECT count(*) as c FROM DiscoveryJob').get();
const aiSearchLeads = db.query("SELECT count(*) as c FROM Lead WHERE source = 'ai_search'").get();

console.log(JSON.stringify({
  at: new Date().toISOString(),
  phase: 'phase2-before',
  tables: tables.c,
  users: users.c,
  leads: leads.c,
  subscriptions: subs.c,
  discoveryJobs: discoveryJobs.c,
  aiSearchLeads: aiSearchLeads.c,
}, null, 2));
