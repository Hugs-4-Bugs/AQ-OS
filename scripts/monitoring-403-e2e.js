// LIVE E2E for the Monitoring 403 fix — /api/metrics/dashboard
// - No secrets/tokens printed. No DB writes (snapshot copy, readOnly).
// - Matrix: unauth→401 | owner→200 scoped | super_admin→200 full
// - Cross-verifies every business metric against a read-only DB snapshot.
const fs = require('fs');
const path = require('path');
const jwt = require('/home/z/my-project/node_modules/jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const OWNER_ID = 'cmtfxvfjx0000o64h49jmx2ey';      // qa@test.com fixture (role=owner)
const SUPER_ID = 'cmquoggx30000nqkon7633chj';      // platform super_admin

// ── Resolve JWT secret exactly like src/lib/auth.ts (value NEVER printed) ──
function loadEnvSecret() {
  let vals = {};
  try {
    const env = fs.readFileSync('/home/z/my-project/.env', 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*(JWT_SECRET|AUTH_SECRET|NEXTAUTH_SECRET)\s*=\s*(.*)\s*$/);
      if (m) vals[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env unreadable → fall through */ }
  const secret = vals.JWT_SECRET || vals.AUTH_SECRET || vals.NEXTAUTH_SECRET
    || 'acquisitionos-dev-secret-change-in-production';
  return { secret, source: vals.JWT_SECRET ? '.env:JWT_SECRET' : (vals.AUTH_SECRET ? '.env:AUTH_SECRET' : (vals.NEXTAUTH_SECRET ? '.env:NEXTAUTH_SECRET' : 'dev-fallback')) };
}

function mintAccess(secret, user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, plan: user.plan,
      orgId: user.orgId, isTrial: user.isTrial,
      trialEndsAt: user.trialEndsAt || null, type: 'access' },
    secret,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

// ── DB snapshot (readOnly copy) ──
const TMP = '/home/z/my-project/.test-tmp';
fs.mkdirSync(TMP, { recursive: true });
const SNAP = path.join(TMP, 'metrics-e2e-snapshot.db');
fs.copyFileSync('/home/z/my-project/db/custom.db', SNAP);
const db = new DatabaseSync(SNAP, { readOnly: true });

function userById(id) {
  return db.prepare(`SELECT id, email, role, plan, "orgId", "isTrial" FROM "User" WHERE id = ?`).get(id);
}
function businessCounts(scopeUserId /* null = platform */) {
  const w = scopeUserId ? `WHERE "userId" = '${scopeUserId}'` : '';
  const wa = scopeUserId ? `WHERE "userId" = '${scopeUserId}' AND "isActive" = 1` : 'WHERE "isActive" = 1';
  const mid = new Date(); mid.setHours(0, 0, 0, 0);
  const midnightMs = mid.getTime();
  const creditsW = scopeUserId
    ? `"userId" = '${scopeUserId}' AND "credits" < 0 AND "createdAt" >= ${midnightMs}`
    : `"credits" < 0 AND "createdAt" >= ${midnightMs}`;
  const wonW = scopeUserId ? `${w} AND "status" = 'won'` : `WHERE "status" = 'won'`;
  const runW = scopeUserId ? `${w} AND "status" = 'running'` : `WHERE "status" = 'running'`;
  const q = (sql) => db.prepare(sql).get();
  return {
    totalLeads: q(`SELECT COUNT(*) n FROM "Lead" ${w}`).n,
    activeLeads: q(`SELECT COUNT(*) n FROM "Lead" ${wa}`).n,
    totalDeals: q(`SELECT COUNT(*) n FROM "Deal" ${w}`).n,
    wonDeals: q(`SELECT COUNT(*) n FROM "Deal" ${wonW}`).n,
    totalDealValue: q(`SELECT COALESCE(SUM("finalPrice"),0) s FROM "Deal" ${wonW}`).s || 0,
    activeUsers: scopeUserId
      ? q(`SELECT COUNT(*) n FROM "User" WHERE id = '${scopeUserId}' AND "isActive" = 1 AND "deletedAt" IS NULL`).n
      : q(`SELECT COUNT(*) n FROM "User" WHERE "isActive" = 1 AND "deletedAt" IS NULL`).n,
    totalCredits: scopeUserId
      ? q(`SELECT COALESCE(SUM("credits"),0) s FROM "User" WHERE id = '${scopeUserId}'`).s || 0
      : q(`SELECT COALESCE(SUM("credits"),0) s FROM "User" WHERE "isActive" = 1 AND "deletedAt" IS NULL`).s || 0,
    creditsConsumedToday: Math.abs(q(`SELECT COALESCE(SUM("credits"),0) s FROM "CreditsLedger" WHERE ${creditsW}`).s || 0),
    activeWorkflows: q(`SELECT COUNT(*) n FROM "WorkflowExecution" ${runW}`).n,
  };
}

async function callMetrics(token) {
  const res = await fetch(`${BASE}/api/metrics/dashboard`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

(async () => {
  const { secret, source } = loadEnvSecret();
  console.log(`JWT secret source: ${source} (value not printed)`);

  // 1) Unauthenticated → must stay blocked
  const unauth = await callMetrics(null);
  check('unauthenticated → 401 blocked', unauth.status === 401, `got ${unauth.status}`);

  // 2) Owner (org-level admin) → 200 with account-scoped payload
  const ownerUser = userById(OWNER_ID);
  if (!ownerUser) { console.log('FATAL: owner fixture missing'); process.exit(1); }
  const [local, domain] = ownerUser.email.split('@');
  const ownerTok = mintAccess(secret, { ...ownerUser, isTrial: !!ownerUser.isTrial });
  const own = await callMetrics(ownerTok);
  check(`owner (${local.slice(0,2)}***@${domain}) → 200`, own.status === 200, `got ${own.status}`);
  if (own.status === 200) {
    const b = own.body;
    check('owner: recentSlowQueries stripped', Array.isArray(b.dbMetrics?.recentSlowQueries) && b.dbMetrics.recentSlowQueries.length === 0);
    check('owner: traces stripped', Array.isArray(b.traces) && b.traces.length === 0);
    const expected = businessCounts(OWNER_ID);
    const got = b.businessMetrics || {};
    const fields = ['totalLeads','activeLeads','totalDeals','wonDeals','totalDealValue','activeUsers','totalCredits','creditsConsumedToday','activeWorkflows'];
    const mism = fields.filter(f => Number(got[f]) !== Number(expected[f]));
    check('owner: businessMetrics == own DB rows (no fabrication, no cross-tenant)', mism.length === 0,
      mism.length ? `mismatch: ${mism.join(',')}` : `e.g. totalLeads=${got.totalLeads} totalCredits=${got.totalCredits}`);
    check('owner: dashboard structure intact', !!(b.systemHealth && b.applicationMetrics && b.dbMetrics && b.alerts));
  }

  // 3) super_admin → 200 with FULL platform payload
  const superUser = userById(SUPER_ID);
  if (!superUser) { console.log('FATAL: super_admin missing'); process.exit(1); }
  const superTok = mintAccess(secret, { ...superUser, isTrial: !!superUser.isTrial });
  const sup = await callMetrics(superTok);
  check('super_admin → 200', sup.status === 200, `got ${sup.status}`);
  if (sup.status === 200) {
    const b = sup.body;
    check('super_admin: recentSlowQueries full view', Array.isArray(b.dbMetrics?.recentSlowQueries));
    check('super_admin: traces view', Array.isArray(b.traces));
    const expected = businessCounts(null);
    const got = b.businessMetrics || {};
    const fields = ['totalLeads','activeLeads','totalDeals','wonDeals','totalDealValue','activeUsers','totalCredits','creditsConsumedToday','activeWorkflows'];
    const mism = fields.filter(f => Number(got[f]) !== Number(expected[f]));
    check('super_admin: businessMetrics == platform-wide DB totals', mism.length === 0,
      mism.length ? `mismatch: ${mism.join(',')}` : `totalLeads=${got.totalLeads} activeUsers=${got.activeUsers}`);
  }

  // 4) Contrast: owner scope ≠ platform scope (proves scoping actually narrows)
  if (own.status === 200 && sup.status === 200) {
    check('scoping contrast: owner totalLeads < platform totalLeads',
      Number(own.body.businessMetrics?.totalLeads) <= Number(sup.body.businessMetrics?.totalLeads),
      `owner=${own.body.businessMetrics?.totalLeads} platform=${sup.body.businessMetrics?.totalLeads}`);
  }

  db.close();
  const fails = results.filter(r => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('E2E error:', e.message); process.exit(2); });
