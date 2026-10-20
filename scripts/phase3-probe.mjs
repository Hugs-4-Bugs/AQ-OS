// Phase 3 probe — read-only DB inspection to pick a QA test user and
// inventory existing workflows/executions. NO writes, NO prints of secrets.
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const email = process.argv[2] || 'qa@test.com';

const user = await db.user.findFirst({
  where: { email },
  select: {
    id: true, email: true, role: true, isActive: true, deletedAt: true,
    subscriptions: { select: { plan: true, status: true }, orderBy: { createdAt: 'desc' }, take: 3 },
    _count: { select: { workflowDefinitions: true } },
  },
});

console.log(JSON.stringify({ user }, null, 2));

if (user) {
  const wfs = await db.workflowDefinition.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, status: true, triggerType: true, runCount: true, successCount: true, failureCount: true, disabledBySubscription: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  console.log('WORKFLOWS:', JSON.stringify(wfs, null, 2));

  const execs = await db.workflowExecution.findMany({
    where: { workflow: { userId: user.id } },
    select: { id: true, workflowId: true, status: true, currentStep: true, totalSteps: true, error: true, startedAt: true, completedAt: true, deadLettered: true, isDeadLetter: true },
    orderBy: { startedAt: 'desc' },
    take: 15,
  });
  console.log('EXECUTIONS:', JSON.stringify(execs, null, 2));
}

await db.$disconnect();
