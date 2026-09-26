#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Support Center E2E — synthetic test-user provisioning
//
// Creates THREE synthetic test users via the PUBLIC signup API (the
// repo's established e2e convention — cf. pentest-*/starter-e2e-*
// accounts from earlier sessions), verifies them through the app's own
// verify-email flow, then applies TEST-ONLY role/plan overrides:
//
//   A  support-e2e-a-20260923@test.local      plan=starter  (downgrade CTA)
//   B  support-e2e-b-20260923@test.local      plan=free     (security tests)
//   S  support-e2e-admin-20260923@test.local  role=super_admin (admin console)
//
// NOTHING here touches pre-existing users/rows. Idempotent: re-uses
// existing accounts of the same emails when re-run. Prints a JSON
// summary (ids + a short-lived access token per user for browser use).
// ═══════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';

const USERS = [
  { key: 'A', email: 'support-e2e-a-20260923@test.local', name: 'Support E2E A', plan: 'starter', role: 'owner' },
  { key: 'B', email: 'support-e2e-b-20260923@test.local', name: 'Support E2E B', plan: 'free', role: 'owner' },
  { key: 'S', email: 'support-e2e-admin-20260923@test.local', name: 'Support E2E Admin', plan: 'free', role: 'super_admin' },
];

async function signupOrReuse(email, name, password) {
  // Already exists?
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;

  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password, country: 'India' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`signup failed for ${email}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.user ?? data;
}

async function verifyEmail(email) {
  const user = await db.user.findUnique({ where: { email } });
  if (user.emailVerified) return user;
  const otp = user.emailVerificationOtp;
  if (!otp) throw new Error(`no OTP stored for ${email}`);
  const res = await fetch(`${BASE}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`verify-email failed for ${email}: ${res.status} ${t.slice(0, 200)}`);
  }
  return db.user.findUnique({ where: { email } });
}

async function main() {
  const env = readFileSync('/home/z/my-project/.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
  const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
  const password = 'SupportE2E!2026x';

  const out = {};
  for (const spec of USERS) {
    let user = await signupOrReuse(spec.email, spec.name, password);
    user = await verifyEmail(spec.email);

    // TEST-ONLY overrides, applied strictly to these synthetic accounts.
    await db.user.update({
      where: { id: user.id },
      data: { plan: spec.plan, role: spec.role },
    });

    const token = jwt.sign(
      {
        sub: user.id,
        email: spec.email,
        role: spec.role,
        plan: spec.plan,
        orgId: null,
        isTrial: false,
        trialEndsAt: null,
        type: 'access',
      },
      secret,
      { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' },
    );

    out[spec.key] = { id: user.id, email: spec.email, plan: spec.plan, role: spec.role, token };
    console.error(`[e2e-provision] ${spec.key}: ${spec.email} id=${user.id} plan=${spec.plan} role=${spec.role}`);
  }

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error('[e2e-provision] FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
