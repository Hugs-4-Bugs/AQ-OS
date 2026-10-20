// Phase 2 FINAL verification — deep DB + credit + uniqueness audit for the
// clean-slate 70-target job, read-only against the canonical DB.
// Verifies: persistence, uniqueness (URL/domain/name/email/id), provenance,
// credit contract, job accounting, and API-vs-DB consistency.
import { Database } from 'bun:sqlite';

const JOB_ID = require('node:fs').readFileSync('.test-tmp/final-job-id.txt', 'utf8').trim();
const QA_USER_ID = 'cmv7kyrf20000nau09rowvc6x';

const db = new Database('db/custom.db', { readonly: true });

const user = db.query('SELECT credits, plan FROM User WHERE id = ?').get(QA_USER_ID) as { credits: number; plan: string };
const job = db.query('SELECT status, totalFound, imported, duplicates, failed, startedAt, completedAt FROM DiscoveryJob WHERE id = ?').get(JOB_ID) as Record<string, number | string>;

// Leads created by THIS job: createdAt within job window for this user.
// (The service sets lead.createdAt at import time; job-scoped via time window.)
const leads = db.query(
  `SELECT id, businessName, website, email, source, discoveredVia, verificationStatus, city, country, createdAt
   FROM Lead WHERE userId = ? AND createdAt >= ? AND createdAt <= ?`
).all(QA_USER_ID, job.startedAt as string, job.completedAt as string) as Array<Record<string, string | null>>;

const norm = (s: string | null) => (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const nameKey = (s: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const domain = (s: string | null) => norm(s).replace(/\..*$/, ''); // domain identity without TLD

const ids = leads.map((l) => l.id);
const urls = leads.map((l) => norm(l.website)).filter(Boolean);
const domains = leads.map((l) => domain(l.website)).filter(Boolean);
const nameKeys = leads.map((l) => nameKey(l.businessName));
const emails = leads.map((l) => (l.email || '').toLowerCase()).filter(Boolean);

const dupCounts = (arr: string[], label: string) => {
  const seen = new Set<string>(); let dups = 0;
  for (const v of arr) { if (seen.has(v)) dups++; seen.add(v); }
  return { label, total: arr.length, unique: seen.size, duplicates: dups };
};

// Credit ledger entries for this job (idempotency key = job + position)
const ledger = db.query(
  `SELECT count(*) as n, sum(credits) as spent FROM CreditsLedger WHERE userId = ? AND description LIKE ?`
).get(QA_USER_ID, `%${JOB_ID}%`) as { n: number; spent: number | null };

const report = {
  job: { id: JOB_ID, ...job },
  qaUser: { plan: user.plan, creditsAfter: user.credits },
  newLeadsInDb: leads.length,
  jobImportedVsDbLeads: { jobImported: job.imported, dbLeadsInWindow: leads.length },
  uniqueness: [
    dupCounts(ids, 'db-identity-keys(id)'),
    dupCounts(urls, 'normalized-urls'),
    dupCounts(domains, 'domain-identities(no-TLD)'),
    dupCounts(nameKeys, 'normalized-business-names'),
    dupCounts(emails, 'emails'),
  ],
  provenance: {
    leadsWithDiscoveredVia: leads.filter((l) => l.discoveredVia && l.discoveredVia.trim().length > 0).length,
    leadsWithSource: leads.filter((l) => l.source).length,
    distinctProvenanceQueries: new Set(leads.map((l) => l.discoveredVia)).size,
    sample: leads.slice(0, 3).map((l) => ({ name: l.businessName, via: (l.discoveredVia || '').slice(0, 70) })),
  },
  verificationStatuses: leads.reduce((acc, l) => { const k = l.verificationStatus || 'null'; acc[k] = (acc[k] || 0) + 1; return acc; }, {} as Record<string, number>),
  location: { hyderabad: leads.filter((l) => (l.city || '').toLowerCase().includes('hyderabad')).length, india: leads.filter((l) => (l.country || '').toLowerCase() === 'india').length },
  creditLedgerEntriesForJob: ledger.n,
  creditsExpectedAfter: 78 - Number(job.imported), // 1 credit per imported lead (CREDIT_COSTS.lead_discovery=1)
  creditsActualAfter: user.credits,
  creditContractHolds: user.credits === 78 - Number(job.imported),
};
console.log(JSON.stringify(report, null, 2));
