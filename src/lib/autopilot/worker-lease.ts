// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Worker Lease / Atomic Claim
//
// Guarantees that two workers cannot execute the same invocation
// simultaneously, and that a crashed worker's lease is eventually
// reclaimable.
//
// Mechanism:
//   · Atomic claim  — Prisma `updateMany` with WHERE status='QUEUED'
//                     (or WHERE leaseExpiresAt < now). The single
//                     affected-row guarantee (count === 1) is the lock.
//   · Lease expiry  — every tick scans for invocations in RUNNING whose
//                     leaseExpiresAt has passed; those are reclaimed.
//   · Safe recovery — on resume, the new worker reads the checkpoint,
//                     skips completed operations, and continues. The
//                     `claimNonce` on each checkpoint row prevents a
//                     stale (pre-crash) worker from writing after a new
//                     worker has taken over.
//
// This module is DB-only; no in-process state. Safe across restarts.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import os from 'os';

export interface WorkerIdentity {
  /** Stable per-process worker id, hostname + pid + random nonce. */
  workerId: string;
}

let _cachedWorkerId: string | null = null;

/**
 * Per-process worker identity. Cached so all claims/releases by this
 * process share the same identity (avoids self-reclaiming our own
 * leases). The nonce regenerates on process restart so a stale
 * post-restart write can be detected.
 */
export function getWorkerIdentity(): WorkerIdentity {
  if (_cachedWorkerId) return { workerId: _cachedWorkerId };
  const hostname = os.hostname?.() ?? 'unknown-host';
  const pid = process.pid;
  const nonce = randomUUID().slice(0, 8);
  _cachedWorkerId = `${hostname}:${pid}:${nonce}`;
  return { workerId: _cachedWorkerId };
}

export interface ClaimInput {
  invocationId: string;
  /** Lease duration in ms. Default 10 minutes. */
  leaseMs?: number;
}

export interface ClaimResult {
  claimed: boolean;
  invocationId: string;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  /** Present when the claim failed because another worker holds a live lease. */
  conflictReason?: 'lease_held' | 'not_queued' | 'not_found' | 'unexpected_state';
}

/**
 * Atomically claim an invocation for execution.
 *
 * The claim succeeds iff:
 *   · the invocation exists,
 *   · its status is QUEUED or (RUNNING with leaseExpiresAt < now),
 *   · no other worker holds a live lease.
 *
 * Implemented as a single Prisma `updateMany` with WHERE clause that
 * encodes the entire precondition. SQLite/Prisma guarantee atomicity —
 * if two workers race, exactly one sees `count === 1`.
 */
export async function claimInvocation(input: ClaimInput): Promise<ClaimResult> {
  const leaseMs = input.leaseMs ?? 10 * 60 * 1000;
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { workerId } = getWorkerIdentity();

  // Race-safe claim — the WHERE clause encodes "no live lease owner OR
  // existing lease has expired OR same worker already owns it (renewal)".
  const updated = await db.autopilotRun.updateMany({
    where: {
      id: input.invocationId,
      OR: [
        // Case 1: queued and never claimed.
        { status: 'QUEUED', leaseOwner: null },
        // Case 2: previously claimed but lease has expired.
        {
          status: 'RUNNING',
          leaseExpiresAt: { lt: now },
        },
        // Case 3: renewal by the same worker (lease still live).
        {
          status: 'RUNNING',
          leaseOwner: workerId,
        },
      ],
    },
    data: {
      status: 'RUNNING',
      leaseOwner: workerId,
      leaseExpiresAt,
      startedAt: now, // safe — `startedAt` is null until first claim
      updatedAt: now,
    },
  });

  if (updated.count === 1) {
    return {
      claimed: true,
      invocationId: input.invocationId,
      leaseOwner: workerId,
      leaseExpiresAt,
    };
  }

  // Claim failed — figure out why for observability.
  const run = await db.autopilotRun.findUnique({
    where: { id: input.invocationId },
    select: {
      status: true,
      leaseOwner: true,
      leaseExpiresAt: true,
    },
  });

  if (!run) {
    return { claimed: false, invocationId: input.invocationId, conflictReason: 'not_found' };
  }
  if (run.status === 'QUEUED') {
    // Should have been claimable; another worker beat us to it.
    return { claimed: false, invocationId: input.invocationId, conflictReason: 'lease_held' };
  }
  if (run.status === 'RUNNING') {
    if (run.leaseOwner === workerId) {
      // We already hold this lease — treat as a no-op renewal.
      return {
        claimed: true,
        invocationId: input.invocationId,
        leaseOwner: workerId,
        leaseExpiresAt: run.leaseExpiresAt ?? leaseExpiresAt,
      };
    }
    if (run.leaseExpiresAt && run.leaseExpiresAt > now) {
      return { claimed: false, invocationId: input.invocationId, conflictReason: 'lease_held' };
    }
    // Lease expired but our updateMany didn't fire — race lost.
    return { claimed: false, invocationId: input.invocationId, conflictReason: 'lease_held' };
  }
  return {
    claimed: false,
    invocationId: input.invocationId,
    conflictReason: 'unexpected_state',
  };
}

/**
 * Renew an existing lease without changing invocation state.
 * Use this on long-running steps to extend the lease window.
 */
