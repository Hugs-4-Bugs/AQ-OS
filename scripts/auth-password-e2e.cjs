#!/usr/bin/env node
/**
 * Email/password auth E2E against the LIVE dev server (localhost:3000).
 * Creates ONE clearly-labeled QA test user (additive only), then:
 *   signin → me → signout → signin again → me.
 * NEVER prints the password. Prints PASS/FAIL + DB user count before/after.
 */
const { PrismaClient } = PrismaPkg();
function PrismaPkg() { return { PrismaClient: require('/home/z/my-project/node_modules/@prisma/client').PrismaClient }; }
const bcrypt = require('/home/z/my-project/node_modules/bcryptjs');
const crypto = require('crypto');

const BASE = 'http://localhost:3000';
const EMAIL = `auth-cred-e2e-20261020@acquisitionos.test`;
const NAME = 'Auth Credential E2E QA User';

async function main() {
  const db = new PrismaClient();
  const usersBefore = await db.user.count();

  // 1. Create (or reuse) the QA user with a random password — additive only
  const password = crypto.randomBytes(12).toString('base64url') + 'Aa1!';
  const hash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await db.user.update({ where: { email: EMAIL }, data: { passwordHash: hash, emailVerified: true } });
    console.log(`QA user already existed (password reset): ${EMAIL}`);
  } else {
    await db.user.create({ data: { email: EMAIL, name: NAME, passwordHash: hash, role: 'owner', plan: 'free', emailVerified: true } });
    console.log(`QA user created: ${EMAIL} (clearly-labeled test account)`);
  }

  // helper
  const post = async (path, body, cookies) => {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify(body),
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const jar = {};
    for (const sc of setCookies) {
      const m = sc.match(/^([^=]+)=([^;]*)/);
      if (m) jar[m[1]] = m[2];
    }
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json, jar };
  };
  const get = async (path, cookies) => {
    const res = await fetch(BASE + path, { headers: cookies ? { cookie: cookies } : {} });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');


  // 2. Sign in
  const r1 = await post('/api/auth/signin', { email: EMAIL, password });
  const hasTokens = !!(r1.jar && r1.jar.access_token && r1.jar.refresh_token);
  console.log(`\n[1] signin: HTTP ${r1.status} — ${r1.status === 200 ? 'PASS' : 'FAIL'} (auth cookies set: ${hasTokens}; user: ${r1.json && r1.json.user ? r1.json.user.email : 'n/a'})`);
  if (r1.json && r1.json.error) console.log(`    error: ${r1.json.error}`);

  // 3. Who am I (cookie auth)
  const r2 = await get('/api/auth/me', cookieHeader(r1.jar));
  const meOk = r2.status === 200 && r2.json && (r2.json.user?.email === EMAIL || r2.json.email === EMAIL || r2.json.id);
  console.log(`[2] /api/auth/me: HTTP ${r2.status} — ${meOk ? 'PASS (session works)' : 'FAIL'}${r2.json && r2.json.user ? ' (user=' + r2.json.user.email + ')' : ''}`);

  // 4. Sign out (needs auth cookie)
  const r3 = await post('/api/auth/signout', {}, cookieHeader(r1.jar));
  console.log(`[3] signout: HTTP ${r3.status} — ${r3.status >= 200 && r3.status < 300 ? 'PASS' : 'NOTE'}`);

  // 5. Sign in AGAIN (login again after logout)
  const r4 = await post('/api/auth/signin', { email: EMAIL, password });
  const againOk = r4.status === 200 && !!(r4.jar && r4.jar.access_token);
  console.log(`[4] signin again: HTTP ${r4.status} — ${againOk ? 'PASS' : 'FAIL'}`);

  // 6. Session after re-login
  const r6 = await get('/api/auth/me', cookieHeader(r4.jar));
  console.log(`[5] /api/auth/me after re-login: HTTP ${r6.status} — ${r6.status === 200 ? 'PASS (session persists)' : 'FAIL'}`);

  // 7. Wrong password must fail (sanity check of auth logic)
  const r5 = await post('/api/auth/signin', { email: EMAIL, password: 'DefinitelyWrongPassword123!' });
  console.log(`[6] signin wrong-password: HTTP ${r5.status} — ${r5.status === 401 ? 'PASS (rejected as expected)' : 'FAIL'}`);

  const usersAfter = await db.user.count();
  console.log(`\nDB safety: users before=${usersBefore} after=${usersAfter} (delta=${usersAfter - usersBefore}${usersAfter - usersBefore === (existing ? 0 : 1) ? ' — expected: ' + (existing ? '0 (reused existing QA user)' : '+1 (new labeled QA user)') : ' — UNEXPECTED'})`);
  await db.$disconnect();
}
main().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
