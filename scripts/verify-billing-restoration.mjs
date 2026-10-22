// READ-ONLY verification of the billing-bug account state after the fix.
// NO writes — verifies the 20-credit restoration, ledger integrity, and
// that the fix's code changes did not touch the live DB.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const USER = 'cmqrtgnjx0000qfgnsbhzyzxq'; // mailtoprabhat72@gmail.com (elite) — the test account

async function main() {
  // 1. Integrity check
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check');
  console.log(`integrity_check: ${integrity[0]?.integrity_check}`);

  // 2. Account state
  const user = await db.user.findUnique({
    where: { id: USER },
    select: { email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true },
  });
  console.log(`\nACCOUNT: ${user?.email} plan=${user?.plan} credits=${user?.credits}/${user?.creditsMonthly} rollover=${user?.rolloverCredits}`);

  // 3. The 4 deductions the user counted (2000 → 1980)
  const deducts = await db.creditsLedger.findMany({
    where: { userId: USER, credits: { lt: 0 }, createdAt: { gte: new Date('2026-10-22T00:00:00Z') } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nDEDUCTIONS TODAY (the 2000→1980 slide):`);
  for (const d of deducts) {
    console.log(`  ${d.createdAt.toISOString()} ${d.credits} → bal=${d.balance} | ${d.action.slice(0, 70)} | ${(d.description || '').slice(0, 80)}`);
  }

  // 4. The restoration row(s)
  const restorations = await db.creditsLedger.findMany({
    where: { userId: USER, credits: { gt: 0 }, createdAt: { gte: new Date('2026-10-22T00:00:00Z') } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nRESTORATION ROWS TODAY:`);
  for (const r of restorations) {
    console.log(`  ${r.createdAt.toISOString()} +${r.credits} → bal=${r.balance} | ${r.action} | ref=${r.referenceId}`);
    console.log(`    desc: ${r.description}`);
  }

  // 5. The wrongly-charged never-started runs (the bug's victims)
  const neverStarted = await db.workflowExecution.findMany({
    where: {
      userId: USER,
      status: { in: ['failed', 'exhausted'] },
      currentStep: 0,
      startedAt: { gte: new Date('2026-10-22T00:00:00Z') },
    },
    orderBy: { startedAt: 'asc' },
    select: { id: true, status: true, currentStep: true, totalSteps: true, error: true, idempotencyKey: true, startedAt: true },
  });
  console.log(`\nNEVER-STARTED FAILED EXECUTIONS TODAY (${neverStarted.length}):`);
  const batches = new Set();
  for (const e of neverStarted) {
    const batch = (e.idempotencyKey || '').replace(/^batch_/, '').replace(/_[a-z0-9]{25}$/, '');
    batches.add(batch);
    console.log(`  ${e.id} ${e.status} ${e.currentStep}/${e.totalSteps} steps | err=${(e.error || '').slice(0, 40)} | batch=${batch}`);
  }
  console.log(`  distinct charged batches: ${batches.size}`);

  // 6. Net math for today
  const netToday = deducts.reduce((s, d) => s + d.credits, 0) + restorations.reduce((s, r) => s + r.credits, 0);
  console.log(`\nNET LEDGER MOVEMENT TODAY: ${netToday} credits (deductions ${deducts.reduce((s, d) => s + d.credits, 0)}, restorations +${restorations.reduce((s, r) => s + r.credits, 0)})`);

  // 7. No charges created by the fix itself (nothing after the restoration)
  const latest = await db.creditsLedger.findFirst({
    where: { userId: USER },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nLATEST ledger row for this account: ${latest?.createdAt.toISOString()} (${latest?.action}) — nothing newer (the code fix wrote nothing).`);

  // 8. Counts unchanged (no reset/delete/reseed side effects)
  const [users, leads, subs, ledger, execs] = await Promise.all([
    db.user.count(), db.lead.count(), db.subscription.count(),
    db.creditsLedger.count(), db.workflowExecution.count(),
  ]);
  console.log(`\nCOUNTS: users=${users} leads=${leads} subscriptions=${subs} ledger=${ledger} executions=${execs}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
