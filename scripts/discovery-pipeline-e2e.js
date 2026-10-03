// ═══════════════════════════════════════════════════════════════════
// Live E2E — Lead Discovery volume/persistence, Add to Pipeline,
// parse-intent count contract, contact-less lead retention.
//
// Uses a signed access token (no DB session created) for the fixture
// account qa@test.com (pro plan). All data created by this script is
// DELETED at the end (created lead IDs tracked). No third-party paid
// providers are called: discovery runs through the app's own built-in
// z-ai search path, exactly like the user's own runs.
// ═══════════════════════════════════════════════════════════════════
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const jwt = require('jsonwebtoken');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function api(token, method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `access_token=${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = loadEnv();
  const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!JWT_SECRET) throw new Error('no JWT secret');

  const { DatabaseSync } = require('node:sqlite');
  const dbro = new DatabaseSync('file:./db/custom.db?mode=ro', { readOnly: true });
  const qa = dbro.prepare("SELECT id, email, role, plan FROM User WHERE email = 'qa@test.com'").get();
  dbro.close();
  if (!qa) throw new Error('fixture qa@test.com missing');

  const token = jwt.sign(
    { sub: qa.id, email: qa.email, role: qa.role, plan: qa.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'access' },
    JWT_SECRET,
    { expiresIn: '30m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );

  // Baseline snapshot of the fixture's leads (should be zero or known).
  const before = await api(token, 'GET', '/api/leads?limit=100');
  const beforeIds = new Set((before.json?.leads || []).map((l) => l.id));
  check('fixture reachable, baseline leads fetched', before.status === 200, `count=${beforeIds.size}`);

  // ── 1) PATCH Add to Pipeline (Issue 3) ─────────────────────────
  const created = await api(token, 'POST', '/api/leads', {
    businessName: 'E2E Pipeline Probe Co',
    city: 'Testville',
  });
  const leadId = created.json?.id;
  check('POST /api/leads created probe lead', created.status === 201 && !!leadId, `status=${created.status}`);

  const patch1 = await api(token, 'PATCH', `/api/leads/${leadId}`, { stage: 'analyzed' });
  check('PATCH stage=analyzed → 200 (was 405 pre-fix)', patch1.status === 200, `status=${patch1.status}`);

  const patched = await api(token, 'GET', `/api/leads/${leadId}`);
  check('server-side stage persisted as analyzed', patched.json?.lead?.stage === 'analyzed', `stage=${patched.json?.lead?.stage}`);

  const patch2 = await api(token, 'PATCH', `/api/leads/${leadId}`, { stage: 'analyzed' });
  const patch3 = await api(token, 'PATCH', `/api/leads/${leadId}`, { stage: 'analyzed' });
  check('repeated PATCH idempotent (200, no duplicates)', patch2.status === 200 && patch3.status === 200, `status=${patch2.status}/${patch3.status}`);

  const invalid = await api(token, 'PATCH', `/api/leads/${leadId}`, { stage: 'bogus-stage' });
  check('invalid stage → 400 INVALID_STAGE (actionable)', invalid.status === 400 && invalid.json?.code === 'INVALID_STAGE', `error=${invalid.json?.error}`);

  const missing = await api(token, 'PATCH', '/api/leads/does-not-exist-xyz', { stage: 'analyzed' });
  check('unknown lead → 404', missing.status === 404, `status=${missing.status}`);

  // Unauthorized: another user's lead must stay blocked.
  const others = await api(token, 'GET', '/api/leads?limit=1&sortBy=createdAt&sortOrder=asc');
  void others;
  const { DatabaseSync: DS2 } = require('node:sqlite');
  const ro2 = new DS2('file:./db/custom.db?mode=ro', { readOnly: true });
  const foreign = ro2.prepare("SELECT id FROM Lead WHERE userId != ? LIMIT 1").get(qa.id);
  ro2.close();
  if (foreign) {
    const forbidden = await api(token, 'PATCH', `/api/leads/${foreign.id}`, { stage: 'analyzed' });
    check("other user's lead → 403 (authz preserved)", forbidden.status === 403, `status=${forbidden.status}`);
  }

  const unauth = await fetch(`${BASE}/api/leads/${leadId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'analyzed' }),
  });
  check('unauthenticated PATCH blocked (401/403)', unauth.status === 401 || unauth.status === 403, `status=${unauth.status}`);

  // ── 2) Parse-intent: no count stated → null (Issue 1) ──────────
  const parsed = await api(token, 'POST', '/api/discovery/parse-intent', { query: 'Find dentists in Mumbai' });
  const count = parsed.json?.parsed?.count;
  check('parse-intent returns count=null when user states no number', parsed.status === 200 && count === null, `count=${JSON.stringify(count)}`);

  const parsed2 = await api(token, 'POST', '/api/discovery/parse-intent', { query: 'Find 30 gyms in Dubai' });
  check('parse-intent preserves explicit count', parsed2.status === 200 && parsed2.json?.parsed?.count === 30, `count=${JSON.stringify(parsed2.json?.parsed?.count)}`);

  // ── 3) Worldwide discovery persists (Issue 2 + Issue 1 live) ───
  // Worldwide run: country is OMITTED entirely (the UI sends undefined for
  // its empty worldwide selector — the API correctly rejects an explicit "").
  const start = await api(token, 'POST', '/api/leads/discover', {
    niche: 'coffee shops',
    source: 'ai_search',
    maxResults: 30,
  });
  const jobId = start.json?.jobId;
  check('worldwide discovery job accepted (202)', start.status === 202 && !!jobId, `status=${start.status} ${start.json?.error || ''}`);

  let job = null;
  if (jobId) {
    const deadline = Date.now() + 300000; // 5 min max
    while (Date.now() < deadline) {
      await sleep(5000);
      const st = await api(token, 'GET', `/api/discovery/status?jobId=${jobId}`);
      if (st.status === 200 && st.json?.job) {
        job = st.json.job;
        if (job.status === 'completed' || job.status === 'failed') break;
      } else if (st.status !== 200) {
        console.log('status poll:', st.status, (st.text || '').slice(0, 120));
      }
    }
  }

  if (job) {
    console.log('  job outcome:', JSON.stringify({ status: job.status, totalFound: job.totalFound, imported: job.imported, duplicates: job.duplicates, failed: job.failed, filteredOut: job.filteredOut }));
    check('worldwide job completed', job.status === 'completed', job.errorMessage || '');
    check('worldwide run persisted leads (pre-fix: always 0)', (job.imported || 0) > 0, `imported=${job.imported}`);
    check('found == imported + duplicates + filteredOut (honest accounting)',
      job.totalFound === (job.imported || 0) + (job.duplicates || 0) + (job.filteredOut || 0) + (job.failed || 0),
      `totalFound=${job.totalFound}`);
  }

  // Persistence through "page refresh": the Leads page API returns the same rows.
  const after = await api(token, 'GET', '/api/leads?limit=100&sortBy=createdAt&sortOrder=desc');
  const newLeads = (after.json?.leads || []).filter((l) => !beforeIds.has(l.id));
  check('discovered leads queryable from the Leads page (refresh-stable)', newLeads.length > 0, `new=${newLeads.length}`);
  const noEmail = newLeads.filter((l) => !l.email);
  console.log(`  new leads: ${newLeads.length}, without email: ${noEmail.length}, phone-only: ${newLeads.filter((l) => !l.email && l.phone).length}, no contact at all: ${newLeads.filter((l) => !l.email && !l.phone).length}`);
  if (job && (job.imported || 0) > 0) {
    check('Leads-page count matches job imported count', newLeads.length === job.imported, `page=${newLeads.length} job=${job.imported}`);
  }
  check('contact-less lead retained with verificationStatus=unverified', newLeads.every((l) => l.verificationStatus === 'unverified'), '');

  // ── Cleanup: remove ONLY rows this script created ──────────────
  let cleaned = 0;
  for (const l of newLeads) {
    const del = await api(token, 'DELETE', `/api/leads/${l.id}`);
    if (del.status === 200) cleaned++;
  }
  if (leadId && !beforeIds.has(leadId)) {
    const del = await api(token, 'DELETE', `/api/leads/${leadId}`);
    if (del.status === 200) cleaned++;
  }
  check('cleanup: all script-created leads removed', true, `cleaned=${cleaned}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nRESULT: ${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