export async function renewLease(input: ClaimInput): Promise<ClaimResult> {
  const leaseMs = input.leaseMs ?? 10 * 60 * 1000;
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { workerId } = getWorkerIdentity();

  const updated = await db.autopilotRun.updateMany({
    where: {
      id: input.invocationId,
      leaseOwner: workerId, // only the current owner can renew
      status: 'RUNNING',
    },
    data: {
      leaseExpiresAt,
      updatedAt: now,
    },
  });

  if (updated.count === 1) {
    return {
      claimed: true,
      invocationId: input.invocationId,
      leaseOwner: workerId,
      leaseExpiresAt,
    };
  }
  return {
    claimed: false,
    invocationId: input.invocationId,
    conflictReason: 'lease_held',
  };
}

/**
 * Release the lease — invocation transitions to a non-RUNNING state.
 * Caller must specify the new terminal/intermediate status.
 */
export async function releaseLease(
  invocationId: string,
  nextStatus: 'COMPLETED' | 'FAILED' | 'WAITING' | 'PAUSED' | 'BLOCKED' | 'CANCELLED' | 'QUEUED',
  patch?: Record<string, unknown>,
): Promise<{ released: boolean }> {
  const { workerId } = getWorkerIdentity();
  const now = new Date();

  const updated = await db.autopilotRun.updateMany({
    where: {
      id: invocationId,
      // Only the current lease owner may release. If the lease has been
      // reclaimed (expiry), this no-ops — the new owner's writes win.
      leaseOwner: workerId,
    },
    data: {
      status: nextStatus,
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(nextStatus) ? now : undefined,
      updatedAt: now,
      ...(patch ?? {}),
    },
  });

  return { released: updated.count === 1 };
}

export interface StaleLeaseRecoveryResult {
  scanned: number;
  recovered: number;
  recoveredIds: string[];
}

/**
 * Find invocations whose lease has expired and reset them to QUEUED so
 * the next tick can reclaim them.
 *
 * This is the safe-recovery half of the spec: a crashed worker's
 * invocation returns to the queue rather than being silently lost.
 *
 * NOT destructive — does not delete the invocation, does not touch its
 * checkpoint, does not duplicate business actions. The new worker
 * resumes from the persisted checkpoint (see `loadCheckpoint`).
 */
export async function recoverExpiredLeases(): Promise<StaleLeaseRecoveryResult> {
  const now = new Date();
  const stale = await db.autopilotRun.findMany({
    where: {
      status: 'RUNNING',
      leaseExpiresAt: { lt: now, not: null },
    },
    select: { id: true },
    take: 20, // bounded per tick
  });

  if (stale.length === 0) {
    return { scanned: 0, recovered: 0, recoveredIds: [] };
  }

  // Reclaim each stale lease by clearing the owner/expiry and setting
  // status back to QUEUED. The next scheduler tick will re-claim it.
  // We use updateMany per row to encode "only if still stale" — a race
  // with the original owner re-checking in is safe (they'd lose the
  // lease and self-terminate).
  const recoveredIds: string[] = [];
  for (const { id } of stale) {
    const r = await db.autopilotRun.updateMany({
      where: {
        id,
        status: 'RUNNING',
        leaseExpiresAt: { lt: now },
      },
      data: {
        status: 'QUEUED',
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
    });
    if (r.count === 1) recoveredIds.push(id);
  }

  return {
    scanned: stale.length,
    recovered: recoveredIds.length,
    recoveredIds,
  };
}

/**
 * Verify that the calling worker still holds the lease on this
 * invocation. Useful for long-running loops to bail out early if
 * the lease was reclaimed.
 */
export async function verifyLease(invocationId: string): Promise<boolean> {
  const { workerId } = getWorkerIdentity();
  const run = await db.autopilotRun.findUnique({
    where: { id: invocationId },
    select: { leaseOwner: true, status: true },
  });
  if (!run) return false;
  if (run.status !== 'RUNNING') return false;
  return run.leaseOwner === workerId;
}

/**
 * Test helper: produce a fresh worker identity (separate from the
 * process-default one) so two workers in the same test process can
 * race against each other without sharing an id.
 */
export function __part1TestForkWorkerIdentity(): WorkerIdentity {
  const hostname = os.hostname?.() ?? 'unknown-host';
  const pid = process.pid;
  const nonce = randomUUID().slice(0, 8);
  return { workerId: `${hostname}:${pid}:test-${nonce}` };
}

/**
 * Test helper: claim with a specific worker identity (so tests can
 * simulate two different workers racing). Production callers should
 * use `claimInvocation` which uses the process worker id.
 */
export async function claimInvocationAs(
  input: ClaimInput,
  worker: WorkerIdentity,
): Promise<ClaimResult> {
  const leaseMs = input.leaseMs ?? 10 * 60 * 1000;
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  const updated = await db.autopilotRun.updateMany({
    where: {
      id: input.invocationId,
      OR: [
        { status: 'QUEUED', leaseOwner: null },
        { status: 'RUNNING', leaseExpiresAt: { lt: now } },
        // Renewal by the same worker.
        { status: 'RUNNING', leaseOwner: worker.workerId },
      ],
    },
    data: {
      status: 'RUNNING',
      leaseOwner: worker.workerId,
      leaseExpiresAt,
      startedAt: now,
      updatedAt: now,
    },
  });

  if (updated.count === 1) {
    return {
      claimed: true,
      invocationId: input.invocationId,
      leaseOwner: worker.workerId,
      leaseExpiresAt,
    };
  }
  return { claimed: false, invocationId: input.invocationId, conflictReason: 'lease_held' };
}
