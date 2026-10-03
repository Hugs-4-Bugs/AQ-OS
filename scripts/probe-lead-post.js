// Focused probe: POST /api/leads 500 + parse-intent response bodies.
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
  const dbro = new DatabaseSync('file:./db/custom.db?mode=ro', { readOnly: true });
  const qa = dbro.prepare("SELECT id, email, role, plan FROM User WHERE email = 'qa@test.com'").get();
  dbro.close();
  const token = jwt.sign(
    { sub: qa.id, email: qa.email, role: qa.role, plan: qa.plan, orgId: null, isTrial: false, trialEndsAt: null, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
  const headers = { Authorization: `Bearer ${token}`, Cookie: `access_token=${token}`, 'Content-Type': 'application/json' };

  console.log('qa plan:', qa.plan, 'role:', qa.role);

  const res1 = await fetch('http://localhost:3000/api/leads', {
    method: 'POST', headers, body: JSON.stringify({ businessName: 'Probe Co', city: 'Testville' }),
  });
  console.log('POST /api/leads →', res1.status, (await res1.text()).slice(0, 400));

  const res2 = await fetch('http://localhost:3000/api/discovery/parse-intent', {
    method: 'POST', headers, body: JSON.stringify({ query: 'Find dentists in Mumbai' }),
  });
  console.log('parse-intent(no count) →', res2.status, (await res2.text()).slice(0, 600));
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
