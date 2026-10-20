// Phase 3 — inspect the UI-triggered failed execution (read-only).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const execs = await db.workflowExecution.findMany({
  where: { workflowId: 'cmvfqc6o5000nm2v3lrf14g4z' },
  orderBy: { startedAt: 'desc' },
  take: 3,
  select: { id: true, status: true, currentStep: true, totalSteps: true, error: true, startedAt: true, completedAt: true, triggerData: true, retryCount: true, deadLettered: true },
});
console.log('LATEST EXECUTIONS:');
for (const e of execs) console.log(JSON.stringify(e, null, 2));

const latest = execs[0];
if (latest) {
  const logs = await db.workflowLog.findMany({
    where: { executionId: latest.id },
    orderBy: { createdAt: 'asc' },
    select: { stepName: true, stepType: true, status: true, input: true, output: true, error: true },
  });
  console.log('\nSTEP LOGS:');
  for (const l of logs) console.log(JSON.stringify(l, null, 2));
}
await db.$disconnect();
