// Phase 3 — verify the UI-triggered executions after fix (read-only).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// Latest execution of the autopilot workflow (the UI Run path)
const execs = await db.workflowExecution.findMany({
  where: { workflowId: 'cmvfqc6o5000nm2v3lrf14g4z' },
  orderBy: { startedAt: 'desc' },
  take: 3,
  select: { id: true, status: true, error: true, startedAt: true, completedAt: true, triggerData: true, currentStep: true, totalSteps: true },
});
console.log('LATEST EXECUTIONS (UI Run path):');
for (const e of execs) {
  console.log(JSON.stringify({
    id: e.id, status: e.status, err: e.error, step: `${e.currentStep}/${e.totalSteps}`,
    at: e.startedAt, lead: e.triggerData ? JSON.parse(e.triggerData).leadName : null,
  }));
}

// Latest notifications for this user (workflow-related)
const notifs = await db.notification.findMany({
  where: { userId: 'cmtuc4av20000npbje6elo5ic', type: { in: ['workflow_failed', 'workflow_completed', 'workflow'] } },
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { type: true, title: true, message: true, createdAt: true },
});
console.log('\nLATEST WORKFLOW NOTIFICATIONS:');
for (const n of notifs) console.log(JSON.stringify({ type: n.type, title: n.title, at: n.createdAt, msg: String(n.message).slice(0, 120) }));

await db.$disconnect();
