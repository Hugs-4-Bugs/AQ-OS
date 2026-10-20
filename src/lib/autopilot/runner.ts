// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Runner
//
// Executes one Autopilot run:
//   claim run (atomic) → for each niche:
//     startDiscoveryJob (EXISTING production pipeline, ≈20/batch)
//     → poll job to terminal state
//     → resolve discovered payloads to persisted Lead rows
//     → AutopilotLead ledger insert (DB-level unique guard)
//     → executeWorkflow (EXISTING engine) with stable idempotency key
//   → honest counters + errors → schedule next run
//
// Concurrency story (layered):
//   1. AutopilotWorkflow ACTIVE→RUNNING claim via updateMany count==1
//   2. AutopilotRun QUEUED→RUNNING claim via updateMany count==1
//   3. Per-user in-process async mutex (single Node runtime deployment)
//   4. AutopilotLead @@unique([autopilotId, leadId]) — DB-level
//      "one lead processed at most once per autopilot"
//   5. WorkflowExecution.idempotencyKey (stable per autopilot+lead)
//   6. Discovery credits: idempotency keys inside the pipeline itself
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { startDiscoveryJob } from '@/lib/lead-discovery-service';
import { executeWorkflow } from '@/lib/workflow-executor';
import { checkCreditSufficiency, CREDIT_COSTS } from '@/lib/credit-service';
import { normalizeCountryName } from '@/lib/countries';
import {
  AUTOPILOT_DISCOVERY_BATCH,
  AUTOPILOT_EXECUTION_PACING_MS,
  AUTOPILOT_JOB_POLL_MS,
  AUTOPILOT_JOB_TIMEOUT_MS,
  AUTOPILOT_NICHE_PACING_MS,
  AUTOPILOT_STUCK_MS,
  SCHEDULE_INTERVAL_MS,
  isAutopilotSchedule,
  type AutopilotSchedule,
} from './constants';

// ===== per-user in-process mutex =====

const userLocks = new Map<string, Promise<unknown>>();

/**
 * Serialize async work per user within this process. The production
 * deployment is a single Node runtime over SQLite; combined with the
 * DB-level ledger unique constraint this makes concurrent autopilot
 * runs for the same user safe.
 */
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) || Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  userLocks.set(userId, previous.then(() => gate));
  try {
    await previous.catch(() => {});
    return await fn();
  } finally {
    release();
    if (userLocks.get(userId) === gate) {
      // chain completed — clean up so the map does not grow forever
      userLocks.delete(userId);
    }
  }
}

// ===== scheduling helpers =====

export function computeNextRun(schedule: string, from: Date = new Date()): Date | null {
  if (!isAutopilotSchedule(schedule)) return null;
  return new Date(from.getTime() + SCHEDULE_INTERVAL_MS[schedule as AutopilotSchedule]);
}

// ===== discovery job helpers =====

interface DiscoveredPayload {
  businessName?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  [k: string]: unknown;
}

interface DiscoveryJobRow {
  id: string;
  status: string;
  totalFound: number;
  imported: number;
  duplicates: number;
  failed: number;
  filteredOut: number;
  errorMessage: string | null;
  resultData: string | null;
}

async function pollDiscoveryJob(jobId: string): Promise<DiscoveryJobRow> {
  const deadline = Date.now() + AUTOPILOT_JOB_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, AUTOPILOT_JOB_POLL_MS));
    const job = await db.discoveryJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`Discovery job ${jobId} disappeared`);
    if (job.status === 'completed' || job.status === 'failed') {
      return {
        id: job.id,
        status: job.status,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        failed: job.failed,
        filteredOut: job.filteredOut,
        errorMessage: job.errorMessage,
        resultData: job.resultData,
      };
    }
    if (Date.now() > deadline) {
      throw new Error(`Discovery job ${jobId} timed out after ${Math.round(AUTOPILOT_JOB_TIMEOUT_MS / 60000)} min`);
    }
  }
}

