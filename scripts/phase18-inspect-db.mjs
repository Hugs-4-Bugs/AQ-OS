// READ-ONLY Phase 18 investigation: current Autopilot domain state in the live DB.
// No writes. Usage: bun scripts/phase18-inspect-db.mjs
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const autopilots = await db.autopilotWorkflow.findMany({
    select: { id: true, name: true, status: true, workflowId: true, schedule: true, runCount: true, totalExecutions: true, lastError: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('=== AutopilotWorkflows (top 10) ===');
  for (const a of autopilots) {
    console.log(`- ${a.id} | ${a.name} | status=${a.status} | runs=${a.runCount} | totalExec=${a.totalExecutions} | err=${a.lastError ? String(a.lastError).slice(0, 80) : 'none'}`);
  }
  console.log(`total autopilots: ${await db.autopilotWorkflow.count()}`);

  const runs = await db.autopilotRun.findMany({
    select: { id: true, autopilotId: true, status: true, trigger: true, executionsCreated: true, error: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\n=== AutopilotRuns (latest 10) ===');
  for (const r of runs) {
    console.log(`- run=${r.id} | ap=${r.autopilotId.slice(-6)} | status=${r.status} | trigger=${r.trigger} | exec=${r.executionsCreated} | at=${r.createdAt.toISOString()} | err=${r.error ? String(r.error).slice(0, 100) : 'none'}`);
  }
  console.log(`total runs: ${await db.autopilotRun.count()}`);

  const ledger = await db.autopilotLead.groupBy({ by: ['status'], _count: true });
  console.log('\n=== AutopilotLead ledger by status ===');
  for (const g of ledger) console.log(`- ${g.status}: ${g._count}`);

  // Run->execution linkage: does any run's ledger carry executionId?
  const linked = await db.autopilotLead.count({ where: { executionId: { not: null } } });
  console.log(`\nledger rows with executionId set: ${linked}`);

  // BusinessProfile / PersonalContext / Offer presence (Phases 11-15 domain)
  const profiles = await db.businessProfile.count();
  console.log(`\nBusinessProfile rows: ${profiles}`);

  // Workflow executions with autopilot-style idempotency keys (multi-lead runs)
  const autoExecs = await db.workflowExecution.findMany({
    where: { idempotencyKey: { startsWith: 'autopilot:' } },
    select: { id: true, idempotencyKey: true, status: true, totalSteps: true, currentStep: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });
  console.log('\n=== WorkflowExecutions with autopilot idempotency keys (latest 10) ===');
  for (const e of autoExecs) {
    console.log(`- exec=${e.id} | key=${e.idempotencyKey} | status=${e.status} | steps=${e.currentStep}/${e.totalSteps} | at=${e.startedAt.toISOString()}`);
  }
  console.log(`total autopilot executions: ${await db.workflowExecution.count({ where: { idempotencyKey: { startsWith: 'autopilot:' } } })}`);

  // Sample a multi-lead execution to see lead items
  if (autoExecs.length > 0) {
    const items = await db.workflowExecutionLead.findMany({
      where: { executionId: autoExecs[0].id },
      select: { status: true, leadName: true },
      take: 5,
    });
    console.log(`\n=== Lead items of latest autopilot execution (${items.length} sample) ===`);
    for (const it of items) console.log(`- ${it.status} | ${it.leadName}`);
  }
}

main().catch((e) => { console.error('INSPECT FAILED:', e.message); process.exit(1); }).finally(() => db.$disconnect());
