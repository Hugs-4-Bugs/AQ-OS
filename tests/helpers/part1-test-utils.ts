// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 Test Helpers
//
// Creates isolated test users/automations/invocations on the LIVE
// Prisma client (matches existing test convention). Each test file
// uses a unique `runId` prefix so its rows are easy to clean up and
// never collide with production data.
//
// All helpers are NON-DESTRUCTIVE: they only insert rows tagged with
// the test run-id prefix. They never delete or modify production data.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface Part1TestContext {
  /** Unique prefix for this test run — used to namespace all created rows. */
  runPrefix: string;
  userIds: string[];
  automationIds: string[];
  invocationIds: string[];
}

/**
 * Bootstrap a fresh test context. Allocates one user row tagged with
 * the run-prefix so cleanup is trivial.
 */
export async function setupPart1Context(input: {
  userCount?: number;
  plan?: string;
}): Promise<Part1TestContext> {
  const runPrefix = `p1t-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const userIds: string[] = [];
  for (let i = 0; i < (input.userCount ?? 1); i++) {
    const u = await db.user.create({
      data: {
        email: `${runPrefix}-u${i}@test.part1`,
        name: `Part1 Test ${runPrefix} u${i}`,
        // Use passwordHash (the schema field) — never `password`.
        passwordHash: null,
        role: 'owner',
        plan: input.plan ?? 'autopilot',
        // tag for easy identification / cleanup
        createdAt: new Date(),
      },
    });
    userIds.push(u.id);
  }
  return {
    runPrefix,
    userIds,
    automationIds: [],
    invocationIds: [],
  };
}

/**
 * Clean up everything created in this test run. Best-effort — failures
 * are swallowed so they never block test reporting.
 */
export async function teardownPart1Context(ctx: Part1TestContext): Promise<void> {
  // Delete in reverse FK order — checkpoints → runs → automations → users.
  for (const invId of ctx.invocationIds) {
    try {
      await db.automationCheckpoint.deleteMany({ where: { invocationId: invId } });
    } catch {}
    try {
      await db.autopilotRun.deleteMany({ where: { id: invId } });
    } catch {}
  }
  for (const apId of ctx.automationIds) {
    try {
      // also delete child runs (paranoia)
      await db.autopilotRun.deleteMany({ where: { autopilotId: apId } });
    } catch {}
    try {
      await db.autopilotLead.deleteMany({ where: { autopilotId: apId } });
    } catch {}
    try {
      await db.autopilotWorkflow.delete({ where: { id: apId } }).catch(() => {});
    } catch {}
  }
  for (const uId of ctx.userIds) {
    try {
      await db.autopilotRun.deleteMany({ where: { userId: uId } });
    } catch {}
    try {
      await db.autopilotWorkflow.deleteMany({ where: { userId: uId } });
    } catch {}
    try {
      await db.user.delete({ where: { id: uId } }).catch(() => {});
    } catch {}
  }
}

/**
 * Create a workflow + automation pair for the test user.
 */
export async function createTestAutomation(input: {
  ctx: Part1TestContext;
  userId: string;
  workflowName?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  niches?: string[];
  geography?: Record<string, unknown>;
}): Promise<{ workflowId: string; automationId: string }> {
  const workflowName = input.workflowName ?? `${input.ctx.runPrefix}-wf`;
  const wf = await db.workflowDefinition.create({
    data: {
      name: workflowName,
      userId: input.userId,
      status: 'active',
      triggerType: 'manual', // required by schema
      nodes: '[]',
      edges: '[]',
      isTemplate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const ap = await db.autopilotWorkflow.create({
    data: {
      userId: input.userId,
      name: `${input.ctx.runPrefix}-ap`,
      status: input.status ?? 'DRAFT',
      niches: JSON.stringify(input.niches ?? ['TestNiche']),
      geography: JSON.stringify(input.geography ?? { country: 'IN', city: 'Test' }),
      profileMappings: '{}',
      workflowId: wf.id,
      schedule: 'daily',
      nextRunAt: input.status === 'ACTIVE' ? new Date() : null,
      timezone: 'Asia/Kolkata',
      eventTriggers: '[]',
      executionPolicy: '{}',
      approvalPolicy: '{}',
      permissionsPolicy: '{}',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  input.ctx.automationIds.push(ap.id);
  return { workflowId: wf.id, automationId: ap.id };
}

/**
 * Get the underlying db instance — exposed so tests can run raw
 * assertions without re-importing.
 */
export function getDb() {
  return db;
}
