// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 2 Tests — Cross-User / Cross-Business Isolation
//
// Verifies that every layer of the orchestration stack is scoped to the
// caller's userId context — no leakage across users, no leakage across
// businesses.
//
//   · Two users each create their own agent graph; results don't leak
//   · checkOperationEntitlement(userA, 'lead_analysis') does NOT
//     consider userB's balance
//   · chargeOperationCredits for userA doesn't deduct from userB
//   · ModelInvocation rows are ownership-scoped (User B can never see
//     User A's invocations)
//   · Credit refunds are scoped (a refund against A's logical key
//     never moves B's balance)
//
// Uses the REAL test.db (vitest.setup.ts sets DATABASE_URL=file:./test.db).
// Setup pattern: setupPart2Context is called TWICE — once for each user.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupPart2Context,
  teardownPart2Context,
  type Part2TestContext,
} from '../helpers/part2-test-utils';
import {
  chargeOperationCredits,
  refundOperationCredits,
  checkOperationEntitlement,
} from '@/lib/ai/credits-orchestrator';
import {
  createRunningInvocation,
  completeInvocation,
  getInvocationsForExecution,
  getInvocationsForLead,
  getInvocationStats,
} from '@/lib/model-invocation';
import { getCreditBalance } from '@/lib/credit-service';
import { db } from '@/lib/db';