/**
 * Resolve a discovered payload to its PERSISTED lead row for this user.
 * The discovery pipeline already persisted + deduped everything in
 * resultData; matching is deterministic (website → email → phone →
 * name+location) — no guessing, no invented fields. Returns null when
 * the payload cannot be matched to a persisted lead.
 */
async function resolvePersistedLead(
  userId: string,
  payload: DiscoveredPayload
): Promise<{ id: string } | null> {
  const website = typeof payload.website === 'string' ? payload.website.trim() : '';
  if (website) {
    const bySite = await db.lead.findFirst({
      where: { userId, website, isActive: true },
      select: { id: true },
    });
    if (bySite) return bySite;
  }
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (email) {
    const byEmail = await db.lead.findFirst({
      where: { userId, email, isActive: true },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  if (phone) {
    const byPhone = await db.lead.findFirst({
      where: { userId, phone, isActive: true },
      select: { id: true },
    });
    if (byPhone) return byPhone;
  }
  const name = typeof payload.businessName === 'string' ? payload.businessName.trim() : '';
  if (name) {
    const city = typeof payload.city === 'string' ? payload.city.trim() : null;
    const countryRaw = typeof payload.country === 'string' ? payload.country.trim() : null;
    const country = countryRaw ? normalizeCountryName(countryRaw) || countryRaw : null;
    const byName = await db.lead.findFirst({
      where: {
        userId,
        businessName: name,
        isActive: true,
        ...(city ? { city } : {}),
        ...(country ? { country } : {}),
      },
      select: { id: true },
    });
    if (byName) return byName;
    // name-only fallback (dedup service treats name matches as duplicates too)
    const byNameOnly = await db.lead.findFirst({
      where: { userId, businessName: name, isActive: true },
      select: { id: true },
    });
    if (byNameOnly) return byNameOnly;
  }
  return null;
}

// ===== run execution =====

export interface AutopilotRunOutcome {
  runId: string;
  status: 'COMPLETED' | 'FAILED';
  discovered: number;
  saved: number;
  processed: number;
  executionsCreated: number;
  perNiche: Array<{
    niche: string;
    jobId: string | null;
    status: string;
    discovered: number;
    imported: number;
    duplicates: number;
    error?: string;
  }>;
  error?: string;
}

interface AutopilotRow {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  status: string;
  niches: string;
  geography: string;
  workflowId: string;
  schedule: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Execute one run of an autopilot. The caller MUST have already set the
 * autopilot status to RUNNING (scheduler does it atomically; the manual
 * route does it before calling) — this function claims its own run row
 * atomically and does the rest.
 */
export async function executeAutopilotRun(
  autopilot: AutopilotRow,
  runId: string,
  trigger: 'manual' | 'scheduler'
): Promise<AutopilotRunOutcome> {
  // Atomic run claim: only one winner can flip QUEUED→RUNNING.
  const claimed = await db.autopilotRun.updateMany({
    where: { id: runId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Another worker already claimed this run — do not execute twice.
    return {
      runId,
      status: 'FAILED',
      discovered: 0, saved: 0, processed: 0, executionsCreated: 0,
      perNiche: [],
      error: 'Run was already claimed by another worker',
    };
  }

  const niches = parseJson<string[]>(autopilot.niches, []);
  const geo = parseJson<{ country?: string; city?: string }>(autopilot.geography, {});

  const perNiche: AutopilotRunOutcome['perNiche'] = [];
  let discovered = 0;
  let saved = 0;
  let processed = 0;
  let executionsCreated = 0;
  let hardFailures = 0;

  try {
    // Linked workflow must exist, belong to the user, and be ACTIVE.
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: autopilot.workflowId, userId: autopilot.userId },
      select: { id: true, status: true, name: true },
    });
    if (!workflow) throw new Error('Linked workflow not found for this account');
    if (workflow.status !== 'active') {
      throw new Error(`Linked workflow "${workflow.name}" is not active — activate it in Workflows first`);
    }

    // Pre-flight credit check for the discovery phase (honest refusal
    // BEFORE any work instead of mid-run starvation). Workflow action
    // credits are enforced by the execution engine per step.
    const planCredits = niches.length * AUTOPILOT_DISCOVERY_BATCH * CREDIT_COSTS.lead_discovery;
    const sufficiency = await checkCreditSufficiency(autopilot.userId, planCredits);
    if (!sufficiency.sufficient) {
      throw new Error(
        `Insufficient credits for discovery: need ~${planCredits}, available ${sufficiency.balance}. Top up credits and run again.`
      );
    }

    for (const niche of niches) {
      // ── 1. Start discovery via the EXISTING production pipeline ──
      let jobId: string | null = null;
      try {
        const job = await startDiscoveryJob(
          autopilot.userId,
          {
            niche,
            country: geo.country,
            city: geo.city,
            source: 'ai_search',
            maxResults: AUTOPILOT_DISCOVERY_BATCH,
          },
          autopilot.orgId || undefined
        );
        if (job.status === 'failed' || !job.jobId) {
          hardFailures++;
          perNiche.push({
            niche, jobId: null, status: 'FAILED',
            discovered: 0, imported: 0, duplicates: 0,
            error: job.message || 'Discovery job failed to start',
          });
          continue;
        }
        jobId = job.jobId;
      } catch (startErr) {
        hardFailures++;
        perNiche.push({
          niche, jobId: null, status: 'FAILED',
          discovered: 0, imported: 0, duplicates: 0,
          error: startErr instanceof Error ? startErr.message : 'Discovery start error',
        });
        continue;
      }

      // ── 2. Wait for the job to reach a terminal state ──
      let job: DiscoveryJobRow;
      try {
        job = await pollDiscoveryJob(jobId);
      } catch (pollErr) {
        hardFailures++;
        perNiche.push({
          niche, jobId, status: 'FAILED',
          discovered: 0, imported: 0, duplicates: 0,
          error: pollErr instanceof Error ? pollErr.message : 'Discovery poll error',
        });
        continue;
      }

      discovered += job.totalFound;
      saved += job.imported;
      const nicheError =
        job.status === 'failed'
          ? (job.errorMessage || 'Discovery job failed')
          : undefined;
      if (job.status === 'failed') hardFailures++;

      // ── 3. Resolve discovered payloads → persisted leads → ledger → workflow ──
      const payloads = job.resultData ? parseJson<DiscoveredPayload[]>(job.resultData, []) : [];
      for (const payload of payloads) {
        const lead = await resolvePersistedLead(autopilot.userId, payload);
        if (!lead) continue; // payload could not be matched — skip honestly (counted via job counters)
        processed++;
        try {
          // DB-level idempotency: unique(autopilotId, leadId). If this
          // lead was already processed by ANY earlier run of this
          // autopilot, the insert loses and we skip — a lead can never
          // be executed twice.
          await db.autopilotLead.create({
            data: {
              autopilotId: autopilot.id,
              runId,
              leadId: lead.id,
              userId: autopilot.userId,
              status: 'DISCOVERED',
            },
          });
        } catch {
          // Unique constraint hit → already processed by a previous run.
          continue;
        }

        // Execute the user's configured workflow against this lead via
        // the EXISTING execution engine. Stable idempotency key = one
        // execution per (autopilot, lead) even under retries/duplicates.
        const idempotencyKey = `autopilot:${autopilot.id}:lead:${lead.id}`;
        try {
          const execution = await executeWorkflow(
            autopilot.workflowId,
            autopilot.userId,
            {
              leadId: lead.id,
              source: 'autopilot',
              autopilotId: autopilot.id,
              runId,
              niche,
              trigger,
            },
            idempotencyKey
          );
          executionsCreated++;
          await db.autopilotLead.updateMany({
            where: { autopilotId: autopilot.id, leadId: lead.id },
            data: { status: 'EXEC_QUEUED', executionId: execution.id },
          });
        } catch (execErr) {
          await db.autopilotLead.updateMany({
            where: { autopilotId: autopilot.id, leadId: lead.id },
            data: {
              status: 'EXEC_FAILED',
              error: execErr instanceof Error ? execErr.message : 'Execution failed',
            },
          });
        }
        // Pacing between lead executions (provider-friendly).
        await new Promise((r) => setTimeout(r, AUTOPILOT_EXECUTION_PACING_MS));
      }

      perNiche.push({
        niche,
        jobId,
        status: job.status.toUpperCase(),
        discovered: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        ...(nicheError ? { error: nicheError } : {}),
      });

      // Pacing between niches.
      await new Promise((r) => setTimeout(r, AUTOPILOT_NICHE_PACING_MS));
    }

    // ── 4. Honest run finalization ──
    const status: 'COMPLETED' | 'FAILED' = hardFailures > 0 && saved === 0 && executionsCreated === 0
      ? 'FAILED'
      : 'COMPLETED';
    const errorSummary = perNiche
      .filter((n) => n.error)
      .map((n) => `${n.niche}: ${n.error}`)
      .join(' | ');

    await db.autopilotRun.update({
      where: { id: runId },
      data: {
        status,
        discovered,
        saved,
        processed,
        executionsCreated,
        completedAt: new Date(),
        ...(errorSummary ? { error: errorSummary.substring(0, 2000) } : {}),
        ...(status === 'FAILED' && !errorSummary ? { error: 'Run failed — no leads imported and no executions created' } : {}),
      },
    });

    return {
      runId, status, discovered, saved, processed, executionsCreated, perNiche,
      ...(errorSummary ? { error: errorSummary } : {}),
    };
  } catch (fatal) {
    const message = fatal instanceof Error ? fatal.message : 'Autopilot run failed';
    await db.autopilotRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        error: message.substring(0, 2000),
        discovered, saved, processed, executionsCreated,
        completedAt: new Date(),
      },
    });
    return {
      runId, status: 'FAILED', discovered, saved, processed, executionsCreated,
      perNiche, error: message,
    };
  }
}

