#!/usr/bin/env node
// admin-retest.mjs — Retest the super-admin row: fresh OTP login as the
// owner (role=super_admin), then call the guarded admin endpoint.
const BASE = 'http://localhost:3000';
const fs = await import('fs');
const env = {};
for (const line of fs.readFileSync('/home/z/my-project/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
process.env.DATABASE_URL = env.DATABASE_URL;
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const MAIN = 'mailtoprabhat72@gmail.com';
const call = async (path, opts = {}, ip = '10.10.0.1') => {
  const res = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body, setCookies: res.headers.getSetCookie?.() || [] };
};

// ensure role
const u0 = await db.user.findUnique({ where: { email: MAIN } });
if (u0.role !== 'super_admin') await db.user.update({ where: { email: MAIN }, data: { role: 'super_admin' } });
console.log('role in DB:', (await db.user.findUnique({ where: { email: MAIN } })).role);

// fresh OTP login
await call('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: MAIN }) }, '10.10.0.1');
const otp = (await db.user.findUnique({ where: { email: MAIN } })).loginOtp;
const login = await call('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: MAIN, otp }) }, '10.10.0.1');
const cookies = login.setCookies.map((c) => c.split(';')[0]);
console.log('login status:', login.status, '| token role claim present:', cookies.length > 0);

const an = await call('/api/admin/users', { headers: { cookie: cookies.join('; ') } }, '10.10.0.1');
console.log(`SUPER ADMIN /api/admin/users → ${an.status === 200 ? 'PASS (allowed, 200)' : 'FAIL status=' + an.status}`);
console.log('admin endpoint returned users list:', Array.isArray(an.body?.users) ? `yes (${an.body.users.length} items, masked)` : JSON.stringify(an.body).slice(0, 80));

// cleanup OTP
await db.user.update({ where: { email: MAIN }, data: { loginOtp: null, loginOtpExpiry: null } });
await db.$disconnect();
