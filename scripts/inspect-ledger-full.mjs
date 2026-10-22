// Read-only: full ledger history for the test account
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const USER = 'cmqrtgnjx0000qfgnsbhzyzxq';

async function main() {
  const user = await db.user.findUnique({
    where: { id: USER },
    select: { id: true, email: true, plan: true, credits: true, creditsMonthly: true, rolloverCredits: true },
  });
  console.log('USER:', JSON.stringify(user, null, 2));

  const rows = await db.creditsLedger.findMany({
    where: { userId: USER },
    select: { id: true, action: true, credits: true, balance: true, description: true, referenceId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nALL LEDGER ROWS for ${USER} (${rows.length}):`);
  for (const r of rows) {
    console.log(`${r.createdAt.toISOString()} | ${String(r.credits).padStart(4)} | bal=${String(r.balance).padStart(5)} | ${r.action.slice(0, 80)} | ref=${r.referenceId} | ${(r.description || '').slice(0, 100)}`);
  }

  // All executions of the Dental workflow with their batch keys
  const execs = await db.workflowExecution.findMany({
    where: { workflowId: 'cmvixoso60009r92hox628irg' },
    select: { id: true, status: true, currentStep: true, totalSteps: true, error: true, startedAt: true, idempotencyKey: true },
    orderBy: { startedAt: 'asc' },
  });
  console.log(`\nALL DENTAL WORKFLOW EXECUTIONS (${execs.length}):`);
  for (const e of execs) {
    console.log(`${e.startedAt.toISOString()} | ${e.status.padEnd(9)} | step=${e.currentStep}/${e.totalSteps} | idem=${e.idempotencyKey} | err=${(e.error || '').slice(0, 60)}`);
  }

  // Failed-at-step-0 executions for this user ONLY
  const failed0 = await db.workflowExecution.count({
    where: { userId: USER, status: { in: ['failed', 'exhausted'] }, currentStep: 0 },
  });
  console.log(`\nFailed-at-step-0 executions for THIS user: ${failed0}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
