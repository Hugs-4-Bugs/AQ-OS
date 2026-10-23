// READ-ONLY: compare live DB tables against Prisma schema expectations (Prisma raw query).
// Usage: bun scripts/phase18-table-audit.mjs
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
const live = tables.map((t) => t.name);
console.log(`live tables: ${live.length}`);

const need = [
  'WorkflowExecutionLead', 'AutopilotWorkflow', 'AutopilotRun', 'AutopilotLead',
  'BusinessProfile', 'DiscoveryJob', 'WorkflowExecution', 'WorkflowDefinition',
  'User', 'Lead', 'CreditLedger',
];
for (const t of need) console.log((live.includes(t) ? 'EXISTS  ' : 'MISSING ') + t);

try {
  const mig = await db.$queryRawUnsafe('SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 8');
  console.log('\n=== _prisma_migrations (latest 8) ===');
  for (const m of mig) console.log(`- ${m.migration_name} @ ${m.finished_at}`);
} catch (e) {
  console.log('no _prisma_migrations table:', e.message);
}

const runCols = await db.$queryRawUnsafe('PRAGMA table_info(AutopilotRun)');
console.log('\nAutopilotRun columns:', runCols.map((c) => c.name).join(', '));
const execCols = await db.$queryRawUnsafe('PRAGMA table_info(WorkflowExecution)');
console.log('\nWorkflowExecution columns:', execCols.map((c) => c.name).join(', '));
await db.$disconnect();
