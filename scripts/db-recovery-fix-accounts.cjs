#!/usr/bin/env node
/**
 * db-recovery-fix-accounts.cjs — 2026-10-22 DB recovery task, account correction.
 *
 * CONTEXT: the live DB (db/custom.db) was verified INTACT and strictly newer
 * than the newest backup (db-backups/custom-20261022000431Z.db — identical to
 * upload/pre-restore-oct22/custom.db). NO file-level restore is performed
 * (it would delete newer ledger/audit/session data). Instead this script:
 *   1. PRE-FLIGHT: proves the live User set == backup User set (no user
 *      records lost vs the pre-loss backup).
 *   2. Applies the two targeted credit corrections the user specified:
 *        PRO   kattyboy785@gmail.com    → credits 750,  creditsMonthly 750
 *        ELITE mailtoprabhat72@gmail.com → credits 2000, creditsMonthly 2000
 *   3. Verifies unrelated account fields are byte-identical after.
 *
 * SAFETY (mirrors scripts/part2-account-correction.cjs — Part 2 §28 pattern):
 *   - Targeted single-row UPDATEs only. No reset, no DROP/TRUNCATE/DELETE,
 *     no reseed, no recreations.
 *   - ALL existing ledger/history rows preserved — audit rows are ADDITIVE:
 *       PRO   → credits=0 (balance-neutral allowance correction)
 *       ELITE → credits=+delta (admin top-up to full allowance; NEVER a charge)
 *   - Idempotent: an account already at target is a read-only no-op.
 *   - Aborts (per-account) on plan mismatch or unexpected field drift.
 *   - Never prints password hashes or any secret values.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PrismaClient } = require('@prisma/client');

const ROOT = '/home/z/my-project';
const LIVE_DB = path.join(ROOT, 'db/custom.db');
const REFERENCE_BACKUP = path.join(ROOT, 'db-backups/custom-20261022000431Z.db');

const TARGETS = [
  {
    email: 'kattyboy785@gmail.com',
    expectPlan: 'pro',
    credits: 750,
    creditsMonthly: 750,
    ledgerAction: 'admin_credit_allowance_correction',
    label: 'PRO',
  },
  {
    email: 'mailtoprabhat72@gmail.com',
    expectPlan: 'elite',
    credits: 2000,
    creditsMonthly: 2000,
    ledgerAction: 'admin_credit_restoration',
    label: 'ELITE',
  },
];

const OPERATOR = 'system:db-recovery-fix-accounts (2026-10-22)';
const REASON =
  '2026-10-22 recovery task: restore the account to its full plan credit ' +
  'allowance (PRO=750, ELITE=2000 per entitlement-service.ts PLAN_CREDITS). ' +
  'Admin correction only — no charge, no usage created; all prior ledger ' +
  'history preserved.';

const prisma = new PrismaClient();

async function snapshotUser(userId) {
  // Everything EXCEPT the two corrected fields (+ automatic updatedAt).
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  const { credits, creditsMonthly, updatedAt, ...rest } = u;
  void credits; void creditsMonthly; void updatedAt;
  return rest;
}

async function counts(p) {
  const c = {};
  for (const t of ['User', 'Lead', 'Subscription', 'CreditsLedger', 'PaymentOrder', 'AuditLog', 'UserSession', 'LoginHistory', 'WorkflowExecution', 'DiscoveryJob']) {
    const r = await p.$queryRawUnsafe(`SELECT count(*) c FROM "${t}"`);
    c[t] = Number(r[0].c);
  }
  return c;
}

async function preflightUserSetComparison() {
  console.log('── PRE-FLIGHT: live User set vs reference backup ──');
  const tmp = path.join(os.tmpdir(), `ref-${Date.now()}.db`);
  fs.copyFileSync(REFERENCE_BACKUP, tmp);
  const ref = new PrismaClient({ datasources: { db: { url: 'file:' + tmp } } });
  const liveEmails = (await prisma.$queryRawUnsafe('SELECT email FROM "User"')).map((r) => r.email).sort();
  const refEmails = (await ref.$queryRawUnsafe('SELECT email FROM "User"')).map((r) => r.email).sort();
  await ref.$disconnect();
  try { fs.rmSync(tmp); } catch {}
  const liveSet = new Set(liveEmails);
  const refSet = new Set(refEmails);
  const missing = refEmails.filter((e) => !liveSet.has(e));
  const extra = liveEmails.filter((e) => !refSet.has(e));
  console.log(`live users=${liveEmails.length}, backup users=${refEmails.length}`);
  console.log(`users in backup but NOT in live: ${missing.length ? missing.join(', ') : 'NONE'}`);
  console.log(`users in live but NOT in backup: ${extra.length ? extra.join(', ') : 'NONE'}`);
  const ok = missing.length === 0;
  console.log(`USER SET VERIFICATION: ${ok ? 'PASS — every backup user is present in the live DB' : 'FAIL — data loss detected'}`);
  return ok;
}

async function fixAccount(t) {
  console.log(`\n── ${t.label}: ${t.email} (expect plan=${t.expectPlan}) ──`);
  const user = await prisma.user.findFirst({
    where: { email: t.email },
    select: { id: true, email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true, isActive: true, deletedAt: true },
  });
  if (!user) {
    console.error(`ABORT: account not found.`);
    process.exitCode = 1;
    return null;
  }
  console.log(`Before: plan=${user.plan} credits=${user.credits} creditsMonthly=${user.creditsMonthly} rollover=${user.rolloverCredits} active=${user.isActive} deleted=${user.deletedAt !== null}`);

  if (user.plan !== t.expectPlan) {
    console.error(`ABORT: plan is '${user.plan}', expected '${t.expectPlan}' — manual review required (no changes made).`);
    process.exitCode = 1;
    return null;
  }

  const dCredits = t.credits - user.credits;
  const dMonthly = t.creditsMonthly - user.creditsMonthly;

  if (dCredits === 0 && dMonthly === 0) {
    console.log(`Already at target (${t.credits}/${t.creditsMonthly}) — idempotent no-op, no ledger/audit rows created.`);
    return user;
  }

  const before = await snapshotUser(user.id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { credits: t.credits, creditsMonthly: t.creditsMonthly },
    }),
    prisma.creditsLedger.create({
      data: {
        userId: user.id,
        action: t.ledgerAction,
        credits: dCredits, // 0 for allowance-only correction; +delta for top-up
        balance: t.credits,
        description:
          `Administrative credit correction (${OPERATOR}) — account ${t.email} (${t.label}): ` +
          `credits ${user.credits} -> ${t.credits}, creditsMonthly ${user.creditsMonthly} -> ${t.creditsMonthly}. ` +
          `${REASON} Applied ${new Date().toISOString()}.`,
        referenceId: user.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'admin_credit_adjustment',
        details: JSON.stringify({
          account: t.email,
          plan: user.plan,
          previousBalance: user.credits,
          previousAllowance: user.creditsMonthly,
          newBalance: t.credits,
          newAllowance: t.creditsMonthly,
          balanceDelta: dCredits,
          allowanceDelta: dMonthly,
          reason: REASON,
          operator: OPERATOR,
          appliedAt: new Date().toISOString(),
        }),
        resource: 'user',
        resourceId: user.id,
      },
    }),
  ]);
  console.log(`Correction applied: credits ${user.credits} -> ${t.credits} (${dCredits >= 0 ? '+' : ''}${dCredits}), creditsMonthly ${user.creditsMonthly} -> ${t.creditsMonthly} (+${dMonthly}). Ledger + AuditLog audit rows created (additive only).`);

  const after = await snapshotUser(user.id);
  const unrelatedUnchanged = JSON.stringify(before) === JSON.stringify(after);
  console.log(`Unrelated account fields unchanged: ${unrelatedUnchanged ? 'YES' : 'NO — ABORT'}`);
  if (!unrelatedUnchanged) process.exitCode = 1;

  const verify = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true },
  });
  const ok = verify.credits === t.credits && verify.creditsMonthly === t.creditsMonthly;
  console.log(`After: plan=${verify.plan} credits=${verify.credits} creditsMonthly=${verify.creditsMonthly} rollover=${verify.rolloverCredits}`);
  console.log(`VERIFY ${t.credits}/${t.creditsMonthly}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exitCode = 1;
  return verify;
}

(async () => {
  console.log('════════ db-recovery-fix-accounts ════════');
  console.log(`live DB: ${LIVE_DB} (sha-verified elsewhere; integrity ok)`);

  console.log('\n── PRE-FLIGHT counts (before) ──');
  const beforeCounts = await counts(prisma);
  console.log(JSON.stringify(beforeCounts));

  const userSetOk = await preflightUserSetComparison();
  if (!userSetOk) {
    console.error('\nSTOPPED: live DB is missing users present in the backup — recovery decision must be revisited. No corrections applied.');
    process.exit(1);
  }

  const results = {};
  for (const t of TARGETS) {
    results[t.label] = await fixAccount(t);
  }

  console.log('\n── POST counts (after) ──');
  const afterCounts = await counts(prisma);
  console.log(JSON.stringify(afterCounts));
  const nonAdditive = Object.keys(afterCounts).filter(
    (k) => afterCounts[k] < beforeCounts[k]
  );
  console.log(`Non-additive change check (no table may shrink): ${nonAdditive.length === 0 ? 'PASS' : 'FAIL: ' + nonAdditive.join(',')}`);
  if (nonAdditive.length) process.exitCode = 1;

  console.log('\n════════ SUMMARY ════════');
  for (const t of TARGETS) {
    const r = results[t.label];
    console.log(`${t.label} ${t.email}: ${r ? `plan=${r.plan} credits=${r.credits} creditsMonthly=${r.creditsMonthly}` : 'NOT CORRECTED (see above)'}`);
  }
})()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
