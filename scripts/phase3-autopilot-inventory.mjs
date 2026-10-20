// Phase 3 — read-only autopilot inventory.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const aps = await db.autopilotWorkflow.findMany({
  select: {
    id: true, userId: true, name: true, status: true, schedule: true,
    niches: true, geography: true, workflowId: true,
    lastRunAt: true, nextRunAt: true, createdAt: true, updatedAt: true,
    lastError: true, runCount: true, totalDiscovered: true, totalSaved: true, totalProcessed: true, totalExecutions: true,
  },
});
console.log('AUTOPILOT WORKFLOWS:');
console.log(JSON.stringify(aps, null, 2));

const runs = await db.autopilotRun.findMany({
  orderBy: { createdAt: 'desc' },
  take: 10,
});
console.log('\nAUTOPILOT RUNS:');
console.log(JSON.stringify(runs, null, 2).slice(0, 4000));

await db.$disconnect();
