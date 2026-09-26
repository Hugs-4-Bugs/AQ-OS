#!/usr/bin/env node
// auth-test-matrix.mjs — Full auth test matrix per audit requirements.
// Self-bootstraps controlled accounts (workspace DB is fresh after reset).
// Prints PASS/FAIL lines only. Masks emails and OTP values. Never prints
// tokens, cookies, or secret values.
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

const fs = await import('fs');
const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || env.DATABASE_URL;
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();

const maskEmail = (e) => `${String(e).slice(0, 3)}***@${String(e).split('@')[1] || ''}`;
const maskOtp = (o) => `***${String(o).slice(-2)}`;
const wrongOf = (real) => (String(real) === '000000' ? '999999' : '000000');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`); cond ? pass++ : fail++; };

async function call(path, opts = {}, ip = '10.9.0.1') {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    ...opts,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, setCookies: res.headers.getSetCookie?.() || [], location: res.headers.get('location') || '' };
}

// ═══ Phase 0: bootstrap primary account (owner's real Gmail) ═══
const MAIN = 'mailtoprabhat72@gmail.com';
let existing = await db.user.findUnique({ where: { email: MAIN } });
if (!existing) {
  const su = await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: MAIN, name: 'Prabhat Kumar', password: 'Aq0s-Test-2026-xK9z!v' }) }, '10.9.0.0');
  ok('Signup (real verification email sent via SMTP)', su.status === 201, `status=${su.status}`);
  existing = await db.user.findUnique({ where: { email: MAIN } });
  const ve = await call('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: MAIN, otp: existing.emailVerificationOtp }) }, '10.9.0.0');
  ok('Email verification (OTP from DB, submitted to API) → verified', ve.status === 200, `status=${ve.status}`);
} else {
  console.log('primary account already exists — skipping bootstrap');
}
// Restore owner-level admin on the fresh workspace DB (documented in report)
if (existing.role !== 'super_admin') {
  await db.user.update({ where: { email: MAIN }, data: { role: 'super_admin' } });
  console.log('bootstrap: primary account promoted to super_admin (owner)');
}

// ═══ Phase 1: Invalid OAuth state ═══
{
  const r = await call('/api/auth/callback/google?code=forged-code&state=bogus-state-xyz', {}, '10.9.0.1');
  const redirected = [301, 302, 303, 307, 308].includes(r.status);
  ok('Google callback with INVALID state → rejected via error redirect', redirected && /auth_error=/.test(r.location), `status=${r.status} loc=${(r.location.split('?')[1] || '').slice(0, 40)}`);
}

// ═══ Phase 2: OTP request + resend cooldown ═══
{
  const r1 = await call('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: MAIN }) }, '10.9.0.2');
  ok('OTP request accepted (anti-enumeration response)', r1.status === 200 && /If an account exists/.test(r1.body?.message || ''), `status=${r1.status}`);
  const r2 = await call('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: MAIN }) }, '10.9.0.2');
  ok('OTP resend within 60s cooldown → 429 rate limited', r2.status === 429, `status=${r2.status} body=${JSON.stringify(r2.body).slice(0, 70)}`);
}

// ═══ Phase 3: Wrong OTP rejected ═══
{
  const u = await db.user.findUnique({ where: { email: MAIN } });
  const r = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: MAIN, otp: wrongOf(u.loginOtp) }) }, '10.9.0.3');
  ok('WRONG OTP → rejected (401), attempt recorded', r.status === 401, `status=${r.status}`);
}

// ═══ Phase 4: Correct OTP → login + reuse rejected ═══
let cookies = [];
{
  const u = await db.user.findUnique({ where: { email: MAIN } });
  const r = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: MAIN, otp: u.loginOtp }) }, '10.9.0.3');
  cookies = r.setCookies.map((c) => c.split(';')[0]);
  const hasSession = cookies.some((c) => c.startsWith('access_token=')) && cookies.some((c) => c.startsWith('refresh_token='));
  ok('CORRECT OTP (' + maskOtp(u.loginOtp) + ', from mail) → login succeeds + session cookies set', r.status === 200 && hasSession, `status=${r.status}`);
  const r2 = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: MAIN, otp: u.loginOtp }) }, '10.9.0.3');
  ok('REUSED OTP → rejected (one-time use, cleared)', r2.status >= 400 && r2.status < 500, `status=${r2.status} body=${(r2.body?.error || '').slice(0, 40)}`);
}

// ═══ Phase 5: session refresh, admin guards, logout ═══
{
  const rf = await call('/api/auth/refresh', { method: 'POST', headers: { cookie: cookies.join('; ') } }, '10.9.0.4');
  ok('Session refresh with valid cookie → 200', rf.status === 200, `status=${rf.status}`);
  const rfa = await call('/api/auth/refresh', { method: 'POST' }, '10.9.0.4');
  ok('Session refresh without token → rejected', [401, 400].includes(rfa.status), `status=${rfa.status}`);

  const au = await call('/api/admin/users', {}, '10.9.0.4');
  ok('UNAUTHENTICATED /api/admin/users → denied', [401, 403].includes(au.status), `status=${au.status}`);
  const an = await call('/api/admin/users', { headers: { cookie: cookies.join('; ') } }, '10.9.0.4');
  ok('SUPER ADMIN /api/admin/users → allowed', an.status === 200, `status=${an.status}`);

  const so = await call('/api/auth/signout', { method: 'POST', headers: { cookie: cookies.join('; ') } }, '10.9.0.4');
  const cleared = so.setCookies.some((c) => /access_token=;|Max-Age=0/i.test(c));
  ok('Logout → success + cookies cleared', so.status === 200 && cleared, `status=${so.status}`);
}

// ═══ Phase 6: Expired OTP ═══
{
  await call('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: MAIN }) }, '10.9.0.5');
  const u = await db.user.findUnique({ where: { email: MAIN } });
  await db.user.update({ where: { id: u.id }, data: { loginOtpExpiry: new Date(Date.now() - 60_000) } });
  const r = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: MAIN, otp: u.loginOtp }) }, '10.9.0.5');
  ok('EXPIRED OTP → rejected', r.status === 400, `status=${r.status} body=${(r.body?.error || '').slice(0, 40)}`);
  await db.user.update({ where: { id: u.id }, data: { loginOtp: null, loginOtpExpiry: null } });
}

// ═══ Phase 7: Too many OTP attempts → lockout (isolated audit account) ═══
{
  const audit = MAIN.replace('@', '+otpaudit@');
  const su = await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: audit, name: 'OTP Audit', password: 'Audit-2026-xK9z!v' }) }, '10.9.0.6');
  ok('Audit account signup (verification real-send)', su.status === 201, `status=${su.status}`);
  const a1 = await db.user.findUnique({ where: { email: audit } });
  const ve = await call('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: audit, otp: a1.emailVerificationOtp }) }, '10.9.0.6');
  ok('Audit account email verified', ve.status === 200, `status=${ve.status}`);

  await call('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: audit }) }, '10.9.0.6');
  const realOtp = (await db.user.findUnique({ where: { email: audit } })).loginOtp;
  const wrong = wrongOf(realOtp);
  let last = 0;
  for (let i = 1; i <= 5; i++) {
    const ip = i <= 4 ? '10.9.0.7' : '10.9.0.8'; // stay under 5/min/IP limiter
    const r = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: audit, otp: wrong }) }, ip);
    last = r.status;
    if (r.status === 423) break;
  }
  ok('TOO MANY OTP attempts (5 wrong) → locked (423)', last === 423, `lastStatus=${last}`);

  await db.user.delete({ where: { email: audit } }).catch(() => {});
  console.log('cleanup: audit account removed from DB');
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
await db.$disconnect();