describe('[Part 2] User Isolation', () => {
  let ctxA: Part2TestContext;
  let ctxB: Part2TestContext;

  beforeEach(async () => {
    // Two separate contexts → two separate users with their own balance.
    ctxA = await setupPart2Context();
    ctxB = await setupPart2Context();

    // Give each user a distinct balance so we can prove the per-user
    // balance is consulted, not the global state.
    // ctxA's user starts at 1000 (from setupPart2Context). Top user B up
    // to 2000 so the two balances are trivially distinguishable.
    await db.user.update({
      where: { id: ctxB.userIds[0] },
      data: { credits: 2000 },
    });
  });

  afterEach(async () => {
    // Clean up ModelInvocation rows BEFORE deleting the users — the
    // ModelInvocation table has no FK relation to User (its userId is
    // denormalised for isolation, not cascade-enforced), so user-delete
    // would leave orphan rows that collide on the unique invocationKey
    // constraint across subsequent test runs.
    for (const userId of [...ctxA.userIds, ...ctxB.userIds]) {
      try {
        await db.modelInvocation.deleteMany({ where: { userId } });
      } catch {
        // best-effort
      }
    }
    await teardownPart2Context(ctxA);
    await teardownPart2Context(ctxB);
  });

  // ── Helper: create a ModelInvocation row for a user (simulates the
  // orchestrator's userId-scoped createRunningInvocation call). The
  // invocationKey is namespaced with `keyPrefix` so each test run
  // produces unique keys (the table has a UNIQUE constraint on
  // invocationKey — without namespacing, runs would collide).
  async function createInvocationForUser(
    userId: string,
    keyPrefix: string,
    executionId: string,
    leadId: string,
    stepName: string,
    role: string,
  ) {
    return createRunningInvocation({
      invocationKey: `mi:${keyPrefix}:${executionId}:${leadId}:${stepName}:mock:${role}`,
      executionId,
      leadId,
      stepName,
      actionType: 'lead_analysis',
      provider: 'mock',
      model: 'mock-model',
      role,
      userId,
    });
  }

  describe('orchestrator userId context is enforced at every layer', () => {
    it('two users each create their own agent graph; results do not leak across users', async () => {
      // Each user has their OWN executionId (realistic: each user
      // owns their own WorkflowExecution). Both executionIds feed
      // rows into the SAME ModelInvocation table; the userId field
      // is what isolates them at query time. A per-run keyPrefix
      // namespaces the invocationKey so the unique constraint holds
      // across test runs.
      const keyPrefix = ctxA.runPrefix;
      const execA = 'exec-iso-A';
      const execB = 'exec-iso-B';

      // User A creates two agent invocations under execA.
      const invA1 = await createInvocationForUser(
        ctxA.userIds[0],
        keyPrefix,
        execA,
        'lead-A-1',
        'discovery',
        'researcher',
      );
      const invA2 = await createInvocationForUser(
        ctxA.userIds[0],
        keyPrefix,
        execA,
        'lead-A-2',
        'enrichment',
        'enricher',
      );

      // User B creates two agent invocations under execB.
      const invB1 = await createInvocationForUser(
        ctxB.userIds[0],
        keyPrefix,
        execB,
        'lead-B-1',
        'discovery',
        'researcher',
      );
      const invB2 = await createInvocationForUser(
        ctxB.userIds[0],
        keyPrefix,
        execB,
        'lead-B-2',
        'enrichment',
        'enricher',
      );

      // Complete all of them so the persisted rows are durable.
      for (const inv of [invA1, invA2, invB1, invB2]) {
        await completeInvocation(inv.id, {
          provider: 'mock',
          model: 'mock-model',
          content: `content for ${inv.id}`,
          tokensUsed: 5,
          retries: 0,
        });
      }

      // User A's view of their execution: only their two rows.
      const listA = await getInvocationsForExecution(execA, ctxA.userIds[0]);
      expect(listA).toHaveLength(2);
      expect(listA.every((r) => r.userId === ctxA.userIds[0])).toBe(true);
      expect(listA.some((r) => r.id === invA1.id)).toBe(true);
      expect(listA.some((r) => r.id === invA2.id)).toBe(true);
      expect(listA.some((r) => r.id === invB1.id)).toBe(false);
      expect(listA.some((r) => r.id === invB2.id)).toBe(false);

      // User B's view of their execution: only their two rows.
      const listB = await getInvocationsForExecution(execB, ctxB.userIds[0]);
      expect(listB).toHaveLength(2);
      expect(listB.every((r) => r.userId === ctxB.userIds[0])).toBe(true);
      expect(listB.some((r) => r.id === invB1.id)).toBe(true);
      expect(listB.some((r) => r.id === invB2.id)).toBe(true);
      expect(listB.some((r) => r.id === invA1.id)).toBe(false);
      expect(listB.some((r) => r.id === invA2.id)).toBe(false);

      // CRITICAL isolation check: User A querying User B's executionId
      // returns ZERO rows (even though rows exist under that executionId).
      const crossA = await getInvocationsForExecution(execB, ctxA.userIds[0]);
      expect(crossA).toHaveLength(0);
      const crossB = await getInvocationsForExecution(execA, ctxB.userIds[0]);
      expect(crossB).toHaveLength(0);
    });

    it('getInvocationsForLead is ownership-scoped (User B cannot read User A lead invocations)', async () => {
      // User A and User B each have an invocation tied to the SAME lead
      // id "lead-iso-X" but under DIFFERENT executionIds (so the unique
      // invocationKey constraint holds). The userId field on each row
      // is what isolates them at query time.
      const keyPrefix = ctxA.runPrefix;
      const invA = await createInvocationForUser(
        ctxA.userIds[0],
        keyPrefix,
        'exec-iso-lead-A',
        'lead-iso-X',
        'discovery',
        'analyst',
      );
      await completeInvocation(invA.id, {
        provider: 'mock',
        model: 'mock-model',
        content: 'A-only content',
        tokensUsed: 5,
        retries: 0,
      });

      // User B's invocation for the SAME lead id but different execution.
      const invB = await createInvocationForUser(
        ctxB.userIds[0],
        keyPrefix,
        'exec-iso-lead-B',
        'lead-iso-X',
        'discovery',
        'analyst',
      );
      await completeInvocation(invB.id, {
        provider: 'mock',
        model: 'mock-model',
        content: 'B-only content',
        tokensUsed: 5,
        retries: 0,
      });

      // User A only sees their own row for this lead.
      const forA = await getInvocationsForLead('lead-iso-X', ctxA.userIds[0]);
      expect(forA).toHaveLength(1);
      expect(forA[0].id).toBe(invA.id);
      expect(forA[0].userId).toBe(ctxA.userIds[0]);

      // User B only sees their own row for this lead.
      const forB = await getInvocationsForLead('lead-iso-X', ctxB.userIds[0]);
      expect(forB).toHaveLength(1);
      expect(forB[0].id).toBe(invB.id);
      expect(forB[0].userId).toBe(ctxB.userIds[0]);
    });

    it('getInvocationStats is scoped to the caller (User B never counts User A rows)', async () => {
      // User A creates 3 COMPLETED invocations.
      const keyPrefix = ctxA.runPrefix;
      for (let i = 0; i < 3; i++) {
        const inv = await createInvocationForUser(
          ctxA.userIds[0],
          keyPrefix,
          `exec-iso-stats-${i}`,
          `lead-stats-A-${i}`,
          'discovery',
          'researcher',
        );
        await completeInvocation(inv.id, {
          provider: 'mock',
          model: 'mock-model',
          content: 'x',
          tokensUsed: 5,
          retries: 0,
        });
      }

      // User B creates 1 COMPLETED invocation.
      const invB = await createInvocationForUser(
        ctxB.userIds[0],
        keyPrefix,
        'exec-iso-stats-B',
        'lead-stats-B',
        'discovery',
        'researcher',
      );
      await completeInvocation(invB.id, {
        provider: 'mock',
        model: 'mock-model',
        content: 'x',
        tokensUsed: 5,
        retries: 0,
      });

      const statsA = await getInvocationStats(ctxA.userIds[0]);
      const statsB = await getInvocationStats(ctxB.userIds[0]);
      expect(statsA.completed).toBeGreaterThanOrEqual(3);
      expect(statsB.completed).toBeGreaterThanOrEqual(1);
      // B's stats never include A's rows — B has at most the one we made.
      // (Other Part 2 tests may leave residual rows; the invariant we
      // care about is: B's count is strictly LESS than A's + B's combined,
      // proving isolation. We verify B's stats do NOT contain A's rows
      // by asserting B's completed count < A's completed count.)
      expect(statsB.completed).toBeLessThan(statsA.completed);
    });
  });

  describe('checkOperationEntitlement never consults another user balance', () => {
    it('returns each user their OWN balance for the same action', async () => {
      // ctxA starts at 1000 credits; ctxB was topped up to 2000 in beforeEach.
      const balA = await getCreditBalance(ctxA.userIds[0]);
      const balB = await getCreditBalance(ctxB.userIds[0]);
      expect(balA.total).toBe(1000);
      expect(balB.total).toBe(2000);

      const checkA = await checkOperationEntitlement(ctxA.userIds[0], 'lead_analysis');
      const checkB = await checkOperationEntitlement(ctxB.userIds[0], 'lead_analysis');

      // Both users have ample credits → both allowed.
      expect(checkA.allowed).toBe(true);
      expect(checkB.allowed).toBe(true);

      // The CRITICAL invariant: the balance returned in each check is
      // that USER's balance, not the other user's.
      expect(checkA.balance).toBe(1000);
      expect(checkB.balance).toBe(2000);
      expect(checkA.balance).not.toBe(checkB.balance);
    });

    it('does not consider userB balance when checking userA (and vice versa)', async () => {
      // Drain user A to a near-zero balance so the entitlement check
      // fails for A. User B keeps 2000 — the check for A must STILL
      // fail (it does not consult B's balance to "rescue" A).
      await db.user.update({
        where: { id: ctxA.userIds[0] },
        data: { credits: 1 }, // not enough for any AI action
      });

      const checkA = await checkOperationEntitlement(ctxA.userIds[0], 'lead_analysis');
      const checkB = await checkOperationEntitlement(ctxB.userIds[0], 'lead_analysis');

      // A is blocked even though B is rich.
      expect(checkA.allowed).toBe(false);
      expect(checkA.balance).toBe(1);
      expect(checkA.shortfall).toBeGreaterThan(0);
      expect(checkA.reason).toContain('Insufficient');

      // B is unaffected by A's poverty.
      expect(checkB.allowed).toBe(true);
      expect(checkB.balance).toBe(2000);
    });
  });

  describe('chargeOperationCredits does not deduct from another user', () => {
    it('charging userA leaves userB balance untouched', async () => {
      const beforeA = await getCreditBalance(ctxA.userIds[0]);
      const beforeB = await getCreditBalance(ctxB.userIds[0]);
      expect(beforeA.total).toBe(1000);
      expect(beforeB.total).toBe(2000);

      // Charge user A for a lead_analysis (cost = 5).
      const res = await chargeOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: `exec-iso-charge:user-A:step-1`,
      });
      expect(res.charged).toBe(true);
      expect(res.deduplicated).toBe(false);
      expect(res.cost).toBe(5);

      const afterA = await getCreditBalance(ctxA.userIds[0]);
      const afterB = await getCreditBalance(ctxB.userIds[0]);

      // A's balance decreased by 5.
      expect(beforeA.total - afterA.total).toBe(5);
      // B's balance is UNCHANGED — charging A never touches B.
      expect(afterB.total).toBe(beforeB.total);
      expect(afterB.total).toBe(2000);
    });

    it('charging userA twice (idempotent key) leaves userB untouched both times', async () => {
      // Two charges with the SAME logical key → second is deduplicated.
      // The dedup MUST scope to userA — userB's balance must not move
      // even if userB were to submit the same logical key (it would
      // create a separate charge for B, NOT dedup against A).
      const beforeB = await getCreditBalance(ctxB.userIds[0]);

      // User A: charge + duplicate.
      await chargeOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-shared-key',
      });
      await chargeOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-shared-key',
      });

      // User B: charge with the SAME logical key (a different user
      // is a different credit scope — the key is namespaced per user).
      await chargeOperationCredits({
        userId: ctxB.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-shared-key',
      });

      const afterB = await getCreditBalance(ctxB.userIds[0]);
      // B was charged ONCE (the dedup key is namespaced by userId in
      // the credit-service — A's deduction never blocks B's charge).
      expect(beforeB.total - afterB.total).toBe(5);
    });
  });

  describe('refundOperationCredits is ownership-scoped', () => {
    it('refund on userA logical key never moves userB balance', async () => {
      const beforeA = await getCreditBalance(ctxA.userIds[0]);
      const beforeB = await getCreditBalance(ctxB.userIds[0]);

      // Charge A, then refund A (twice — duplicate refund is deduped).
      await chargeOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-refund-A',
      });
      const afterChargeA = await getCreditBalance(ctxA.userIds[0]);
      expect(beforeA.total - afterChargeA.total).toBe(5);

      await refundOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-refund-A',
      });
      const afterRefundA = await getCreditBalance(ctxA.userIds[0]);
      expect(afterRefundA.total).toBe(beforeA.total); // back to start

      // Duplicate refund (idempotent) — A unchanged.
      await refundOperationCredits({
        userId: ctxA.userIds[0],
        action: 'lead_analysis',
        logicalKey: 'iso-refund-A',
      });
      const afterDupRefundA = await getCreditBalance(ctxA.userIds[0]);
      expect(afterDupRefundA.total).toBe(beforeA.total);

      // The whole time, B never moved.
      const afterB = await getCreditBalance(ctxB.userIds[0]);
      expect(afterB.total).toBe(beforeB.total);
      expect(afterB.total).toBe(2000);
    });
  });
});