/**
 * Run an autopilot end-to-end under the per-user lock: create the run
 * row (QUEUED), execute it, then finalize autopilot counters + state.
 * `trigger` is 'manual' (API) or 'scheduler' (cron).
 */
export async function runAutopilot(
  autopilotId: string,
  userId: string,
  trigger: 'manual' | 'scheduler'
): Promise<{ ok: boolean; runId?: string; error?: string; code?: string; outcome?: AutopilotRunOutcome }> {
  return withUserLock(userId, async () => {
    const autopilot = await db.autopilotWorkflow.findFirst({
      where: { id: autopilotId, userId },
    });
    if (!autopilot) {
      return { ok: false, error: 'Autopilot not found', code: 'NOT_FOUND' };
    }
    // Manual runs require ACTIVE. The scheduler path claims ACTIVE→RUNNING
    // before calling, so RUNNING is also acceptable there.
    const acceptable = trigger === 'manual' ? ['ACTIVE'] : ['ACTIVE', 'RUNNING'];
    if (!acceptable.includes(autopilot.status)) {
      return {
        ok: false,
        error: `Autopilot is ${autopilot.status} — only ACTIVE autopilots can run`,
        code: 'INVALID_STATE',
      };
    }
    // Concurrent-run guard: no second run while one is QUEUED/RUNNING.
    const openRun = await db.autopilotRun.findFirst({
      where: { autopilotId: autopilot.id, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (openRun) {
      return {
        ok: false,
        error: 'A run is already queued or running for this Autopilot',
        code: 'RUN_IN_PROGRESS',
      };
    }

    // Atomic state claim: ACTIVE→RUNNING. The scheduler path already
    // flipped ACTIVE→RUNNING before calling (count==1 winner); the manual
    // path claims here. Either way exactly one claim succeeds.
    if (autopilot.status === 'ACTIVE') {
      const claimed = await db.autopilotWorkflow.updateMany({
        where: { id: autopilot.id, status: 'ACTIVE' },
        data: { status: 'RUNNING' },
      });
      if (claimed.count !== 1) {
        return {
          ok: false,
          error: 'Autopilot state changed concurrently — run not started',
          code: 'STATE_CONFLICT',
        };
      }
    }

    const run = await db.autopilotRun.create({
      data: {
        autopilotId: autopilot.id,
        userId,
        status: 'QUEUED',
        trigger,
        config: JSON.stringify({
          niches: parseJson<string[]>(autopilot.niches, []),
          geography: parseJson<Record<string, string>>(autopilot.geography, {}),
        }),
      },
    });

    const outcome = await executeAutopilotRun(
      autopilot as unknown as AutopilotRow,
      run.id,
      trigger
    );

    // Finalize autopilot row: RUNNING → ACTIVE/FAILED + counters.
    const stillOurs = await db.autopilotWorkflow.updateMany({
      where: { id: autopilot.id, status: 'RUNNING' },
      data: {
        status: outcome.status === 'FAILED' ? 'FAILED' : 'ACTIVE',
        lastRunAt: new Date(),
        lastError: outcome.error ? outcome.error.substring(0, 2000) : null,
        runCount: { increment: 1 },
        totalDiscovered: { increment: outcome.discovered },
        totalSaved: { increment: outcome.saved },
        totalProcessed: { increment: outcome.processed },
        totalExecutions: { increment: outcome.executionsCreated },
      },
    });
    if (stillOurs.count !== 1) {
      // Recovery path already flipped the state — make counters honest anyway.
      await db.autopilotWorkflow.update({
        where: { id: autopilot.id },
        data: {
          runCount: { increment: 1 },
          totalDiscovered: { increment: outcome.discovered },
          totalSaved: { increment: outcome.saved },
          totalProcessed: { increment: outcome.processed },
          totalExecutions: { increment: outcome.executionsCreated },
        },
      });
    }
    return { ok: true, runId: run.id, outcome };
  });
}

// ===== stuck-run recovery =====

export interface RecoveryResult {
  recoveredRuns: number;
  recoveredAutopilots: number;
}

/**
 * Honest recovery of interrupted runs: anything stuck in RUNNING for
 * over AUTOPILOT_STUCK_MS is marked FAILED with an explicit recovery
 * note, and its autopilot returns to ACTIVE (or FAILED if the autopilot
 * row was left RUNNING by a crash). Idempotent — safe to call on every
 * scheduler tick.
 */
export async function recoverStuckAutopilotRuns(): Promise<RecoveryResult> {
  const stuckBefore = new Date(Date.now() - AUTOPILOT_STUCK_MS);

  // 1. Stuck runs (startedAt in the past beyond the threshold).
  const stuckRuns = await db.autopilotRun.findMany({
    where: { status: 'RUNNING', startedAt: { lt: stuckBefore } },
    select: { id: true, autopilotId: true },
  });
  for (const run of stuckRuns) {
    await db.autopilotRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: 'Recovered by scheduler: run stuck in RUNNING for over 60 minutes (process restart or timeout).',
        completedAt: new Date(),
      },
    });
  }

  // 2. Autopilots stuck in RUNNING (process died mid-run).
  const stuckAutopilots = await db.autopilotWorkflow.findMany({
    where: { status: 'RUNNING', lastRunAt: { lt: stuckBefore } },
    select: { id: true },
  });
  for (const ap of stuckAutopilots) {
    await db.autopilotWorkflow.update({
      where: { id: ap.id },
      data: { status: 'FAILED', lastError: 'Recovered by scheduler: was stuck in RUNNING for over 60 minutes.' },
    });
  }

  return { recoveredRuns: stuckRuns.length, recoveredAutopilots: stuckAutopilots.length };
}
