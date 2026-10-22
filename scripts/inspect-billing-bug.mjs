// Read-only DB inspection for the billing bug — NO writes.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // 1. Users with credits near 1980 / plan elite-ish, to find the test account
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, plan: true, credits: true, createdAt: true },
    orderBy: { credits: 'desc' },
    take: 20,
  });
  console.log('=== TOP USERS BY CREDITS ===');
  for (const u of users) {
    console.log(`${u.id} | ${u.email} | plan=${u.plan} | credits=${u.credits} | created=${u.createdAt.toISOString()}`);
  }

  // 2. Recent failed executions with 0 completed steps
  const failed = await db.workflowExecution.findMany({
    where: { status: { in: ['failed', 'exhausted'] } },
    select: {
      id: true, workflowId: true, userId: true, status: true, currentStep: true,
      totalSteps: true, error: true, startedAt: true, completedAt: true,
      idempotencyKey: true, retryCount: true, deadLettered: true,
    },
    orderBy: { startedAt: 'desc' },
    take: 40,
  });
  console.log(`\n=== FAILED/EXHAUSTED EXECUTIONS (${failed.length}) ===`);
  for (const e of failed) {
    console.log(
      `${e.id} | wf=${e.workflowId} | user=${e.userId} | ${e.status} | step=${e.currentStep}/${e.totalSteps}` +
      ` | retries=${e.retryCount} | dlq=${e.deadLettered} | idem=${e.idempotencyKey}` +
      ` | started=${e.startedAt.toISOString()} | err=${(e.error || '').slice(0, 80)}`
    );
  }

  // 3. Workflow definitions involved
  const wfIds = [...new Set(failed.map((e) => e.workflowId))];
  if (wfIds.length) {
    const wfs = await db.workflowDefinition.findMany({
      where: { id: { in: wfIds } },
      select: { id: true, name: true, userId: true, status: true, triggerType: true },
    });
    console.log(`\n=== WORKFLOW DEFINITIONS (${wfs.length}) ===`);
    for (const w of wfs) console.log(`${w.id} | ${w.name} | user=${w.userId} | ${w.status} | trigger=${w.triggerType}`);
    // steps of the first workflow
    const steps = await db.workflowStep.findMany({
      where: { workflowId: wfIds[0] },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, type: true, name: true, config: true },
    });
    console.log(`\n=== STEPS of ${wfIds[0]} (${steps.length}) ===`);
    for (const s of steps) {
      const cfg = String(s.config || '');
      console.log(`${s.order}. ${s.type} "${s.name}" | config=${cfg.slice(0, 160)}`);
    }
  }

  // 4. Ledger rows for workflow_execution charges/refunds (recent)
  const ledger = await db.creditsLedger.findMany({
    where: {
      OR: [
        { action: { contains: 'workflow_execution' } },
      ],
    },
    select: { id: true, userId: true, action: true, credits: true, balance: true, description: true, referenceId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  console.log(`\n=== WORKFLOW_EXECUTION LEDGER ROWS (${ledger.length}) ===`);
  for (const l of ledger) {
    console.log(
      `${l.createdAt.toISOString()} | user=${l.userId} | ${l.credits} | bal=${l.balance}` +
      ` | ref=${l.referenceId} | action=${l.action.slice(0, 100)}` +
      ` | desc=${(l.description || '').slice(0, 90)}`
    );
  }

  // 5. Counts
  const [execTotal, execFailed0, userCount] = await Promise.all([
    db.workflowExecution.count(),
    db.workflowExecution.count({ where: { status: { in: ['failed', 'exhausted'] }, currentStep: 0 } }),
    db.user.count(),
  ]);
  console.log(`\n=== COUNTS === executions=${execTotal} failedAtStep0=${execFailed0} users=${userCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
