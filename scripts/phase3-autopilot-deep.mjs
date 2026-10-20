// Phase 3 — deep dive on the failing Autopilot E2E workflow (read-only).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const wf = await db.workflowDefinition.findUnique({
  where: { id: 'cmv7kz1ll000onalmojwa3oth' },
});
console.log('WORKFLOW nodes JSON:');
console.log(wf?.nodes);
console.log('\nWORKFLOW edges JSON:');
console.log(wf?.edges);
console.log('\ntriggerConfig:', wf?.triggerConfig);

// Autopilot rows (any model names containing utopilot)
const models = Object.keys(db).filter(k => !k.startsWith('_') && !k.startsWith('$'));
console.log('\nPRISMA MODELS:', models.join(', '));

const execs = await db.workflowExecution.findMany({
  where: { workflowId: 'cmv7kz1ll000onalmojwa3oth' },
  orderBy: { startedAt: 'desc' },
  take: 12,
  select: { id: true, status: true, currentStep: true, totalSteps: true, error: true, startedAt: true, triggerEvent: true, deadLetterReason: true, retryCount: true },
});
console.log('\nRECENT EXECUTIONS (autopilot wf):');
for (const e of execs) {
  console.log(JSON.stringify({
    id: e.id, status: e.status, step: `${e.currentStep}/${e.totalSteps}`,
    err: e.error, dl: e.deadLetterReason, at: e.startedAt,
    trigger: e.triggerEvent ? String(e.triggerEvent).slice(0, 120) : null, retry: e.retryCount,
  }));
}

// The step logs of one failing execution
if (execs.length > 0) {
  const logs = await db.workflowLog.findMany({
    where: { executionId: execs[0].id },
    orderBy: { createdAt: 'asc' },
    select: { stepName: true, stepType: true, status: true, input: true, output: true, error: true },
  });
  console.log('\nSTEP LOGS of latest failing execution:');
  for (const l of logs) console.log(JSON.stringify(l, null, 2));
}

await db.$disconnect();
