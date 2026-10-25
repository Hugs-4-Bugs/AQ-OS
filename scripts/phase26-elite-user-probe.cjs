// PHASE 26 DIAGNOSTIC: simulate the elite user's session and probe the
// /api/subscriptions/current + /api/subscriptions/entitlements endpoints
// to verify the plan resolution chain end-to-end.
//
// This script is NON-DESTRUCTIVE: it reads the user row, generates a JWT
// access token using the SAME secret the app uses, and calls the live
// /api/subscriptions/* endpoints with a Cookie header. No DB writes,
// no application state changes.
//
// Run: node scripts/phase26-elite-user-probe.cjs

const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = '/home/z/my-project/db/custom.db';
const BASE_URL = 'http://localhost:3000';

function mask(s) {
  if (!s) return '(none)';
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '*'.repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

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
  if (!JWT_SECRET) {
    console.error('MISSING JWT/AUTH/NEXTAUTH SECRET — cannot mint probe token');
    process.exit(1);
  }
  console.log('JWT secret: present (len=' + JWT_SECRET.length + ', masked ' + mask(JWT_SECRET) + ')');

  const db = new DatabaseSync(DB_PATH);
  const elite = db.prepare("SELECT id, email, name, plan, credits, creditsMonthly, rolloverCredits, isTrial, role, orgId, trialEndsAt, isActive FROM User WHERE email='mailtoprabhat72@gmail.com'").get();
  if (!elite) {
    console.error('Elite user not found');
    process.exit(1);
  }
  console.log('Elite user row:');
  console.log('  id=' + elite.id);
  console.log('  email=' + elite.email);
  console.log('  name=' + elite.name);
  console.log('  plan=' + elite.plan);
  console.log('  credits=' + elite.credits + ' / monthly=' + elite.creditsMonthly);
  console.log('  role=' + elite.role + ' isActive=' + elite.isActive);
  console.log('  isTrial=' + elite.isTrial + ' trialEndsAt=' + elite.trialEndsAt);

  // Mint a 15-min access token (same shape as src/lib/auth.ts:generateAccessToken)
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
  console.log('Minted access_token (len=' + accessToken.length + ')');

  // Probe the endpoints
  const endpoints = [
    '/api/subscriptions/current',
    '/api/subscriptions/entitlements',
    '/api/auth/me',
  ];
  for (const path of endpoints) {
    const url = BASE_URL + path;
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Cookie: 'access_token=' + accessToken,
          'User-Agent': 'phase26-probe/1.0',
        },
      });
      const elapsedMs = Date.now() - startedAt;
      const status = res.status;
      const text = await res.text();
      let bodySummary = text;
      if (text && text.length > 800) bodySummary = text.slice(0, 800) + '…(+' + (text.length - 800) + ' more)';
      console.log('---');
      console.log('GET ' + path + ' → HTTP ' + status + ' (' + elapsedMs + 'ms)');
      console.log('  body: ' + bodySummary);
    } catch (err) {
      console.log('---');
      console.log('GET ' + path + ' → ERROR: ' + err.message);
    }
  }

  db.close();
}

main();
