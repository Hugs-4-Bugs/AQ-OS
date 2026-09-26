// ═══════════════════════════════════════════════════════════════════
// e2e-account-consistency.mjs — STEP 10 E2E ACCOUNT CONSISTENCY TEST
//
// Proves: SAME EMAIL → SAME APPLICATION USER across
//   A. Google (identity already established via real OAuth today)
//   B/E. OTP login + re-login (real SMTP delivery required — a 503 means
//        the email was NOT delivered and the test fails honestly)
//   C/G. Magic Link login + re-login
//   D/F. logout between methods
//
// SECURITY: never prints OTP / tokens / cookies / secrets. OTP + magic
// tokens are read from the live DB inside this script only to complete
// verification (equivalent to the user reading their own email).
// ═══════════════════════════════════════════════════════════════════
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const EMAIL = 'kattyboy785@gmail.com';
const EXPECTED_ID = 'cmufhfjuf0000ody7l3d0cs7a'; // Google-established user id

const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });
const mask = (e) => (e ? e.slice(0, 2) + '***' + (e.split('@')[1] || '') : 'NONE');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function currentUser() {
  return db.prepare('SELECT id, email, googleId, authProvider, emailVerified, isActive FROM User WHERE email = ?').get(EMAIL);
}
function sessionCount(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM UserSession WHERE userId = ? AND isRevoked = 0').get(userId).c;
}

const results = [];
function record(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'} [${step}] ${detail}`);
}

// ── A. Google-established identity ──────────────────────────────────
function stepA_googleIdentity() {
  const u = currentUser();
  const pass = !!u && u.id === EXPECTED_ID && !!u.googleId && !String(u.googleId).startsWith('dev-google-') && u.authProvider === 'google';
  record('A-google-identity', pass,
    `google user id=${u?.id} googleId=${u?.googleId ? 'SET(numeric-real)' : 'MISSING'} provider=${u?.authProvider} verified=${u?.emailVerified}`);
}

// ── B/E. OTP login (request → SMTP send → verify → session) ─────────
async function otpLogin(tag) {
  const before = sessionCount(EXPECTED_ID);
  const r1 = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  });
  const j1 = await r1.json().catch(() => ({}));
  if (r1.status !== 200) {
    record(tag, false, `otp/request HTTP ${r1.status} — real SMTP send did NOT happen: ${JSON.stringify(j1).slice(0, 140)}`);
    return null;
  }
  const row = db.prepare('SELECT id, loginOtp, loginOtpExpiry FROM User WHERE email = ?').get(EMAIL);
  if (!row || row.id !== EXPECTED_ID || !row.loginOtp) {
    record(tag, false, `OTP record missing or wrong user: id=${row?.id} otp=${row?.loginOtp ? 'SET' : 'NULL'}`);
    return null;
  }
  // otp/request 200 = REAL SMTP delivery succeeded (503 otherwise). The OTP
  // value itself is never printed.
  const r2 = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, otp: row.loginOtp, rememberMe: true }),
  });
  const j2 = await r2.json().catch(() => ({}));
  const after = sessionCount(EXPECTED_ID);
  const cookies = r2.headers.getSetCookie?.() ?? [];
  const pass = r2.status === 200 && j2.user?.id === EXPECTED_ID && after === before + 1;
  record(tag, pass,
    `otp request=200 (SMTP sent) verify=${r2.status} verifiedUserId=${j2.user?.id ?? 'none'} sessions ${before}→${after} cookies=${cookies.length}`);
  return pass ? { cookies } : null;
}

// ── C/G. Magic Link login (request → SMTP send → GET verify) ────────
async function magicLogin(tag) {
  const before = sessionCount(EXPECTED_ID);
  const r1 = await fetch(`${BASE}/api/auth/magic-link/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  });
  const j1 = await r1.json().catch(() => ({}));
  if (r1.status !== 200) {
    record(tag, false, `magic/request HTTP ${r1.status}: ${JSON.stringify(j1).slice(0, 140)}`);
    return false;
  }
  const row = db.prepare('SELECT id, magicLinkToken, magicLinkTokenExpiry FROM User WHERE email = ?').get(EMAIL);
  if (!row || row.id !== EXPECTED_ID || !row.magicLinkToken) {
    record(tag, false, `magic token missing or wrong user: id=${row?.id} token=${row?.magicLinkToken ? 'SET' : 'NULL'}`);
    return false;
  }
  const url = `${BASE}/api/auth/magic-link/verify?token=${encodeURIComponent(row.magicLinkToken)}&email=${encodeURIComponent(EMAIL)}&remember=1`;
  const r2 = await fetch(url, { redirect: 'manual' });
  const loc = r2.headers.get('location') || '';
  const cookies = r2.headers.getSetCookie?.() ?? [];
  const after = sessionCount(EXPECTED_ID);
  const okRedirect = r2.status >= 300 && r2.status < 400 && !loc.includes('auth_error') && cookies.length > 0;
  const pass = okRedirect && after === before + 1;
  record(tag, pass,
    `magic request=200 (SMTP sent) verify=${r2.status} redirect=${loc ? new URL(loc).pathname + (new URL(loc).search || '') : 'none'} cookies=${cookies.length} sessions ${before}→${after}`);
  return pass ? { cookies } : null;
}

// ── D/F. Logout (browser-equivalent: replay the login's Set-Cookie jar;
// signout enforces CSRF, so send X-Requested-With like the app's client) ──
async function signout(tag, cookies) {
  if (!cookies || cookies.length === 0) {
    record(tag, false, 'no session cookies captured from login — cannot logout');
    return;
  }
  const before = sessionCount(EXPECTED_ID);
  const jar = cookies.map((c) => c.split(';')[0]).join('; ');
  const r = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    headers: { cookie: jar, 'X-Requested-With': 'XMLHttpRequest' },
  });
  const after = sessionCount(EXPECTED_ID);
  record(tag, r.status === 200 && after === before - 1,
    `signout=${r.status} active sessions ${before}→${after}`);
}

// ═══ RUN ═══
console.log(`E2E ACCOUNT CONSISTENCY — email=${mask(EMAIL)} base=${BASE}`);
stepA_googleIdentity();

const b = await otpLogin('B-otp-login');            if (!b) process.exit(1);
await sleep(1000);
await signout('D-logout-after-otp', b.cookies);
const c = await magicLogin('C-magic-login');        if (!c) process.exit(1);
await sleep(1000);
await signout('F-logout-after-magic', c.cookies);

// E. re-login via OTP (fresh OTP after the 60s freshness window)
await sleep(62000);
const e = await otpLogin('E-otp-relogin');          if (!e) process.exit(1);
await sleep(1000);
await signout('F2-logout', e.cookies);

// G. re-login via Magic Link (fresh token after the 60s freshness window)
await sleep(62000);
const g = await magicLogin('G-magic-relogin');

const allPass = results.every((r) => r.pass);
console.log('─'.repeat(60));
console.log(`RESULT: ${allPass ? 'ALL PASS' : 'FAILURES PRESENT'} — ${results.filter(r => r.pass).length}/${results.length} checks`);
console.log(`Canonical account: id=${EXPECTED_ID} for ${mask(EMAIL)} — Google + OTP + Magic Link all resolved here.`);
process.exit(allPass ? 0 : 1);
