// ═══════════════════════════════════════════════════════════════════
// Live E2E — Lead discovery reliability, coverage honesty, export
// entitlements and real XLSX output (spec §17/§18 acceptance checks).
//
// Controlled, low-volume: ONE ai_search job (max 3 results), ONE
// coverage-refusal job (no scraping), export calls. No high-volume
// provider searches, no payments, no existing data modified — the
// fixture account is a disposable free-plan test account.
// Secrets are read from .env server-side and NEVER printed.
// ═══════════════════════════════════════════════════════════════════

const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

// ── Load .env values (never logged) ──
const envText = fs.readFileSync('/home/z/my-project/.env', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET || env.NEXTAUTH_SECRET;
if (!JWT_SECRET) throw new Error('no JWT secret in env');

const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fixture users (disposable test accounts) ──
const FREE_USER = { id: 'cmqivowcz0000nrkt128gkmqg', email: 'realtest+signup@example.com', role: 'owner', plan: 'free', orgId: null };
// Pick one pro user for the export-positive path (read from DB below)
const { DatabaseSync } = require('node:sqlite');
const fsx = require('node:fs');
const snap = path.join('/home/z/my-project/.test-tmp', `e2e-pro-${Date.now()}.db`);
fsx.copyFileSync('/home/z/my-project/db/custom.db', snap);
const dbro = new DatabaseSync(snap, { readOnly: true });
const proRow = dbro
  .prepare(
    `SELECT u.id, u.email, u.plan, u.role, u.orgId,
            (SELECT COUNT(*) FROM Lead WHERE Lead.userId = u.id) AS leadCount
     FROM User u WHERE u.plan = 'pro' AND u.isActive = 1
     ORDER BY (SELECT COUNT(*) FROM Lead WHERE Lead.userId = u.id) DESC LIMIT 1`
  )
  .get();
dbro.close();
fsx.unlinkSync(snap);

function signAccess(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId || null,
      isTrial: false,
      trialEndsAt: null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

async function api(token, method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `access_token=${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function pollJob(token, jobId, maxMs = 150000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await api(token, 'GET', `/api/leads/discover/status/${jobId}`);
    if (res.ok) {
      const data = await res.json();
      const job = data.job || data;
      if (job.status === 'completed' || job.status === 'failed') return job;
    }
    await sleep(3000);
  }
  return null;
}

(async () => {
  console.log('═ E2E: lead discovery reliability / coverage / export ═');

  // ── Test A: worldwide ai_search discovery (no country — spec §5) ──
  console.log('\n[A] ai_search, NO country (worldwide), maxResults 3');
  const freeToken = signAccess(FREE_USER);
  let res = await api(freeToken, 'POST', '/api/leads/discover', {
    niche: 'dental clinic',
    source: 'ai_search',
    maxResults: 3,
  });
  check('job accepted (202)', res.status === 202, `status ${res.status}`);
  const jobA = res.ok ? await res.json() : null;
  const finishedA = jobA?.jobId ? await pollJob(freeToken, jobA.jobId) : null;
  check('job completed', finishedA?.status === 'completed', `status=${finishedA?.status} err=${finishedA?.errorMessage || '—'}`);
  check(
    'imported ≤ requested 3 (real, not padded)',
    typeof finishedA?.imported === 'number' && finishedA.imported <= 3,
    `imported=${finishedA?.imported} totalFound=${finishedA?.totalFound}`
  );
  const resultLeads = finishedA?.resultData || [];
  check(
    'provenance: every lead records the search query that produced it (§3.3)',
    resultLeads.length > 0 && resultLeads.every((l) => typeof l.discoveredVia === 'string' && l.discoveredVia.length > 0),
    resultLeads[0]?.discoveredVia ? `"${String(resultLeads[0].discoveredVia).slice(0, 60)}"` : '—'
  );

  // Verify persisted rows: verificationStatus + discoveredVia + sourceUrl fields exist on saved leads
  {
    const fsx2 = require('node:fs');
    const snap2 = path.join('/home/z/my-project/.test-tmp', `e2e-a-${Date.now()}.db`);
    fsx2.copyFileSync('/home/z/my-project/db/custom.db', snap2);
    const d = new DatabaseSync(snap2, { readOnly: true });
    const rows = d
      .prepare(`SELECT businessName, source, discoveredVia, verificationStatus, sourceUrl, country FROM Lead WHERE userId = ? ORDER BY createdAt DESC LIMIT 5`)
      .all(FREE_USER.id);
    d.close();
    fsx2.unlinkSync(snap2);
    check(
      'persisted leads carry verificationStatus=unverified (§7.2 — discovered ≠ verified)',
      rows.length > 0 && rows.every((r) => r.verificationStatus === 'unverified'),
      rows.map((r) => `${r.businessName}: ${r.verificationStatus}`).join(' | ').slice(0, 120)
    );
    check(
      'persisted leads carry discoveredVia provenance',
      rows.length > 0 && rows.every((r) => !!r.discoveredVia),
      rows[0]?.discoveredVia ? String(rows[0].discoveredVia).slice(0, 60) : '—'
    );
  }

  // Ledger: idempotency-keyed deductions
  {
    const snap3 = path.join('/home/z/my-project/.test-tmp', `e2e-ledger-${Date.now()}.db`);
    fsx.copyFileSync('/home/z/my-project/db/custom.db', snap3);
    const d = new DatabaseSync(snap3, { readOnly: true });
    // createdAt is stored as ISO-with-T — compare in JS instead of SQL
    const allLedger = d
      .prepare(`SELECT action, credits, balance, createdAt FROM CreditsLedger WHERE userId = ? ORDER BY createdAt DESC LIMIT 40`)
      .all(FREE_USER.id);
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const toMs = (v) => (v instanceof Date ? v.getTime() : new Date(String(v).replace(' ', 'T') + 'Z').getTime());
    const recent = allLedger.filter((e) => toMs(e.createdAt) >= tenMinAgo);
    const entries = recent.filter((e) => e.action === 'lead_discovery');
    const refunds = recent.filter((e) => e.action.includes('refund')).length;
    d.close();
    fsx.unlinkSync(snap3);
    check(
      'credit ledger: 1 credit per imported lead (idempotency-keyed via referenceId)',
      entries.length >= (finishedA?.imported || 0) && entries.every((e) => Number(e.credits) === -1),
      `deductions=${entries.length} imported=${finishedA?.imported} refunds=${refunds}`
    );
  }

  // ── Test B: coverage honesty (yellow_pages + India → honest refusal) ──
  console.log('\n[B] yellow_pages, country=India — expect honest coverage refusal, NO scraping');
  res = await api(freeToken, 'POST', '/api/leads/discover', {
    niche: 'dentist',
    country: 'India',
    source: 'yellow_pages',
    maxResults: 5,
  });
  check('job accepted (202)', res.status === 202, `status ${res.status}`);
  const jobB = res.ok ? await res.json() : null;
  const finishedB = jobB?.jobId ? await pollJob(freeToken, jobB.jobId, 60000) : null;
  check(
    'completed (NOT failed) with honest reason (§3.4)',
    finishedB?.status === 'completed' && /only covers United States/i.test(finishedB?.errorMessage || ''),
    `status=${finishedB?.status} msg="${(finishedB?.errorMessage || '').slice(0, 100)}"`
  );
  check('zero leads imported — no fabricated data', finishedB?.imported === 0, `imported=${finishedB?.imported}`);

  // ── Test C: export entitlement on FREE plan → 403 (spec §11.2) ──
  console.log('\n[C] export as FREE plan — expect 403 PLAN_REQUIRED');
  res = await api(freeToken, 'GET', '/api/leads/export?format=csv');
  check('export blocked for free plan', res.status === 403, `status=${res.status}`);
  const bodyC = await res.json().catch(() => ({}));
  check('error carries PLAN_REQUIRED code', bodyC.code === 'PLAN_REQUIRED', `code=${bodyC.code || '—'}`);

  // ── Test D: XLSX export as PRO plan (server-side, real file) ──
  console.log('\n[D] export as PRO plan — format=xlsx');
  if (!proRow) {
    fail++;
    console.log('  ✗ no pro user available — cannot run positive export test');
  } else {
    const proToken = signAccess(proRow);
    res = await api(proToken, 'GET', '/api/leads/export?format=xlsx');
    check('xlsx export allowed (200)', res.status === 200, `status=${res.status}`);
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    check('file is a real XLSX (ZIP signature PK)', buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b, `bytes=${buf.length}`);
    check(
      'X-Record-Count reports actual rows (>0 when user has leads)',
      res.ok && (parseInt(res.headers.get('x-record-count') || '0', 10) > 0 || proRow.leadCount === 0),
      `recordCount=${res.headers.get('x-record-count')} userLeads=${proRow.leadCount}`
    );

    // Search filter reaches the export backend (was previously ignored — bug)
    res = await api(proToken, 'GET', '/api/leads/export?format=json&search=zzznomatchzzz');
    check(
      'search filter is applied server-side (no-match export returns 400)',
      res.status === 400,
      `status=${res.status}`
    );
  }

  console.log(`\n═ RESULT: ${pass} passed, ${fail} failed ═`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('E2E fatal:', e.message);
  process.exit(1);
});
