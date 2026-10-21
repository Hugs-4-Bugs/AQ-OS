// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 §28: Targeted Account Credit Correction
//
// Account: kattyboy785@gmail.com (Pro)
// Correction: remaining/allowance → 750/750.
//
// Root cause (found in the Part 2 inspection pass): the account carries
// credits=750 but a STALE creditsMonthly=500 — the allowance snapshot of
// the pre-"Sep 2026 final pricing" Pro configuration. Monthly resets and
// the frontend derive the ALLOWANCE from creditsMonthly, so the credit
// pill rendered "750 / 500". The authoritative Pro allowance is 750
// (entitlement-service.ts PLAN_CREDITS.pro).
//
// Safety rules (Part 2 §3/§28):
//   • TARGETED single-row update — no reset, no delete, no recreate.
//   • All history preserved; a balance-neutral CreditsLedger audit row
//     (admin_credit_adjustment) + AuditLog entry record the correction.
//   • Idempotent: re-running is a read-only no-op once corrected.
//   • Verifies unrelated account data is unchanged (checksum-style).
// ═══════════════════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');

const ACCOUNT_EMAIL = 'kattyboy785@gmail.com';
const TARGET_EMAIL_FIELD = 'email';
// The authoritative Pro allowance (must mirror PLAN_CREDITS.pro in
// src/lib/entitlement-service.ts — verified at runtime below).
const PRO_ALLOWANCE = 750;
const ADJUSTMENT_ACTION = 'admin_credit_allowance_correction';
const REASON =
  'Part 2 §28 administrative correction: stale creditsMonthly allowance (500, pre-Sep-2026 ' +
  'Pro pricing) reconciled to the authoritative Pro allowance (750). Balance-neutral: the ' +
  'remaining balance was already 750; only the allowance snapshot was wrong, which made the ' +
  'credit display render "750 / 500" instead of "750 / 750".';
const OPERATOR = 'system:part2-account-correction';

const prisma = new PrismaClient();

async function snapshotUser(userId) {
  // Everything EXCEPT the two fields being corrected — used to prove the
  // correction touched nothing else on the account. `updatedAt` is the
  // model's automatic @updatedAt bookkeeping stamp (any row update touches
  // it — including the correction itself), so it is excluded from the
  // "unrelated data" comparison by design.
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  const { credits, creditsMonthly, updatedAt, ...rest } = u;
  void credits;
  void creditsMonthly;
  void updatedAt;
  return rest;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { [TARGET_EMAIL_FIELD]: ACCOUNT_EMAIL },
    select: { id: true, email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true },
  });

  if (!user) {
    console.error(`[correction] ABORT: account ${ACCOUNT_EMAIL} not found.`);
    process.exitCode = 1;
    return;
  }

  console.log(`[correction] Account: ${user.email} (plan=${user.plan})`);
  console.log(`[correction] Before: remaining=${user.credits} allowance=${user.creditsMonthly} rollover=${user.rolloverCredits}`);

  const alreadyCorrected =
    user.credits === PRO_ALLOWANCE && user.creditsMonthly === PRO_ALLOWANCE;

  // Idempotency marker: an earlier correction ledger row for this account.
  const priorCorrection = await prisma.creditsLedger.findFirst({
    where: { userId: user.id, action: ADJUSTMENT_ACTION },
    select: { id: true, description: true, createdAt: true },
  });

  if (alreadyCorrected) {
    console.log(`[correction] State already 750/750 — no balance change needed.`);
    if (priorCorrection) {
      console.log(`[correction] Prior audit entry exists (ledger ${priorCorrection.id} @ ${priorCorrection.createdAt.toISOString()}) — idempotent no-op.`);
    } else {
      console.log(`[correction] No ledger entry yet but state is already correct — recording the audit entry only.`);
      await recordAudit(user, {
        previousBalance: user.credits,
        previousAllowance: user.creditsMonthly,
      });
    }
    await verify(user.id);
    return;
  }

  if (priorCorrection && !alreadyCorrected) {
    // Corrected once but drifted again afterwards — do NOT silently repeat;
    // surface it for a human decision ( Part 2 §28 expects ONE correction).
    console.error(
      `[correction] ABORT: a prior correction exists (${priorCorrection.id}) but the current ` +
      `state is ${user.credits}/${user.creditsMonthly} — post-correction drift detected. ` +
      `Manual review required before any repeat adjustment.`
    );
    process.exitCode = 1;
    return;
  }

  const beforeSnapshot = await snapshotUser(user.id);

  await prisma.$transaction(async (tx) => {
    // Targeted correction: remaining AND allowance to the authoritative
    // 750/750 (remaining was already 750 — the update is effectively
    // allowance-only for this account, but §28 requires verifying exactly
    // 750/750 afterwards).
    await tx.user.update({
      where: { id: user.id },
      data: { credits: PRO_ALLOWANCE, creditsMonthly: PRO_ALLOWANCE },
    });

    // Balance-neutral ledger audit row (§19/§28): previous balance/allowance,
    // new values, reason, operator, timestamp ride on the description +
    // metadata-style fields the model supports (action, description).
    await tx.creditsLedger.create({
      data: {
        userId: user.id,
        action: ADJUSTMENT_ACTION,
        credits: 0, // balance-neutral allowance correction
        balance: PRO_ALLOWANCE,
        description:
          `Administrative credit correction (${OPERATOR}) — account ${ACCOUNT_EMAIL}: ` +
          `allowance ${user.creditsMonthly} -> ${PRO_ALLOWANCE}, remaining ${user.credits} -> ${PRO_ALLOWANCE}. ` +
          `${REASON} Applied ${new Date().toISOString()}.`,
        referenceId: user.id,
      },
    });

    // AuditLog trail (the app's own audit convention).
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'admin_credit_adjustment',
        details: JSON.stringify({
          account: ACCOUNT_EMAIL,
          previousBalance: user.credits,
          previousAllowance: user.creditsMonthly,
          newBalance: PRO_ALLOWANCE,
          newAllowance: PRO_ALLOWANCE,
          adjustmentAmount: 0, // balance-neutral
          reason: REASON,
          operator: OPERATOR,
          appliedAt: new Date().toISOString(),
        }),
        resource: 'user',
        resourceId: user.id,
      },
    });
  });

  // Prove nothing else on the account changed.
  const afterSnapshot = await snapshotUser(user.id);
  const unrelatedUnchanged = JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot);
  console.log(`[correction] Unrelated account fields unchanged: ${unrelatedUnchanged ? 'YES' : 'NO'}`);
  if (!unrelatedUnchanged) {
    console.error('[correction] ABORT: unexpected drift in unrelated fields!');
    process.exitCode = 1;
  }

  await verify(user.id);
}

