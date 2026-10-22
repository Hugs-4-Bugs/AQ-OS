#!/usr/bin/env node
/** Read-only diagnostic: workflow definitions + recent executions + step logs (webhook fetch failed root cause). */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });

async function main() {
  console.log('=== RECENT EXECUTIONS (last 10) ===');
  const execs = await db.workflowExecution.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, workflowId: true, status: true, currentStep: true, totalSteps: true,
      triggerData: true, error: true, startedAt: true, completedAt: true, createdAt: true,
      retryCount: true, maxRetries: true,
      workflow: { select: { name: true, userId: true } },
    },
  });
  for (const e of execs) {
    console.log(`\nExecution ${e.id}`);
    console.log(`  workflow=${e.workflow?.name} (${e.workflowId}) userId=${e.workflow?.userId}`);
    console.log(`  status=${e.status} currentStep=${e.currentStep}/${e.totalSteps} retry=${e.retryCount}/${e.maxRetries}`);
    console.log(`  started=${e.startedAt} completed=${e.completedAt} createdAt=${e.createdAt}`);
    console.log(`  error=${e.error ? String(e.error).slice(0, 400) : 'null'}`);
    if (e.triggerData) console.log(`  triggerData=${String(e.triggerData).slice(0, 300)}`);
  }

  console.log('\n=== "Dental Clinic Outreach" DEFINITION (latest workflow) ===');
  const wf = await db.workflowDefinition.findUnique({
    where: { id: 'cmvixoso60009r92hox628irg' },
  });
  if (wf) {
    console.log('keys:', Object.keys(wf).join(', '));
    const defAny = wf;
    for (const k of ['definition', 'steps', 'nodes', 'graph', 'config', 'flow']) {
      if (defAny[k] !== undefined && defAny[k] !== null) {
        console.log(`\n--- field "${k}" ---`);
        console.log(typeof defAny[k] === 'string' ? defAny[k] : JSON.stringify(defAny[k], null, 2));
      }
    }
  }

  console.log('\n=== LAST EXECUTION LOGS (most recent execution) ===');
  if (execs.length > 0) {
    const logs = await db.workflowLog.findMany({
      where: { executionId: { in: execs.slice(0, 3).map((e) => e.id) } },
      orderBy: { createdAt: 'asc' },
    });
    for (const l of logs) {
      console.log(`\nLog ${l.id} exec=${l.executionId}`);
      console.log(`  step=${l.stepName} type=${l.stepType} status=${l.status} duration=${l.durationMs}ms retry=${l.retryAttempt}`);
      console.log(`  input=${l.input ? String(l.input).slice(0, 500) : 'null'}`);
      console.log(`  output=${l.output ? String(l.output).slice(0, 500) : 'null'}`);
      console.log(`  error=${l.error ? String(l.error).slice(0, 400) : 'null'}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
