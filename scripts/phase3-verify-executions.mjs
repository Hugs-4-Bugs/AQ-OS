// Phase 3 — verify the 20 autopilot executions actually completed.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const execs = await db.workflowExecution.findMany({
  where: { workflowId: 'cmvfqc6o5000nm2v3lrf14g4z' },
  orderBy: { startedAt: 'asc' },
  select: { id: true, status: true, currentStep: true, totalSteps: true, error: true, startedAt: true, completedAt: true, idempotencyKey: true, deadLettered: true },
});
console.log(`EXECUTIONS for QA Phase3 Autopilot Workflow: ${execs.length}`);
const byStatus = {};
for (const e of execs) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
console.log('STATUS SUMMARY:', JSON.stringify(byStatus));
for (const e of execs.slice(0, 5)) {
  console.log(JSON.stringify({ id: e.id, status: e.status, step: `${e.currentStep}/${e.totalSteps}`, err: e.error, idem: e.idempotencyKey }));
}

// stuck anywhere?
const stuck = await db.workflowExecution.findMany({ where: { status: { in: ['queued', 'running', 'pending'] } } });
console.log('\nSTUCK (queued/running/pending) anywhere:', JSON.stringify(stuck.map(s => ({ id: s.id, wf: s.workflowId, status: s.status, started: s.startedAt }))));

// step logs sample for first execution
if (execs.length > 0) {
  const logs = await db.workflowLog.findMany({ where: { executionId: execs[0].id }, orderBy: { createdAt: 'asc' }, select: { stepName: true, stepType: true, status: true, error: true, output: true } });
  console.log('\nSTEP LOGS (first execution):');
  for (const l of logs) console.log(JSON.stringify({ step: l.stepName, type: l.stepType, status: l.status, err: l.error, out: l.output ? String(l.output).slice(0, 120) : null }));
}

// autopilot lead ledger
const ledger = await db.autopilotLead.findMany({ where: { autopilotId: 'cmvfqc6vl000qm2v3883t90kp' }, select: { status: true, leadId: true } });
const ledgerBy = {};
for (const l of ledger) ledgerBy[l.status] = (ledgerBy[l.status] || 0) + 1;
console.log('\nLEDGER STATUS SUMMARY:', JSON.stringify(ledgerBy), `total=${ledger.length}`);

// discovery job final state
const job = await db.discoveryJob.findUnique({ where: { id: 'cmvfqc8eh000tm2v3oz1aj6sb' }, select: { status: true, totalFound: true, imported: true, duplicates: true, errorMessage: true } });
console.log('\nDISCOVERY JOB:', JSON.stringify(job));

await db.$disconnect();