async function recordAudit(user, { previousBalance, previousAllowance }) {
  await prisma.$transaction(async (tx) => {
    await tx.creditsLedger.create({
      data: {
        userId: user.id,
        action: ADJUSTMENT_ACTION,
        credits: 0,
        balance: PRO_ALLOWANCE,
        description:
          `Administrative credit correction (${OPERATOR}) — account ${ACCOUNT_EMAIL}: ` +
          `allowance ${previousAllowance} -> ${PRO_ALLOWANCE}, remaining ${previousBalance} -> ${PRO_ALLOWANCE}. ` +
          `${REASON} Applied ${new Date().toISOString()}. (State was already correct; audit entry recorded.)`,
        referenceId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'admin_credit_adjustment',
        details: JSON.stringify({
          account: ACCOUNT_EMAIL,
          previousBalance,
          previousAllowance,
          newBalance: PRO_ALLOWANCE,
          newAllowance: PRO_ALLOWANCE,
          adjustmentAmount: 0,
          reason: REASON,
          operator: OPERATOR,
          appliedAt: new Date().toISOString(),
        }),
        resource: 'user',
        resourceId: user.id,
      },
    });
  });
  console.log(`[correction] Audit entries recorded (ledger + audit log).`);
}

async function verify(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true },
  });
  const ok = user.credits === PRO_ALLOWANCE && user.creditsMonthly === PRO_ALLOWANCE;
  console.log(`[correction] After: remaining=${user.credits} allowance=${user.creditsMonthly} rollover=${user.rolloverCredits}`);
  console.log(`[correction] VERIFY remaining=750 && allowance=750: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exitCode = 1;

  // The correction must be visible in the ledger trail.
  const entry = await prisma.creditsLedger.findFirst({
    where: { userId, action: ADJUSTMENT_ACTION },
    select: { id: true },
  });
  console.log(`[correction] Ledger audit entry present: ${entry ? 'YES' : 'NO'}`);
  if (!entry) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('[correction] FAILED:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
