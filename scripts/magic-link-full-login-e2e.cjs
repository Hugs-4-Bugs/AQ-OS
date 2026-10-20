#!/usr/bin/env node
/**
 * FULL MAGIC LINK LOGIN LOOP E2E against the LIVE server — completes the
 * magic-link flow exactly as a user clicking the emailed link would:
 *   1. Read the transient magic-link token the server stored for the
 *      registered account mailtoprabhat72@gmail.com (NEVER printed).
 *   2. GET  /api/auth/magic-link/verify?token=...&email=...  (the emailed URL)
 *      -> expect a redirect (302/307) to the app + auth cookies set.
 *   3. GET  /api/auth/me with those cookies -> expect 200 (session live).
 *   4. Sign out to leave the account clean.
 * Prints ONLY pass/fail outcomes + HTTP codes. No tokens, no secrets.
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
  // Request a FRESH magic link first (the earlier one may be near expiry)
  const req = await fetch(BASE + '/api/auth/magic-link/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': BASE },
    body: JSON.stringify({ email: EMAIL, rememberMe: false }),
  });
  check('magic-link request (fresh, real email sent)', req.status === 200, `HTTP ${req.status}`);

  const u = await db.user.findUnique({ where: { email: EMAIL }, select: { magicLinkToken: true, magicLinkTokenExpiry: true } });
  if (!u || !u.magicLinkToken) { console.log('FAIL — no magic link token stored'); process.exit(1); }
  if (u.magicLinkTokenExpiry <= new Date()) { console.log('FAIL — token expired'); process.exit(1); }

  // Click the emailed link (exactly as the browser would)
  const verifyUrl = `${BASE}/api/auth/magic-link/verify?token=${encodeURIComponent(u.magicLinkToken)}&email=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(verifyUrl, { redirect: 'manual', headers: { 'Origin': BASE } });
  const jar = {};
  for (const sc of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const m = sc.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2];
  }
  const hasAuthCookies = !!(jar.access_token || jar.refresh_token || jar.session_token);
  const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
  const loc = res.headers.get('location') || '';
  check('magic-link verify (clicking emailed link)', isRedirect && hasAuthCookies, `HTTP ${res.status}, redirect->${loc ? new URL(loc, BASE).pathname : 'n/a'}, auth cookies: ${hasAuthCookies}`);

  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  if (hasAuthCookies) {
    const me = await fetch(BASE + '/api/auth/me', { headers: { cookie: cookieHeader } });
    let meJson = null; try { meJson = await me.json(); } catch {}
    const meOk = me.status === 200 && (meJson?.user?.email === EMAIL || meJson?.email === EMAIL || meJson?.id);
    check('authenticated session (/api/auth/me)', meOk, `HTTP ${me.status}${meJson?.user?.email ? ' user=' + meJson.user.email : ''}`);

    const so = await fetch(BASE + '/api/auth/signout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': cookieHeader }, body: '{}',
    });
    check('signout (clean up test session)', so.status >= 200 && so.status < 300, `HTTP ${so.status}`);
  }

  const after = await db.user.findUnique({ where: { email: EMAIL }, select: { magicLinkToken: true } });
  check('magic-link token consumed after use', !after.magicLinkToken, after.magicLinkToken ? 'still present (note)' : 'cleared by server');

  await db.$disconnect();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
