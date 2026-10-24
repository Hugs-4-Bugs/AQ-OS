// One-off cleanup of E2E Phase 21 artifacts (safe: matches only rows the
// E2E creates — name/e-mail prefixes are unique to the E2E). Never
// touches unrelated user/application data.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  const aps = await db.autopilotWorkflow.findMany({
    where: { OR: [{ name: { startsWith: 'E2E P21' } }, { name: { startsWith: 'Never (' } }] },
    select: { id: true, name: true },
  });
  for (const ap of aps) {
    await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotWorkflow.deleteMany({ where: { id: ap.id } });
    console.log('removed autopilot:', ap.name);
  }
  const wfs = await db.workflowDefinition.findMany({
    where: { name: { startsWith: 'E2E P21' } }, select: { id: true, name: true },
  });
  for (const wf of wfs) {
    const execs = await db.workflowExecution.findMany({ where: { workflowId: wf.id }, select: { id: true } });
    for (const e of execs) {
      await db.workflowExecutionLead.deleteMany({ where: { executionId: e.id } });
      await db.workflowLog.deleteMany({ where: { executionId: e.id } });
      await db.workflowExecution.deleteMany({ where: { id: e.id } });
    }
    await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
    await db.workflowDefinition.deleteMany({ where: { id: wf.id } });
    console.log('removed workflow:', wf.name);
  }
  const bps = await db.businessProfile.findMany({
    where: { name: { startsWith: 'E2E P21' } }, select: { id: true },
  });
  for (const bp of bps) {
    await db.businessProfile.deleteMany({ where: { id: bp.id } });
    console.log('removed profile:', bp.id);
  }
  const users = await db.user.findMany({
    where: { email: { startsWith: 'e2e-p21-' } }, select: { id: true, email: true },
  });
  for (const u of users) {
    const ownAps = await db.autopilotWorkflow.findMany({ where: { userId: u.id }, select: { id: true } });
    for (const ap of ownAps) {
      await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
      await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
      await db.autopilotWorkflow.deleteMany({ where: { id: ap.id } });
    }
    const ownWfs = await db.workflowDefinition.findMany({ where: { userId: u.id }, select: { id: true } });
    for (const wf of ownWfs) {
      await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
      await db.workflowDefinition.deleteMany({ where: { id: wf.id } });
    }
    await db.creditsLedger.deleteMany({ where: { userId: u.id } });
    await db.user.deleteMany({ where: { id: u.id } });
    console.log('removed user:', u.email);
  }
  console.log('E2E P21 artifact cleanup done.');
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
