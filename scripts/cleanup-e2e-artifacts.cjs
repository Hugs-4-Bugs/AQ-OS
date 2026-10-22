const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const wfIds = ['cmvjuvu3w000du4wwsrar4ffb', 'cmvjuy4zl002gu4ww485rj4l9', 'cmvjuzzqw003pu4ww6npf841q'];
  for (const wfId of wfIds) {
    const wf = await db.workflowDefinition.findUnique({ where: { id: wfId }, select: { id: true, name: true, status: true } });
    if (!wf) { console.log(wfId, 'gone'); continue; }
    if (!wf.name.startsWith('E2E Personalization')) { console.log(wfId, 'SKIPPED — not E2E:', wf.name); continue; }
    const execs = await db.workflowExecution.findMany({ where: { workflowId: wfId }, select: { id: true } });
    const execIds = execs.map((e) => e.id);
    if (execIds.length > 0) {
      await db.workflowExecutionLead.deleteMany({ where: { executionId: { in: execIds } } });
      await db.workflowLog.deleteMany({ where: { executionId: { in: execIds } } });
    }
    await db.workflowExecution.deleteMany({ where: { workflowId: wfId } });
    await db.workflowStep.deleteMany({ where: { workflowId: wfId } });
    await db.workflowDefinition.delete({ where: { id: wfId } });
    console.log(wfId, 'fully removed (E2E workflow:', wf.name + ', executions:', execIds.length + ')');
  }
  const counts = { workflows: await db.workflowDefinition.count(), exec: await db.workflowExecution.count(), items: await db.workflowExecutionLead.count() };
  console.log('after cleanup:', JSON.stringify(counts));
  await db.$disconnect();
})();
