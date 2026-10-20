// Phase 3 — forensics on the stuck Oct 19 autopilot run (read-only).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// 1. Discovery jobs created around the stuck run window (Oct 19 00:48+)
const jobs = await db.discoveryJob.findMany({
  where: { createdAt: { gte: new Date('2026-10-18T00:00:00Z') } },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
console.log('DISCOVERY JOBS since Oct 18:');
for (const j of jobs) {
  console.log(JSON.stringify({
    id: j.id, userId: j.userId, status: j.status, niche: j.niche, city: j.city,
    totalFound: j.totalFound, imported: j.imported, duplicates: j.duplicates, failed: j.failed,
    createdAt: j.createdAt, updatedAt: j.updatedAt, errorMessage: j.errorMessage ? String(j.errorMessage).slice(0, 100) : null,
  }));
}

// 2. The 4 executions created during the stuck run + their triggerData
const execs = await db.workflowExecution.findMany({
  where: { startedAt: { gte: new Date('2026-10-19T00:45:00Z'), lt: new Date('2026-10-19T01:00:00Z') } },
  orderBy: { startedAt: 'asc' },
});
console.log('\nEXECUTIONS in stuck-run window:');
for (const e of execs) {
  console.log(JSON.stringify({
    id: e.id, status: e.status, startedAt: e.startedAt, completedAt: e.completedAt,
    idem: e.idempotencyKey, trigger: e.triggerData ? String(e.triggerData).slice(0, 200) : null,
    currentStep: e.currentStep, totalSteps: e.totalSteps,
  }));
}

// 3. AutopilotLead ledger rows for the stuck run
const leads = await db.autopilotLead.findMany({
  where: { runId: 'cmvejdmv60000p1avuk5ipwl3' },
  orderBy: { createdAt: 'asc' },
});
console.log('\nAUTOPILOT LEADS in stuck run:');
for (const l of leads) {
  console.log(JSON.stringify({ leadId: l.leadId, status: l.status, executionId: l.executionId, error: l.error, createdAt: l.createdAt }));
}

// 4. Any workflow executions still in queued/running state right now
const stuck = await db.workflowExecution.findMany({
  where: { status: { in: ['queued', 'running', 'pending'] } },
});
console.log('\nCURRENTLY STUCK EXECUTIONS (queued/running):', JSON.stringify(stuck.map(s => ({ id: s.id, wf: s.workflowId, status: s.status, started: s.startedAt })), null, 2));

await db.$disconnect();
