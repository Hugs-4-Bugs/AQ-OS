// Cleanup of leftover Phase 18 E2E artifacts from the two partial runs
// (crashed before full cleanup). Removes ONLY rows created by those runs:
// E2E-prefixed autopilots/workflows/profiles + e2e-p18-* QA users.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// 1. QA users (their cascades remove their ledger/leads/etc.)
const qaUsers = await db.user.findMany({ where: { email: { startsWith: 'e2e-p18-' } }, select: { id: true, email: true } });
for (const u of qaUsers) {
  // Remove their autopilot trees first (ledger/runs reference them).
  const aps = await db.autopilotWorkflow.findMany({ where: { userId: u.id }, select: { id: true } });
  for (const ap of aps) {
    await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotWorkflow.delete({ where: { id: ap.id } });
  }
  await db.user.delete({ where: { id: u.id } });
  console.log(`removed QA user ${u.email} (+${aps.length} autopilots)`);
}

// 2. E2E P18 autopilots still owned by User A
const aps = await db.autopilotWorkflow.findMany({ where: { name: { startsWith: 'E2E P18' } }, select: { id: true, name: true } });
for (const ap of aps) {
  await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
  await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
  await db.autopilotWorkflow.delete({ where: { id: ap.id } });
  console.log(`removed autopilot ${ap.name}`);
}

// 3. E2E P18 workflows + executions
const wfs = await db.workflowDefinition.findMany({ where: { name: { startsWith: 'E2E P18' } }, select: { id: true, name: true } });
for (const wf of wfs) {
  const execs = await db.workflowExecution.findMany({ where: { workflowId: wf.id }, select: { id: true } });
  for (const e of execs) {
    await db.workflowExecutionLead.deleteMany({ where: { executionId: e.id } });
    await db.workflowLog.deleteMany({ where: { executionId: e.id } });
  }
  await db.workflowExecution.deleteMany({ where: { workflowId: wf.id } });
  await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
  await db.workflowDefinition.delete({ where: { id: wf.id } });
  console.log(`removed workflow ${wf.name} (+${execs.length} executions)`);
}

// 4. E2E P18 profiles
const ps = await db.businessProfile.findMany({ where: { name: { startsWith: 'E2E P18' } }, select: { id: true, name: true } });
for (const p of ps) {
  await db.businessProfile.delete({ where: { id: p.id } });
  console.log(`removed profile ${p.name}`);
}

const counts = {
  autopilots: await db.autopilotWorkflow.count(),
  runs: await db.autopilotRun.count(),
  e2eWfs: await db.workflowDefinition.count({ where: { name: { startsWith: 'E2E P18' } } }),
  e2eUsers: await db.user.count({ where: { email: { startsWith: 'e2e-p18-' } } }),
};
console.log('after cleanup:', JSON.stringify(counts));
await db.$disconnect();
