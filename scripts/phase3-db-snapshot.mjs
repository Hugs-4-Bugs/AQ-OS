// Phase 3 — DB safety snapshot (read-only). Usage: node phase3-db-snapshot.mjs <label>
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const label = process.argv[2] || 'snapshot';

const [users, subs, leads, workflows, execs, steps, logs, autopilots, apRuns, apLeads, notifications, creditsEntries, outreach, drafts] = await Promise.all([
  db.user.count(),
  db.subscription.count(),
  db.lead.count(),
  db.workflowDefinition.count(),
  db.workflowExecution.count(),
  db.workflowStep.count(),
  db.workflowLog.count(),
  db.autopilotWorkflow.count(),
  db.autopilotRun.count(),
  db.autopilotLead.count(),
  db.notification.count(),
  db.creditsLedger.count(),
  db.outreachMessage.count(),
  db.outreachMessage.count({ where: { status: 'draft' } }),
]);

// Credit balances per user (unchanged users must stay unchanged)
const creditRows = await db.user.findMany({
  select: { id: true, email: true, credits: true },
  orderBy: { credits: 'desc' },
  take: 12,
});

// Existing (pre-Phase3) workflows inventory — ids must be preserved
const wfRows = await db.workflowDefinition.findMany({
  select: { id: true, name: true, userId: true, status: true, runCount: true },
  orderBy: { createdAt: 'asc' },
});

console.log(JSON.stringify({
  label, time: new Date().toISOString(),
  counts: { users, subs, leads, workflows, execs, steps, logs, autopilots, apRuns, apLeads, notifications, creditsEntries, outreach, drafts },
  creditBalances: creditRows,
  workflowInventory: wfRows,
}, null, 2));

await db.$disconnect();
