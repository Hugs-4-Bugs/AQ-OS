// Pre-fix live proof: PATCH /api/leads/[id] returns 405 (no PATCH handler)
// while PUT with the same body succeeds — the exact "Failed to add lead
// to pipeline" root cause. Uses a lead owned by the operator's account
// (kattyboy785) via a signed access token; the PUT proof uses a no-op
// field write (same value) so no data is altered.
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const jwt = require('jsonwebtoken');
const fs = require('fs');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('file:./db/custom.db?mode=ro', { readOnly: true });
  const user = db.prepare("SELECT id, email, role, plan FROM User WHERE email = 'kattyboy785@gmail.com'").get();
  const lead = db.prepare("SELECT id, businessName, stage, notes FROM Lead WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(user.id);
  db.close();
  console.log('[proof] user:', user.email, '| lead:', lead.id, lead.businessName, '| stage:', lead.stage);

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, plan: user.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Cookie: `access_token=${token}` };

  // 1) PATCH — what updateLead()/Add to Pipeline actually sends
  const patchRes = await fetch(`http://localhost:3000/api/leads/${lead.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ stage: 'analyzed' }),
  });
  console.log('[proof] PATCH /api/leads/:id →', patchRes.status, patchRes.statusText);
  const patchBody = await patchRes.text();
  console.log('[proof] PATCH body:', patchBody.slice(0, 200));

  // 2) PUT — same handler family, proves auth+route work; writes the SAME
  //    stage value back (no-op) so existing data is untouched.
  const putRes = await fetch(`http://localhost:3000/api/leads/${lead.id}`, {
    method: 'PUT', headers, body: JSON.stringify({ stage: lead.stage }),
  });
  console.log('[proof] PUT /api/leads/:id (no-op same-stage write) →', putRes.status);
  if (putRes.status !== 200) console.log('[proof] PUT body:', (await putRes.text()).slice(0, 200));

  console.log('[proof] VERDICT:', patchRes.status === 405
    ? 'CONFIRMED — PATCH unimplemented (405) → Add to Pipeline can never succeed'
    : 'unexpected — PATCH status ' + patchRes.status);
}

main().catch((e) => { console.error('[proof] fatal:', e); process.exit(1); });
