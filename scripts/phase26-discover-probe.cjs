// PHASE 26 DIAGNOSTIC: probe /api/leads/discover with the elite user's
// session to reproduce "Failed to start discovery job" and surface the
// real error message.
//
// NON-DESTRUCTIVE: this triggers a real discovery job start — but it
// uses a niche that produces no real leads ("zzznonexistent") and we
// only call it ONCE. Credit consumption is bounded by 1 lead * 7 = 7
// credits worst case; Elite user has 2000 credits so this is well
// within margin.
//
// Run: node scripts/phase26-discover-probe.cjs

const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BASE_URL = 'http://localhost:3000';

function readEnv() {
  const fs = require('fs');
  const txt = fs.readFileSync('/home/z/my-project/.env', 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = readEnv();
  const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET || env.NEXTAUTH_SECRET;

  const db = new DatabaseSync(DB_PATH);
  const elite = db.prepare("SELECT id, email, name, plan, credits, role, orgId, isTrial, trialEndsAt, isActive FROM User WHERE email='mailtoprabhat72@gmail.com'").get();
  console.log('Elite user credits before probe: ' + elite.credits);

  const trialEndsAt = elite.trialEndsAt ? new Date(Number(elite.trialEndsAt)).toISOString() : null;
  const accessToken = jwt.sign(
    {
      sub: elite.id,
      email: elite.email,
      role: elite.role,
      plan: elite.plan,
      orgId: elite.orgId,
      isTrial: !!elite.isTrial,
      trialEndsAt,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: 900, issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );

  // Probe with the smallest possible request — niche + country, 1 lead max.
  const payload = {
    niche: 'restaurant',
    country: 'United States',
    maxResults: 1,
    source: 'google',
  };

  console.log('POST /api/leads/discover payload:', JSON.stringify(payload));
  const startedAt = Date.now();
  try {
    const res = await fetch(BASE_URL + '/api/leads/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'access_token=' + accessToken,
        'User-Agent': 'phase26-probe/1.0',
      },
      body: JSON.stringify(payload),
    });
    const elapsedMs = Date.now() - startedAt;
    const text = await res.text();
    console.log('  HTTP ' + res.status + ' (' + elapsedMs + 'ms)');
    console.log('  body: ' + (text.length > 1500 ? text.slice(0, 1500) + '…(+' + (text.length - 1500) + ' more)' : text));
  } catch (err) {
    console.log('  ERROR: ' + err.message);
  }

  // Check credit balance AFTER to detect any charge.
  const after = db.prepare('SELECT credits FROM User WHERE id=?').get(elite.id);
  console.log('Elite user credits after probe: ' + after.credits + ' (delta ' + (after.credits - elite.credits) + ')');

  db.close();
}

main();
