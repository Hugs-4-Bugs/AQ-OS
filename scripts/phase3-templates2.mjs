// Phase 3 — read-only: all template node shapes + AI-generate prompt structure.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const templates = await db.workflowTemplate.findMany({ select: { name: true, nodes: true }, take: 6 });
for (const t of templates) {
  const nodes = JSON.parse(t.nodes || '[]');
  console.log(`\nTEMPLATE "${t.name}":`);
  for (const n of nodes) {
    console.log(`  type=${n.type} title=${n.title || n.name} config=${JSON.stringify(n.config).slice(0, 160)}`);
  }
}
await db.$disconnect();
