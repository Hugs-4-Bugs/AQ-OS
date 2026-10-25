#!/usr/bin/env node
/**
 * Phase 26 — OTP login E2E verification.
 * Reads the live OTP from the DB (NEVER prints it), exercises:
 *   1. wrong-code → 401 (validation + brute-force protection intact)
 *   2. right-code → session cookie → /api/auth/me authenticated
 * Prints ONLY status codes and redacted facts.
 */
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const EMAIL = 'mailtoprabhat72@gmail.com';

function readOtp() {
  const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });
  const row = db.prepare('SELECT loginOtp, loginOtpExpiry, otpLockedUntil FROM User WHERE email = ?').get(EMAIL);
  db.close();
  return row;
}

async function main() {
  const row = readOtp();
  console.log('server-side OTP state: loginOtp=' + (row && row.loginOtp ? 'SET' : 'MISSING') +
    ', expiry=' + (row && row.loginOtpExpiry ? new Date(row.loginOtpExpiry).toISOString() : 'none') +
    ', locked=' + (row && row.otpLockedUntil ? 'yes' : 'no'));
  if (!row || !row.loginOtp) {
    console.log('E2E BLOCKED: no OTP stored server-side');
    process.exit(1);
  }

  // ── Step 1: WRONG code must be rejected ──
  let res = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, otp: '000000' }),
  });
  console.log('wrong-code verify → HTTP', res.status, res.status === 401 ? '(rejected correctly)' : '(UNEXPECTED)');
  const wrongBody = await res.json().catch(() => ({}));
  console.log('  body:', JSON.stringify(wrongBody).slice(0, 120));

  // ── Step 2: RIGHT code → session ──
  // (Re-request first if the wrong attempt consumed the code — check state)
  let otp = row.loginOtp;
  let fresh = readOtp();
  if (!fresh.loginOtp) {
    console.log('OTP consumed by wrong attempt — requesting a fresh one');
    await fetch(`${BASE}/api/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL }),
    });
    await new Promise((r) => setTimeout(r, 1500));
    fresh = readOtp();
    otp = fresh.loginOtp;
  }
  if (!otp) { console.log('E2E BLOCKED: OTP unavailable'); process.exit(1); }

  res = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, otp: String(otp), rememberMe: false }),
  });
  console.log('right-code verify → HTTP', res.status, res.status === 200 ? '(ACCEPTED)' : '(FAILED)');
  const setCookie = res.headers.get('set-cookie') || '';
  const sessionCookie = setCookie.split(';').find((c) => /session|token|auth/i.test(c));
  console.log('  session cookie issued:', Boolean(sessionCookie), '(' + (sessionCookie ? sessionCookie.split('=')[0] + '=REDACTED' : 'none') + ')');
  const body = await res.json().catch(() => ({}));
  const safeBody = JSON.parse(JSON.stringify(body, (k, v) => /token|cookie|secret|password/i.test(k) ? 'REDACTED' : v));
  console.log('  body (redacted):', JSON.stringify(safeBody).slice(0, 200));

  // ── Step 3: authenticated call ──
  const cookie = setCookie.split(';')[0];
  if (cookie) {
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } });
    const meBody = await me.json().catch(() => ({}));
    const user = meBody && (meBody.user || meBody);
    console.log('/api/auth/me → HTTP', me.status,
      user && user.email ? '(authenticated as ' + user.email + ')' : '(no user)');
  } else {
    console.log('/api/auth/me skipped — no session cookie');
  }
}

main().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });
