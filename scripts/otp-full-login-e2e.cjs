#!/usr/bin/env node
/**
 * FULL OTP LOGIN LOOP E2E against the LIVE server — proves the complete
 * OTP authentication flow end-to-end with the new runtime credentials:
 *   1. Read the transient 6-digit OTP the server just stored for the
 *      registered test account (mailtoprabhat72@gmail.com — the user's own
 *      account; value is NEVER printed).
 *   2. POST /api/auth/otp/verify {email, otp}  -> expect 200 + auth cookies.
 *   3. GET  /api/auth/me with those cookies     -> expect 200 (session live).
 *   4. Sign out to leave the account clean.
 * Prints ONLY pass/fail outcomes and HTTP codes. No OTP, no tokens, no secrets.
 */
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');
const db = new PrismaClient();
const BASE = 'http://localhost:3000';
const EMAIL = 'mailtoprabhat72@gmail.com';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

(async () => {
  const u = await db.user.findUnique({ where: { email: EMAIL }, select: { loginOtp: true, loginOtpExpiry: true } });
  if (!u || !u.loginOtp) { console.log('FAIL — no fresh OTP stored for the account'); process.exit(1); }
  if (u.loginOtpExpiry <= new Date()) { console.log('FAIL — stored OTP already expired'); process.exit(1); }

  const res = await fetch(BASE + '/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE },
    body: JSON.stringify({ email: EMAIL, otp: u.loginOtp, rememberMe: false }),
  });
  const jar = {};
  for (const sc of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const m = sc.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2];
  }
  const hasAuthCookies = !!(jar.access_token || jar.refresh_token || jar.session_token);
  check('OTP verify (login with emailed code)', res.status === 200, `HTTP ${res.status}, auth cookies set: ${hasAuthCookies}`);
  let body = null; try { body = await res.json(); } catch {}
  if (body && body.error) console.log('   error field:', body.error);

  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const me = await fetch(BASE + '/api/auth/me', { headers: { cookie: cookieHeader } });
  let meJson = null; try { meJson = await me.json(); } catch {}
  const meOk = me.status === 200 && (meJson?.user?.email === EMAIL || meJson?.email === EMAIL || meJson?.id);
  check('authenticated session (/api/auth/me)', meOk, `HTTP ${me.status}${meJson?.user?.email ? ' user=' + meJson.user.email : ''}`);

  if (hasAuthCookies) {
    const so = await fetch(BASE + '/api/auth/signout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': cookieHeader },
      body: '{}',
    });
    check('signout (clean up test session)', so.status >= 200 && so.status < 300, `HTTP ${so.status}`);
  }

  // clear the consumed transient OTP fields on the user record (route does this on success;
  // verify it did — read-only check)
  const after = await db.user.findUnique({ where: { email: EMAIL }, select: { loginOtp: true, loginOtpExpiry: true } });
  check('OTP consumed/invalidated after use', !after.loginOtp || after.loginOtpExpiry <= new Date(), after.loginOtp ? 'still present (note)' : 'cleared by server');

  await db.$disconnect();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
