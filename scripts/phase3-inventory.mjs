// Phase 3 — read-only inventory of ALL workflow executions + errors + credits.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const execs = await db.workflowExecution.findMany({
  orderBy: { startedAt: 'desc' },
  take: 30,
  select: {
    id: true, workflowId: true, status: true, currentStep: true, totalSteps: true,
    error: true, startedAt: true, completedAt: true, retryCount: true,
    deadLettered: true, isDeadLetter: true, deadLetterReason: true, userId: true,
  },
});
console.log('RECENT EXECUTIONS (all users):');
console.log(JSON.stringify(execs, null, 2));

const wfs = await db.workflowDefinition.findMany({
  select: {
    id: true, name: true, status: true, triggerType: true, userId: true,
    runCount: true, successCount: true, failureCount: true, disabledBySubscription: true,
    nodes: true, edges: true,
    _count: { select: { workflowSteps: true, executions: true } },
  },
});
console.log('\nALL WORKFLOW DEFINITIONS:');
for (const w of wfs) {
  const nodes = (() => { try { return JSON.parse(w.nodes || '[]'); } catch { return 'PARSE_ERROR'; } })();
  console.log(JSON.stringify({
    id: w.id, name: w.name, status: w.status, triggerType: w.triggerType, userId: w.userId,
    runCount: w.runCount, successCount: w.successCount, failureCount: w.failureCount,
    disabledBySubscription: w.disabledBySubscription,
    nodeCount: Array.isArray(nodes) ? nodes.length : nodes,
    nodeTypes: Array.isArray(nodes) ? nodes.map(n => `${n.type}:${n.id || 'noid'}`) : nodes,
    stepCount: w._count.workflowSteps, execCount: w._count.executions,
  }, null, 2));
}

// Credit balances for test users
const users = await db.user.findMany({
  where: { id: { in: [...new Set(wfs.map(w => w.userId)), 'cmtuc4av20000npbje6elo5ic'] } },
  select: { id: true, email: true, credits: true },
});
console.log('\nUSER CREDITS:', JSON.stringify(users, null, 2));

await db.$disconnect();
