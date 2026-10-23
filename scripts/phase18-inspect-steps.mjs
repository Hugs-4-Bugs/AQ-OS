// READ-ONLY: fetch step shapes of the proven autopilot E2E workflow.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
for (const id of ['cmvfqc6o5000nm2v3lrf14g4z', 'cmvfqv7hh002dm2qkxbrby6em']) {
  const wf = await db.workflowDefinition.findUnique({ where: { id }, select: { name: true, workflowSteps: { orderBy: { order: 'asc' }, select: { order: true, type: true, name: true, config: true } } } });
  if (!wf) continue;
  console.log(`\n=== ${wf.name}`);
  for (const s of wf.workflowSteps) {
    console.log(`  step ${s.order}: type=${s.type} name=${s.name}`);
    console.log(`    config=${String(s.config).slice(0, 300)}`);
  }
}
await db.$disconnect();
