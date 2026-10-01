// Live E2E #2 — bulk volume demonstration + credit deduction on fresh imports
// Controlled: ONE ai_search job, maxResults 20, fresh niche for the fixture user.
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const envText = fs.readFileSync('/home/z/my-project/.env', 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  })
);
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET || env.NEXTAUTH_SECRET;
const USER = { id: 'cmqivowcz0000nrkt128gkmqg', email: 'realtest+signup@example.com', role: 'owner', plan: 'free', orgId: null };

const token = jwt.sign(
  { sub: USER.id, email: USER.email, role: USER.role, plan: USER.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'access' },
  JWT_SECRET,
  { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);

const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, urlPath, body) {
  return fetch(BASE + urlPath, {
    method,
    headers: { Authorization: `Bearer ${token}`, Cookie: `access_token=${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

(async () => {
  // FREE plan entitlement: limit 10, 3 leads already imported → remaining = 7.
  // The job target must be CAPPED server-side to 7 (entitlement enforcement).
  const requested = 20;
  const res = await api('POST', '/api/leads/discover', {
    niche: 'coffee shop',
    country: 'Canada',
    source: 'ai_search',
    maxResults: requested,
  });
  const { jobId } = await res.json();
  console.log(`requested=${requested} (server should cap to remaining allowance = 7 on free plan)`);

  const start = Date.now();
  let job = null;
  while (Date.now() - start < 240000) {
    const r = await api('GET', `/api/leads/discover/status/${jobId}`);
    const d = await r.json();
    job = d.job || d;
    if (job.status === 'completed' || job.status === 'failed') break;
    process.stdout.write(`  ...${job.status} found=${job.totalFound} imported=${job.imported} dups=${job.duplicates}\r`);
    await sleep(5000);
  }
  console.log('');
  console.log(JSON.stringify({
    status: job?.status,
    requested,
    totalFound: job?.totalFound,
    imported: job?.imported,
    duplicates: job?.duplicates,
    filteredOut: job?.filteredOut,
    errorMessage: job?.errorMessage,
    sources: [...new Set((job?.resultData || []).map((l) => l.source))],
    countries: [...new Set((job?.resultData || []).map((l) => l.country))],
    provenance: [...new Set((job?.resultData || []).map((l) => (l.discoveredVia || '').slice(0, 40)))].slice(0, 4),
  }, null, 1));

  // Ledger + balance
  const { DatabaseSync } = require('node:sqlite');
  const snap = path.join('/home/z/my-project/.test-tmp', `e2e2-${Date.now()}.db`);
  fs.copyFileSync('/home/z/my-project/db/custom.db', snap);
  const d = new DatabaseSync(snap, { readOnly: true });
  const toMs = (v) => (v instanceof Date ? v.getTime() : new Date(String(v).replace(' ', 'T') + 'Z').getTime());
  const tenMinAgo = Date.now() - 15 * 60 * 1000;
  const ledger = d.prepare(`SELECT action, credits, balance, createdAt, description FROM CreditsLedger WHERE userId = ? ORDER BY createdAt DESC LIMIT 30`).all(USER.id)
    .filter((e) => toMs(e.createdAt) >= tenMinAgo);
  const user = d.prepare(`SELECT credits FROM User WHERE id = ?`).get(USER.id);
  const leadCount = d.prepare(`SELECT COUNT(*) AS n FROM Lead WHERE userId = ?`).get(USER.id);
  const withProv = d.prepare(`SELECT COUNT(*) AS n FROM Lead WHERE userId = ? AND discoveredVia IS NOT NULL AND verificationStatus IS NOT NULL`).get(USER.id);
  d.close();
  fs.unlinkSync(snap);

  console.log('recent ledger:', JSON.stringify(ledger.map((e) => ({ a: e.action, c: e.credits, b: e.balance }))));
  console.log(`user.credits=${user.credits} totalLeads=${leadCount.n} leadsWithProvenance=${withProv.n}`);
  console.log(`ENTITLEMENT CHECK: free plan limit 10 → imported should stop at ${10 - 3} (3 pre-existing)`);
})();
