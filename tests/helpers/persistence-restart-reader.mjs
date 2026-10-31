// ═══════════════════════════════════════════════════════════════════
// Persistence/Restart Child-Process Reader
//
// This script runs in a SEPARATE Node process with a FRESH PrismaClient
// instance to prove that durable state persisted by the test's primary
// runtime can be read back by a completely new runtime connected to the
// SAME db/custom.db file.
//
// Usage:
//   node tests/helpers/persistence-restart-reader.mjs <json-ids-file>
//
// The JSON file contains the IDs to read. The script outputs a JSON
// object to stdout with the read records.
//
// This is NOT a mock — it creates a real PrismaClient, connects to the
// real database, and executes real queries. The only difference from
// the test's primary runtime is that it is a fresh Node process with
// no cached modules, no cached PrismaClient, and no in-memory state.
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '/home/z/my-project/node_modules/.prisma/client/default.js';
import { readFileSync } from 'fs';

const db = new PrismaClient();

async function main() {
  const idsFile = process.argv[2];
  if (!idsFile) {
    console.error('Usage: node persistence-restart-reader.mjs <json-ids-file>');
    process.exit(1);
  }
  const ids = JSON.parse(readFileSync(idsFile, 'utf-8'));

  const result = {
    processPid: process.pid,
    prismaClientVersion: 'fresh-instance',
    reads: {},
    errors: [],
  };

  try {
    // Read each record by ID from the FRESH PrismaClient
    if (ids.userId) {
      result.reads.user = await db.user.findUnique({
        where: { id: ids.userId },
        select: { id: true, email: true, plan: true, credits: true, isActive: true, country: true },
      });
    }
    if (ids.leadId) {
      result.reads.lead = await db.lead.findUnique({
        where: { id: ids.leadId },
        select: { id: true, userId: true, businessName: true, email: true, stage: true, isActive: true },
      });
    }
    if (ids.workflowId) {
      result.reads.workflow = await db.workflowDefinition.findUnique({
        where: { id: ids.workflowId },
        select: { id: true, userId: true, name: true, triggerType: true, status: true },
      });
    }
    if (ids.executionId) {
      result.reads.execution = await db.workflowExecution.findUnique({
        where: { id: ids.executionId },
        select: { id: true, workflowId: true, userId: true, status: true, retryCount: true, idempotencyKey: true, currentStep: true, totalSteps: true },
      });
    }
    if (ids.autopilotId) {
      result.reads.autopilot = await db.autopilotWorkflow.findUnique({
        where: { id: ids.autopilotId },
        select: { id: true, userId: true, name: true, status: true },
      });
    }
    if (ids.autopilotRunId) {
      result.reads.autopilotRun = await db.autopilotRun.findUnique({
        where: { id: ids.autopilotRunId },
        select: { id: true, autopilotId: true, userId: true, status: true, idempotencyKey: true, runKey: true },
      });
    }
    if (ids.outreachId) {
      result.reads.outreach = await db.outreachMessage.findUnique({
        where: { id: ids.outreachId },
        select: { id: true, leadId: true, userId: true, channel: true, subject: true, status: true },
      });
    }
    if (ids.subscriptionId) {
      result.reads.subscription = await db.subscription.findUnique({
        where: { id: ids.subscriptionId },
        select: { id: true, userId: true, plan: true, status: true, billingCycle: true },
      });
    }
    if (ids.activityId) {
      result.reads.activity = await db.leadActivity.findUnique({
        where: { id: ids.activityId },
        select: { id: true, leadId: true, userId: true, type: true, description: true },
      });
    }
    // Count ledger rows for the user
    if (ids.userId) {
      result.reads.ledgerCount = await db.creditsLedger.count({ where: { userId: ids.userId } });
      result.reads.userCredits = (await db.user.findUnique({ where: { id: ids.userId }, select: { credits: true } }))?.credits;
    }
    // Read specific ledger entry by idempotencyKey if provided
    if (ids.idempotencyKey && ids.userId) {
      result.reads.ledgerByIdempotencyKey = await db.creditsLedger.findFirst({
        where: { userId: ids.userId, idempotencyKey: ids.idempotencyKey },
        select: { id: true, action: true, credits: true, balance: true, idempotencyKey: true },
      });
    }
    // Tenant isolation check: try to read Tenant A's lead as if from a different context
    // (the child process just reads by ID — ownership is checked at the app layer, not DB layer)
    if (ids.tenantBLeadId) {
      result.reads.tenantBLead = await db.lead.findUnique({
        where: { id: ids.tenantBLeadId },
        select: { id: true, userId: true, businessName: true },
      });
    }

    // DB integrity check from the fresh process
    const integrity = await db.$queryRaw`PRAGMA integrity_check`;
    result.reads.integrityCheck = JSON.parse(JSON.stringify(integrity));

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main();
