// Phase 3 — read-only: inspect workflow templates' send_email configs.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const templates = await db.workflowTemplate.findMany({
  select: { id: true, name: true, category: true, nodes: true },
  take: 30,
});
for (const t of templates) {
  const nodes = JSON.parse(t.nodes || '[]');
  const emailNodes = nodes.filter(n => (n.config?.actionType === 'send_email') || n.type === 'send_email');
  if (emailNodes.length > 0) {
    console.log(`TEMPLATE "${t.name}" [${t.category}]:`);
    for (const n of emailNodes) {
      console.log('  send_email config:', JSON.stringify(n.config));
    }
  }
}
await db.$disconnect();
