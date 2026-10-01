// LIVE E2E — OTP verification matrix against the REAL dev server (port 3000).
// Uses the existing test-fixture account qa@test.com. OTP values are read
// transiently from a DB snapshot and are NEVER printed. No secrets logged.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const EMAIL = 'qa@test.com';
const EXPIRED_EMAIL = 'pentest.a.1788955379@test.local'; // OTP expired 2026-09-09
const SNAP = '/home/z/my-project/.test-tmp/e2e-live-snapshot.db';

function dbSnap() {
  fs.copyFileSync('/home/z/my-project/db/custom.db', SNAP);
  return new DatabaseSync(SNAP, { readOnly: true });
}
function currentOtp(email) {
  const db = dbSnap();
  const r = db.prepare('SELECT loginOtp, loginOtpExpiry FROM User WHERE email = ?').get(email);
  db.close();
  return r || null;
}
function sessionInfo(email) {
  const db = dbSnap();
  const r = db.prepare(`
    SELECT s.id, s.rememberMe, s.isRevoked, s.expiresAt, s.lastActivityAt, s.absoluteExpiresAt, s.createdAt, u.lastLoginAt
    FROM UserSession s JOIN User u ON u.id = s.userId
    WHERE u.email = ? ORDER BY s.createdAt DESC LIMIT 1`).get(email);
  db.close();
  return r;
}
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const cookies = [];
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const [pair, ...attrs] = c.split(';').map(s => s.trim());
    cookies.push({ name: pair.split('=')[0], maxAge: (attrs.find(a => /^Max-Age=/i.test(a)) || '').replace(/^Max-Age=/i, '') || '(session)' });
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, cookies };
}
const iso = ms => (ms ? new Date(Number(ms)).toISOString() : null);

(async () => {
  console.log('=== E2E OTP matrix — real server', BASE, '===');

  // 0. Server alive
  const health = await fetch(BASE + '/api/health');
  console.log('\n[0] /api/health ->', health.status);

  // 1. Request OTP (may 200 or 503 EMAIL_DELIVERY_FAILED — code is stored either way)
  const req = await post('/api/auth/otp/request', { email: EMAIL });
  console.log('[1] request OTP ->', req.status, JSON.stringify(req.json).slice(0, 140));

  const otpRow = currentOtp(EMAIL);
  if (!otpRow || !otpRow.loginOtp) { console.error('FATAL: no OTP stored — abort'); process.exit(1); }
  console.log('[1b] OTP stored in DB: yes | expiry:', iso(otpRow.loginOtpExpiry), '(code hidden)');

  // 2. INVALID OTP -> must fail safely, no session
  const wrong = await post('/api/auth/otp/verify', { email: EMAIL, otp: '000000' === otpRow.loginOtp ? '111111' : '000000', rememberMe: true });
  console.log('[2] invalid OTP ->', wrong.status, JSON.stringify(wrong.json));
  console.log('[2b] cookies set:', JSON.stringify(wrong.cookies), '(expect none)');

  // 3. MALFORMED OTP -> 400
  const malformed = await post('/api/auth/otp/verify', { email: EMAIL, otp: 'abc12', rememberMe: true });
  console.log('[3] malformed OTP ->', malformed.status, JSON.stringify(malformed.json));

  // 4. VALID OTP + rememberMe -> must succeed and create session
  const fresh = currentOtp(EMAIL); // re-read (in case step 2/3 changed anything)
  const ok = await post('/api/auth/otp/verify', { email: EMAIL, otp: fresh.loginOtp, rememberMe: true });
  console.log('[4] valid OTP ->', ok.status, JSON.stringify(ok.json).slice(0, 200));
  console.log('[4b] cookies:', JSON.stringify(ok.cookies), '(expect access_token 900s + refresh_token 30d when remembered)');
  if (ok.status !== 200) { console.error('FATAL: valid OTP failed — fix incomplete'); process.exit(1); }

  // 5. DB proof: session created, rememberMe=1, OTP cleared, lastLoginAt updated
  const s = sessionInfo(EMAIL);
  console.log('[5] newest session for', EMAIL, '->', JSON.stringify({
    id: s.id.slice(0, 12), rememberMe: !!s.rememberMe, isRevoked: !!s.isRevoked,
    expiresAt: iso(s.expiresAt), lastActivityAt: iso(s.lastActivityAt),
    absoluteExpiresAt: iso(s.absoluteExpiresAt), createdAt: iso(s.createdAt), lastLoginAt: iso(s.lastLoginAt),
  }));
  const cleared = currentOtp(EMAIL);
  console.log('[5b] OTP cleared after use:', !cleared.loginOtp, '(one-time-use)');

  // 6. REUSE the used code -> must fail
  const reuse = await post('/api/auth/otp/verify', { email: EMAIL, otp: fresh.loginOtp, rememberMe: true });
  console.log('[6] reuse used OTP ->', reuse.status, JSON.stringify(reuse.json));
  console.log('[6b] cookies set:', JSON.stringify(reuse.cookies), '(expect none)');

  // 7. EXPIRED OTP (fixture account, code from Sep 9) -> must fail as expired
  const expOtp = currentOtp(EXPIRED_EMAIL);
  if (expOtp && expOtp.loginOtp) {
    const exp = await post('/api/auth/otp/verify', { email: EXPIRED_EMAIL, otp: expOtp.loginOtp, rememberMe: false });
    console.log('[7] expired OTP ->', exp.status, JSON.stringify(exp.json));
  } else {
    console.log('[7] expired-OTP fixture not present — skipped');
  }

  // 8. RESEND behavior: request again -> old code replaced by new one (latest wins)
  const req2 = await post('/api/auth/otp/request', { email: EMAIL });
  const otp2 = currentOtp(EMAIL);
  console.log('[8] resend ->', req2.status, '| new OTP stored:', !!otp2.loginOtp, '| expiry advanced:', otp2.loginOtpExpiry > fresh.loginOtpExpiry);
  const ok2 = await post('/api/auth/otp/verify', { email: EMAIL, otp: otp2.loginOtp, rememberMe: false });
  console.log('[8b] verify resent OTP (rememberMe=false) ->', ok2.status);
  console.log('[8c] cookies:', JSON.stringify(ok2.cookies), '(expect refresh_token (session) — non-persistent)');
  const s2 = sessionInfo(EMAIL);
  console.log('[8d] newest session rememberMe:', !!s2.rememberMe, '(expect false)');

  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
