// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Execution Engine
// Phase 12: Full execution engine with retries, timeouts, DLQ
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { getLeadCountsForExecutions } from '@/lib/workflow-execution-leads';
import { executeAction, type ActionContext, type ActionResult } from '@/lib/workflow-actions';
import {
  checkExecutionLimit,
  refundNeverStartedWorkflowExecutionFee,
  rechargeWorkflowExecutionFeeOnStart,
  wasNeverStartedFeeRefunded,
  checkWorkflowExecutionFeeSufficiency,
} from '@/lib/workflow-credits';
import { sendToDeadLetter } from '@/lib/workflow-dead-letter';
import { publishEvent } from '@/lib/realtime-event-bus';
import { createNotificationOnce } from '@/lib/notification-service';
import {
  classifyStepError,
  computeBackoffDelayMs,
  type StepErrorClassification,
} from '@/lib/workflow-retry';
import {
  loadStepsForExecution,
  type ValidatedStep,
} from '@/lib/workflow-validation';

// Helper to publish workflow SSE events safely
async function emitWorkflowEvent(
  eventType: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await publishEvent({
      channel: 'workflow_events',
      eventType,
      payload,
      userId,
    });
  } catch {
    // Non-blocking: don't fail execution if event bus fails
  }
}

// ===== TYPES =====

export interface ExecuteWorkflowResult {
  executionId: string;
  status: string;
  error?: string;
  /** Steps completed before the run reached its final state (0 = the run
   * never actually started). Present on fresh runs; replay/replay-shaped
   * results may omit it. Used by callers to report never-started refunds. */
  stepsCompleted?: number;
}

interface ProcessStepResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  shouldContinue: boolean;
  durationMs: number;
  /** True when the step was never attempted (e.g. the timeout budget
   * expired before it started) — it is logged as 'skipped', not failed. */
  neverRan?: boolean;
}

/** Per-run execution budget (Phase 4): timeout, retry ceiling, start time. */
interface RunOptions {
  timeoutMs: number;
  maxRetries: number;
  startedAtMs: number;
  /** Global index of the FIRST step in this segment (fresh runs: 0;
   * resume/retry segments: the execution's currentStep). Lets the failure
   * handler know whether ANY step of the whole execution ever completed. */
  startStepIndex?: number;
  /** Part 2 §21 (amended): auto-refund the flat fee when this run segment
   * terminates with zero steps of the WHOLE execution completed — set by
   * sole-scope callers (legacy execute route, triggers, autopilot). */
  neverStartedAutoRefund?: boolean;
  /** Part 2 §21 (amended): re-charge the flat fee the moment the retried
   * execution completes its first step (its prior fee was refunded because
   * the run never started). Set by retryExecution after ledger reconciliation. */
  rechargeOnStart?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function defaultTimeoutMs(): number {
  return Number(process.env.WORKFLOW_TIMEOUT) || 300000;
}
function defaultMaxRetries(): number {
  return Number(process.env.WORKFLOW_MAX_RETRIES) || 3;
}

/** Per-step retry policy (Phase 4.6): explicit opt-in via config.retries,
 * bounded by the execution's maxRetries. Default 0 — side-effecting steps
 * are never blindly re-executed. */
function stepRetryBudget(config: Record<string, unknown>, maxRetries: number): number {
  const raw = Number(config?.retries);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), Math.max(0, maxRetries));
}

// ===== MAIN EXECUTION ENTRY POINT =====

/**
 * Execute a workflow. Creates a WorkflowExecution record and processes steps.
 * Returns the execution ID immediately (202 Accepted pattern).
 *
 * options.awaitCompletion (default true) preserves the historical inline
 * behavior: steps run to completion before the promise resolves. Batch
 * kickers (multi-lead targeted runs) pass false so each per-lead execution
 * starts in the background and the caller aggregates the persisted final
 * states instead of serializing every run behind one request.
 *
 * options.neverStartedAutoRefund (default false): for sole-scope callers
 * whose ONE charge covers this ONE execution (legacy execute-route runs,
 * event/scheduled triggers, autopilot per-lead runs). When the run then
 * terminates with ZERO steps completed — it never actually started — the
 * engine releases the flat fee itself (idempotent on the execution id).
 * Multi-lead batch kicks deliberately OMIT this flag: their shared fee is
 * reconciled by the route after the WHOLE batch settles (one fee, one
 * refund — a partially-successful batch keeps its fee).
 */
export async function executeWorkflow(
  workflowId: string,
  userId: string,
  triggerData?: Record<string, unknown>,
  idempotencyKey?: string,
  options?: { awaitCompletion?: boolean; neverStartedAutoRefund?: boolean }
): Promise<ExecuteWorkflowResult> {
  try {
    // Load workflow definition — allow both 'draft' (for testing) and 'active' workflows.
    // Drafts can be executed to validate the workflow before publishing.
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId, status: { in: ['draft', 'active'] } },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      return { executionId: '', status: 'failed', error: 'Workflow not found or not active (drafts are executable for testing)' };
    }

    // Check execution limit
    const limitCheck = await checkExecutionLimit(userId);
    if (!limitCheck.allowed) {
      return {
        executionId: '',
        status: 'failed',
        error: `Monthly execution limit reached (${limitCheck.current}/${limitCheck.limit})`,
      };
    }

    // Idempotency check + execution creation run inside ONE transaction
    // (Phase 4.9) so a concurrent duplicate request (double-click, network
    // retry, worker restart) can never create two executions for the same
    // idempotency key. Falls back to sequential when $transaction is
    // unavailable (test doubles).
    let existingExecution: { id: string; status: string } | null = null;
    let createdExecution: { id: string } | null = null;

    // Parse + structurally validate the definition BEFORE creating the
    // execution (Phase 3.13 / 4.12): legacy or malformed definitions must
    // fail honestly instead of silently "completing" with zero steps or
    // crashing mid-parse. Required-field validation happens upstream
    // (save/enable/Run Now gates); this is the engine's defense in depth
    // for webhook/trigger/scheduled callers.
    const stepLoad = loadStepsForExecution(workflow.workflowSteps, workflow.nodes);
    const steps: ValidatedStep[] = stepLoad.steps;

    const createExecutionRecord = async (client: typeof db): Promise<void> => {
      if (idempotencyKey) {
        const found = await client.workflowExecution.findFirst({
          where: { idempotencyKey, workflowId },
          select: { id: true, status: true },
        });
        if (found) {
          existingExecution = found;
          return;
        }
      }
      createdExecution = await client.workflowExecution.create({
        data: {
          workflowId,
          // Persist the execution owner. The trusted execution context (userId +
          // leadId) must survive on the execution record so that retries,
          // resumes, and audit trails all resolve leads against the SAME user
          // who started the run — never against a null/system owner.
          userId,
          status: stepLoad.ok ? 'running' : 'failed',
          // Effective-configuration snapshot: historical runs stay explainable
          // (what the workflow was, and with which settings, at run time).
          triggerData: triggerData
            ? JSON.stringify({
                ...triggerData,
                workflowSnapshot: {
                  name: workflow.name,
                  triggerType: workflow.triggerType,
                  requiresApproval: workflow.requiresApproval,
                  profileId: workflow.profileId ?? null,
                  stepCount: steps.length,
                  snapshottedAt: new Date().toISOString(),
                },
              })
            : null,
          triggerEvent: triggerData ? JSON.stringify(triggerData) : null,
          currentStep: 0,
          totalSteps: steps.length,
          idempotencyKey: idempotencyKey || null,
          maxRetries,
          timeoutMs,
          ...(stepLoad.ok ? {} : { error: stepLoad.error, completedAt: new Date() }),
        },
      });
    };

    const maxRetries = defaultMaxRetries();
    const timeoutMs = defaultTimeoutMs();
    const startedAtMs = Date.now();

    if (typeof (db as unknown as { $transaction?: unknown }).$transaction === 'function') {
      try {
        await (db as unknown as {
          $transaction: (fn: (tx?: typeof db) => Promise<void>) => Promise<void>;
        }).$transaction(async (tx) => createExecutionRecord((tx as typeof db) ?? db));
      } catch (txErr) {
        // Race-condition backstop: the DB UNIQUE index on
        // WorkflowExecution(workflowId, idempotencyKey) rejected our insert
        // because a concurrent duplicate trigger won. Re-read the winning
        // execution row and treat this call as a replay of that run.
        if (
          idempotencyKey &&
          txErr &&
          typeof txErr === 'object' &&
          'code' in txErr &&
          (txErr as { code?: string }).code === 'P2002'
        ) {
          const winner = await db.workflowExecution.findFirst({
            where: { idempotencyKey, workflowId },
            select: { id: true, status: true },
          });
          if (winner) {
            existingExecution = winner;
            createdExecution = null;
          } else {
            throw txErr;
          }
        } else {
          throw txErr;
        }
      }
    } else {
      await createExecutionRecord(db);
    }

    // The idempotent-hit variables are assigned inside the closure above;
    // re-read them through a non-narrowed view (TS cannot track closure
    // assignments, so it would otherwise narrow these to `never`).
    const existingHit = existingExecution as { id: string; status: string } | null;
    const createdHit = createdExecution as { id: string } | null;

    if (existingHit) {
      return { executionId: existingHit.id, status: existingHit.status };
    }
    if (!createdHit) {
      throw new Error('Failed to create execution record');
    }
    const executionId = createdHit.id;

    // Invalid definition: the execution record exists and honestly says WHY
    // nothing ran. No steps execute, no side effects. Part 2 §21 (amended):
    // zero steps completed = the run never actually started — the acceptance
    // fee (if this caller charged one and opted into auto-refund) is released.
    if (!stepLoad.ok) {
      if (options?.neverStartedAutoRefund) {
        await refundNeverStartedWorkflowExecutionFee({
          userId,
          workflowId,
          executionId,
          reason: stepLoad.error,
        }).catch(() => {
          // Ledger idempotency (`wfexec-neverstarted:<executionId>`) makes a
          // later retry of this reconciliation safe.
        });
      }
      await logWorkflowEvent(userId, 'workflow_failed', {
        workflowId,
        executionId,
        error: stepLoad.error,
      });
      await emitWorkflowEvent('workflow_failed', userId, {
        workflowId,
        executionId,
        error: stepLoad.error,
      });
      return { executionId, status: 'failed', error: stepLoad.error, stepsCompleted: 0 };
    }

    // Execute steps (async but we process them sequentially)
    // Default (awaitCompletion !== false): run inline so the synchronous
    // result reflects the true final status — this is the legacy contract
    // every existing caller (UI run, autopilot runner, resume/retry) relies on.
    const runOptions: RunOptions = {
      timeoutMs,
      maxRetries,
      startedAtMs,
      startStepIndex: 0,
      neverStartedAutoRefund: options?.neverStartedAutoRefund ?? false,
    };
    try {
      if (options?.awaitCompletion === false) {
        void runSteps(executionId, steps, userId, workflowId, triggerData, runOptions).catch((error) => {
          console.error('[WorkflowEngine] Background step execution error:', error);
        });
      } else {
        await runSteps(executionId, steps, userId, workflowId, triggerData, runOptions);
      }
    } catch (error) {
      console.error('[WorkflowEngine] Step execution error:', error);
    }

    // Log audit event
    await logWorkflowEvent(userId, 'workflow_executed', {
      workflowId,
      executionId,
      triggerType: workflow.triggerType,
    });

    // Emit realtime event
    await emitWorkflowEvent('workflow_started', userId, {
      workflowId,
      executionId,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
    });

    // Fetch final state
    const finalExecution = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { id: true, status: true, error: true, currentStep: true },
    });

    return {
      executionId,
      status: finalExecution?.status || 'failed',
      error: finalExecution?.error || undefined,
      stepsCompleted: finalExecution?.currentStep ?? undefined,
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to execute workflow:', error);
    return {
      executionId: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}

// ===== STEP RUNNER =====

/**
 * Write "skipped" log entries for steps that will never run (Phase 4.11 —
 * partial failure must be represented honestly: Step 3 FAILED means
 * Step 4 is NOT EXECUTED, not silently absent).
 */
async function logSkippedSteps(
  executionId: string,
  userId: string,
  steps: ValidatedStep[],
  fromIndex: number,
  reason: string
): Promise<void> {
  for (let j = fromIndex; j < steps.length; j++) {
    try {
      await db.workflowLog.create({
        data: {
          executionId,
          stepName: steps[j].name,
          stepType: steps[j].type,
          status: 'skipped',
          input: JSON.stringify(steps[j].config),
          error: reason,
          userId,
        },
      });
    } catch {
      // Logging must never mask the real failure
    }
  }
}

/**
 * Run one step attempt bounded by the remaining execution-timeout budget
 * (Phase 4.8). A step that hangs on an external call can no longer hold
 * the execution indefinitely: the attempt resolves as a timeout failure.
 */
async function runStepWithBudget(
  executionId: string,
  step: ValidatedStep,
  context: ActionContext,
  retryAttempt: number,
  remainingMs: number
): Promise<ProcessStepResult> {
  const budget = Math.max(1, remainingMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      processStep(executionId, step, context, retryAttempt),
      new Promise<ProcessStepResult>((_, reject) => {
        timer = setTimeout(() => reject(new Error('__wf_step_timeout__')), budget);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === '__wf_step_timeout__') {
      return {
        success: false,
        error: `Step "${step.name}" timed out after ${budget}ms (execution timeout budget)`,
        shouldContinue: false,
        durationMs: budget,
      };
    }
    return {
      success: false,
      error: message,
      shouldContinue: false,
      durationMs: 0,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runSteps(
  executionId: string,
  steps: ValidatedStep[],
  userId: string,
  workflowId: string,
  triggerData?: Record<string, unknown>,
  runOptions?: RunOptions
): Promise<void> {
  const previousOutputs: Record<string, unknown> = {};
  let shouldContinue = true;

  const timeoutMs = runOptions?.timeoutMs ?? defaultTimeoutMs();
  const maxRetries = runOptions?.maxRetries ?? defaultMaxRetries();
  const startedAtMs = runOptions?.startedAtMs ?? Date.now();
  // Global index of this segment's first step (fresh runs start at 0;
  // resume/retry segments start at the execution's currentStep). A failure
  // at global index `startStepIndex + i` means exactly `startStepIndex + i`
  // steps of the whole execution completed before it.
  const startStepIndex = runOptions?.startStepIndex ?? 0;
  const neverStartedAutoRefund = runOptions?.neverStartedAutoRefund ?? false;
  const rechargeOnStart = runOptions?.rechargeOnStart ?? false;

  // Workflow-level approval gate: loaded once so execute/resume/retry paths
  // all enforce the same "human approval before send" behavior.
  let requiresApproval = false;
  try {
    const wf = await db.workflowDefinition.findUnique({
      where: { id: workflowId },
      select: { requiresApproval: true },
    });
    requiresApproval = wf?.requiresApproval ?? false;
  } catch {
    requiresApproval = false;
  }

  for (let i = 0; i < steps.length && shouldContinue; i++) {
    const step = steps[i];

    // Phase 4.7 / 3.10 — honor mid-run cancellation and pause BEFORE each
    // step. A cancelled execution is never overwritten by a later
    // "completed" update; a paused execution stops here and resume
    // re-runs the remaining steps from currentStep.
    const liveStatus = await db.workflowExecution
      .findUnique({ where: { id: executionId }, select: { status: true } })
      .catch(() => null);
    if (liveStatus?.status === 'cancelled') return;
    if (liveStatus?.status === 'paused') return;

    // Update current step
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { currentStep: i },
    });

    // Phase 4.6 — per-step retries. Explicit opt-in via step config
    // `retries` (bounded by the execution's maxRetries); attempts are
    // persisted with retryAttempt and spaced with exponential backoff.
    // Default 0 retries: side-effecting steps are never blindly repeated.
    const retryBudget = stepRetryBudget(step.config, maxRetries);
    let attempt = 0;
    let result: ProcessStepResult;
    // Part 1 — classification of the last failure decides whether another
    // attempt is spent at all (only positively-identified transient errors:
    // 429/rate limits, 5xx, network, timeouts). It is carried out of the
    // loop so the failure handler can distinguish 'exhausted' from 'failed'.
    let lastClassification: StepErrorClassification | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const remaining = timeoutMs - (Date.now() - startedAtMs);

      // Phase 4.8 — the overall timeout budget is exhausted.
      if (remaining <= 0) {
        result = {
          success: false,
          error: `Execution timed out after ${timeoutMs}ms — stopped before step "${step.name}"`,
          shouldContinue: false,
          durationMs: 0,
          neverRan: true,
        };
        break;
      }

      result = await runStepWithBudget(
        executionId,
        step,
        {
          userId,
          workflowId,
          executionId,
          leadId: triggerData?.leadId as string | undefined,
          // Phase 26 — step identity for model-invocation idempotency keys.
          stepName: step.name,
          triggerData,
          previousOutputs,
          requiresApproval,
        },
        attempt,
        remaining
      );

      if (result.success || attempt >= retryBudget) break;

      // Part 1 — classify BEFORE spending another attempt. Validation /
      // auth / business failures fail honestly on the first attempt;
      // retrying them would only burn credits and duplicate work.
      lastClassification = classifyStepError(result.error);
      if (!lastClassification.retryable) break;

      // Between retry attempts: re-check cancellation / pause / budget so a
      // user cancelling mid-retry is respected immediately.
      const midStatus = await db.workflowExecution
        .findUnique({ where: { id: executionId }, select: { status: true } })
        .catch(() => null);
      if (midStatus?.status === 'cancelled' || midStatus?.status === 'paused') return;
      if (Date.now() - startedAtMs >= timeoutMs) {
        result = {
          success: false,
          error: `Execution timed out after ${timeoutMs}ms — stopped while retrying step "${step.name}"`,
          shouldContinue: false,
          durationMs: 0,
        };
        break;
      }

      // Part 1 — exponential backoff with FULL jitter (uniform within
      // [0, base·2^attempt], capped) so concurrent retries never re-align
      // into a synchronized stampede. A provider Retry-After hint (parsed
      // by the classifier, e.g. from a 429 body) is honored as the floor.
      await sleep(computeBackoffDelayMs(attempt, {
        retryAfterMs: lastClassification.retryAfterMs,
      }));
      attempt++;
    }

    // Store output
    if (result.output) {
      previousOutputs[step.id] = result.output;
    }

    // ── Part 2 §21 (amended) — actual-start re-charge ──
    // This step is the FIRST step of the whole execution and it just
    // completed: the run has now ACTUALLY started. If this execution's fee
    // was refunded when a prior attempt never started, it is re-charged
    // here — exactly once per execution (ledger idempotency on
    // `wfexec-started:<executionId>`), never once per retry attempt.
    if (rechargeOnStart && startStepIndex + i === 0 && result.success) {
      const recharge = await rechargeWorkflowExecutionFeeOnStart({
        userId,
        workflowId,
        executionId,
      }).catch((error) => {
        console.error('[WorkflowEngine] Actual-start fee re-charge failed:', error);
        return null;
      });
      // An insufficient balance at this instant cannot abort a run that has
      // already started (killing it would waste the completed work); the
      // failure is logged and visible on the ledger, never silently ignored.
      if (recharge && !recharge.ok) {
        console.error(
          '[WorkflowEngine] Actual-start fee re-charge rejected (insufficient credits):',
          `fee=${recharge.fee} balance=${recharge.balance}`
        );
      }
    }

    // Handle delay steps
    if (step.type === 'delay' || step.type === 'wait_delay') {
      const delayMs = result.output?.delayMs as number | undefined;
      if (delayMs && delayMs > 0 && delayMs <= 86400000) {
        // For short delays (< 24h), sleep inline
        // For longer delays, this should be handled by a queue
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 60000)));
      }
    }

    // Handle conditional branch — may skip subsequent steps
    if (step.type === 'condition' || step.type === 'conditional_branch') {
      const branch = result.output?.branch as string | undefined;
      if (branch === 'false' || branch === 'skip') {
        // Skip the next step if condition is false
        // (Simple linear branch model)
        i++; // Skip next step
      }
    }

    if (!result.success) {
      // Part 1 — classify the TERMINAL failure fresh from result.error (the
      // loop's classification decided retry attempts only; result always
      // carries the final attempt's outcome, so this is never stale).
      const classification = classifyStepError(result.error);
      const retryableFailure = classification.retryable;

      // Retry accounting read BEFORE the terminal write (the notification
      // and logs below never touch this row's retry fields).
      const execution = await db.workflowExecution.findUnique({
        where: { id: executionId },
        select: { retryCount: true, maxRetries: true },
      });
      const budgetSpent =
        !execution || execution.retryCount >= (execution.maxRetries ?? maxRetries);

      // Part 1 — 'exhausted' is a DISTINCT terminal state: a retryable
      // failure that burned its entire retry budget. A non-retryable
      // failure is a plain honest 'failed' (retrying it would be waste).
      const terminalStatus: string = retryableFailure && budgetSpent
        ? 'exhausted'
        : 'failed';

      // Mark execution as failed/exhausted
      await db.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: terminalStatus,
          error: result.error || 'Step execution failed',
          completedAt: new Date(),
        },
      });

      // ── Part 2 §21 (amended) — never-started fee release ──
      // The failing step is the FIRST step of the whole execution and ZERO
      // steps completed before it: the run never ACTUALLY started (the
      // canonical case is a pre-start webhook/network/provider failure —
      // "Webhook call failed: fetch failed" — where the user receives no
      // work product). The acceptance-time fee is released now, atomically
      // and idempotently (`wfexec-neverstarted:<executionId>`), so a failed
      // pre-start run costs 0 credits and duplicate failure callbacks can
      // never double-refund. A run that failed AFTER completing at least one
      // step keeps its fee — the original Part 2 rule, preserved below.
      if (neverStartedAutoRefund && startStepIndex + i === 0) {
        await refundNeverStartedWorkflowExecutionFee({
          userId,
          workflowId,
          executionId,
          reason: result.error,
        }).catch(() => {
          // A refund failure must not mask the run's real outcome; the
          // ledger's idempotency key makes a later retry safe.
        });
      }

      // Phase 4.11 — the steps after the failure are NOT EXECUTED; persist
      // that explicitly so the execution history is honest. A step that was
      // never attempted (budget exhausted before it started) is itself
      // logged as skipped.
      await logSkippedSteps(
        executionId,
        userId,
        steps,
        result.neverRan ? i : i + 1,
        result.neverRan
          ? `Not executed — ${result.error}`
          : `Not executed — workflow stopped at step "${step.name}"`
      );

      // User-facing notification (safe message — raw errors stay in the
      // execution record, never in the notification text).
      await createNotificationOnce({
        userId,
        type: 'workflow_failed',
        title: 'Workflow execution failed',
        message: `A workflow run stopped at step "${step.name || 'unknown'}" and could not continue. You can retry it from the Workflows page.`,
        actionUrl: '/business-ai/workflows',
        metadata: { workflowId, executionId, failedStep: step.name },
        dedupeKey: `wfexec:${executionId}:failed`,
      }).catch(() => {
        // Never fail the execution path because of a notification problem
      });

      await logWorkflowEvent(userId, 'workflow_failed', {
        workflowId,
        executionId,
        failedStep: step.name,
        error: result.error,
      });

      // Emit realtime event
      await emitWorkflowEvent('workflow_failed', userId, {
        workflowId,
        executionId,
        failedStep: step.name,
        error: result.error,
      });

      // Retry accounting (Part 1): only RETRYABLE failures consume retry
      // budget and can dead-letter. A permanent failure has nothing to
      // retry — it fails once, honestly, with no background re-runs.
      if (retryableFailure && execution && execution.retryCount < execution.maxRetries) {
        await db.workflowExecution.update({
          where: { id: executionId },
          data: { retryCount: { increment: 1 } },
        });
      } else if (retryableFailure) {
        // Max retries exceeded — dead letter
        await sendToDeadLetter(executionId, `Max retries exceeded. Last error: ${result.error || 'Unknown'}`);
      }

      return;
    }

    shouldContinue = result.shouldContinue;
  }

  // Mark execution as completed — but never overwrite a terminal state a
  // user/system set while the final steps were running (Phase 4.7).
  if (shouldContinue) {
    const finalStatus = await db.workflowExecution
      .findUnique({ where: { id: executionId }, select: { status: true } })
      .catch(() => null);
    if (finalStatus?.status === 'cancelled' || finalStatus?.status === 'paused') return;

    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        currentStep: steps.length,
      },
    });

    // User-facing notification (deduped per execution — replay/retry of the
    // same execution id will not create a second notification).
    await createNotificationOnce({
      userId,
      type: 'workflow_completed',
      title: 'Workflow completed',
      message: `A workflow run finished successfully — all ${steps.length} step${steps.length === 1 ? '' : 's'} completed.`,
      actionUrl: '/business-ai/workflows',
      metadata: { workflowId, executionId, totalSteps: steps.length },
      dedupeKey: `wfexec:${executionId}:completed`,
    }).catch(() => {
      // Never fail the execution path because of a notification problem
    });

    // Emit realtime completion event
    await emitWorkflowEvent('workflow_completed', userId, {
      workflowId,
      executionId,
      totalSteps: steps.length,
    });
  }
}

// ===== PROCESS SINGLE STEP =====

export async function processStep(
  executionId: string,
  step: ValidatedStep,
  context: ActionContext,
  retryAttempt = 0,
  /** Multi-lead batch runs tag each step log with the lead it executed
   * for, so one execution's logs stay attributable per lead. Additive and
   * optional — every existing caller's log shape is unchanged. */
  leadLogContext?: { leadId?: string; leadName?: string }
): Promise<ProcessStepResult> {
  const startTime = Date.now();

  try {
    let result: ActionResult;

    // The action type rides in config.actionType; fall back to step.type for
    // legacy steps that stored the action type directly.
    const actionType = String(step.config?.actionType || step.type);

    // ── Part 2 — NO per-step, per-lead, or per-retry charging ──
    // Workflow execution billing is a FLAT fee (5 credits) charged exactly
    // once per accepted run at the run-acceptance boundary (execute route,
    // trigger scheduler, Autopilot runner — all through the central
    // chargeWorkflowExecutionFee path). Steps, leads, AI calls, retries,
    // resumes, and queue replays never touch the balance from here. The
    // approval-gated send path also no longer needs a charge carve-out:
    // the flat fee covers the run whether a send parks a draft or delivers.
    // Daily outreach quotas are enforced inside the send actions themselves.

    // Execute the action.
    // WorkflowStep.type stores the NODE type ('action' | 'delay' | 'condition' | 'ai_action'),
    // while executeAction dispatches on the ACTION type ('send_email' | 'wait_delay' | ...).
    // The action type always rides in config.actionType; fall back to step.type for
    // legacy steps that stored the action type directly.
    result = await executeAction(actionType, step.config, context);

    const durationMs = Date.now() - startTime;

    // Create workflow log entry
    await db.workflowLog.create({
      data: {
        executionId,
        stepName: step.name,
        stepType: step.type,
        status: result.success ? 'success' : 'failed',
        input: leadLogContext
          ? JSON.stringify({ ...step.config, __lead: leadLogContext })
          : JSON.stringify(step.config),
        output: result.output ? JSON.stringify(result.output) : null,
        error: result.error || null,
        durationMs,
        retryAttempt,
        userId: context.userId,
      },
    });

    // Emit step event
    await emitWorkflowEvent(
      result.success ? 'workflow_step_completed' : 'workflow_step_failed',
      context.userId,
      {
        executionId,
        stepName: step.name,
        stepType: step.type,
        durationMs,
        error: result.error,
      }
    );

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      shouldContinue: result.success,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    await db.workflowLog.create({
      data: {
        executionId,
        stepName: step.name,
        stepType: step.type,
        status: 'failed',
        input: leadLogContext
          ? JSON.stringify({ ...step.config, __lead: leadLogContext })
          : JSON.stringify(step.config),
        error: error instanceof Error ? error.message : 'Step execution failed',
        durationMs,
        retryAttempt,
        userId: context.userId,
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Step execution failed',
      shouldContinue: false,
      durationMs,
    };
  }
}

// ===== PAUSE EXECUTION =====

export async function pauseExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (execution.status !== 'running') {
      return { success: false, error: `Cannot pause execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'paused', pausedAt: new Date() },
    });

    await logWorkflowEvent(userId, 'workflow_paused', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_paused', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause execution',
    };
  }
}

// ===== RESUME EXECUTION =====

export async function resumeExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (execution.status !== 'paused') {
      return { success: false, error: `Cannot resume execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'running', resumedAt: new Date() },
    });

    // Re-run remaining steps — resolved through the SAME shared loader the
    // engine uses (WorkflowStep rows, then nodes JSON), so nodes-based
    // (legacy/autopilot) definitions resume correctly instead of silently
    // "completing" with zero steps.
    const workflow = await db.workflowDefinition.findUnique({
      where: { id: execution.workflowId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (workflow) {
      const stepLoad = loadStepsForExecution(workflow.workflowSteps, workflow.nodes);
      const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : undefined;

      if (!stepLoad.ok) {
        // The definition became invalid after this execution started — fail
        // honestly instead of running nothing.
        await db.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'failed', error: stepLoad.error, completedAt: new Date() },
        });
        return { success: false, error: stepLoad.error };
      }

      const remainingSteps = stepLoad.steps.slice(execution.currentStep);

      await runSteps(executionId, remainingSteps, userId, execution.workflowId, triggerData, {
        timeoutMs: execution.timeoutMs ?? defaultTimeoutMs(),
        maxRetries: execution.maxRetries ?? defaultMaxRetries(),
        // Resume restarts the timeout budget for the remaining work.
        startedAtMs: Date.now(),
        // The segment starts at the execution's current step; if the resumed
        // segment then fails with the whole execution still at ZERO completed
        // steps, the run never actually started and its fee is released
        // (Part 2 §21 amended — never-started runs are free).
        startStepIndex: execution.currentStep,
        neverStartedAutoRefund: true,
      });
    }

    await logWorkflowEvent(userId, 'workflow_resumed', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_resumed', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume execution',
    };
  }
}

// ===== CANCEL EXECUTION =====

export async function cancelExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    // 'discovering' runs (the missing-niche discovery bridge) are also
    // cancellable: the background continuation polls the execution status
    // before charging or creating lead items, so a cancelled run stops
    // before any step executes (and costs nothing).
    if (!['running', 'paused', 'discovering'].includes(execution.status)) {
      return { success: false, error: `Cannot cancel execution in '${execution.status}' status` };
    }

    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'cancelled', completedAt: new Date() },
    });

    await logWorkflowEvent(userId, 'workflow_cancelled', { executionId });

    // Emit realtime event
    await emitWorkflowEvent('workflow_cancelled', userId, { executionId });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel execution',
    };
  }
}

// ===== RETRY EXECUTION =====

export async function retryExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: { workflow: { select: { userId: true, id: true } } },
    });

    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.workflow.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (!['failed', 'cancelled', 'exhausted'].includes(execution.status)) {
      return { success: false, error: `Cannot retry execution in '${execution.status}' status` };
    }

    // ── Part 2 §21 (amended) — never-started fee reconciliation ──
    // If THIS execution's fee was refunded because the original run never
    // started (zero steps completed), a retry that ACTUALLY starts re-incurs
    // the flat fee — charged the moment its first step completes, exactly
    // once per execution (`wfexec-started:<executionId>`), never per attempt.
    // Until execution actually starts, the retry stays free (test rule 3).
    // Batch members reconcile through their shared run batch id (the batch
    // refund row references it), so any sibling execution finds it too.
    let rechargeOnStart = false;
    if (execution.currentStep === 0) {
      const refundRefs: string[] = [execution.id];
      try {
        const parsed = execution.triggerData ? (JSON.parse(execution.triggerData) as Record<string, unknown>) : {};
        const target = (parsed.target && typeof parsed.target === 'object' ? parsed.target : {}) as Record<string, unknown>;
        if (typeof target.runBatchId === 'string') refundRefs.push(target.runBatchId);
        if (typeof parsed.runBatchId === 'string') refundRefs.push(parsed.runBatchId);
      } catch {
        // Unparseable triggerData never blocks a retry — the execution id
        // reference above still covers sole-scope refunds.
      }
      if (await wasNeverStartedFeeRefunded(userId, refundRefs)) {
        const feeCheck = await checkWorkflowExecutionFeeSufficiency(userId);
        if (!feeCheck.sufficient) {
          // Same Part 2 §11 honesty as the execute route: reject the retry
          // BEFORE anything re-runs — nothing is charged, nothing executed.
          return {
            success: false,
            error:
              `Insufficient credits to retry this workflow — the ${feeCheck.fee}-credit execution fee applies once the run actually starts, ` +
              `and this account has ${feeCheck.balance}. Top up credits, then retry.`,
          };
        }
        rechargeOnStart = true;
      }
    }

    // Re-execute from the failed step — resolved through the SAME shared
    // loader the engine uses so nodes-based definitions retry correctly.
    const workflow = await db.workflowDefinition.findUnique({
      where: { id: execution.workflowId },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const stepLoad = loadStepsForExecution(workflow.workflowSteps, workflow.nodes);
    if (!stepLoad.ok) {
      // The definition became invalid — the retry fails honestly instead of
      // re-running a broken payload.
      await db.workflowExecution.update({
        where: { id: executionId },
        data: { status: 'failed', error: stepLoad.error, completedAt: new Date() },
      });
      return { success: false, error: stepLoad.error };
    }

    // Reset execution state — atomic status claim.
    // The updateMany filter (`status in retryable`) guarantees only ONE
    // concurrent retry call wins the claim: the first call flips status to
    // 'running', so the second call's filter no longer matches and its
    // count is 0. This prevents duplicate runSteps invocations from
    // concurrent retry requests.
    const claim = await db.workflowExecution.updateMany({
      where: { id: executionId, status: { in: ['failed', 'cancelled', 'exhausted'] } },
      data: {
        status: 'running',
        error: null,
        completedAt: null,
        retryCount: { increment: 1 },
      },
    });
    if (claim.count === 0) {
      // Another concurrent retry already claimed this execution, or the
      // status changed between our initial read and the claim. Report the
      // current status precisely instead of double-running.
      const fresh = await db.workflowExecution.findUnique({
        where: { id: executionId },
        select: { status: true },
      });
      return {
        success: false,
        error: fresh
          ? `Cannot retry execution — another retry is in progress or status is '${fresh.status}'`
          : 'Execution not found',
      };
    }

    const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : undefined;
    const remainingSteps = stepLoad.steps.slice(execution.currentStep);

    await runSteps(executionId, remainingSteps, userId, execution.workflowId, triggerData, {
      timeoutMs: execution.timeoutMs ?? defaultTimeoutMs(),
      maxRetries: execution.maxRetries ?? defaultMaxRetries(),
      // Retry restarts the timeout budget for the re-run work.
      startedAtMs: Date.now(),
      // The re-run starts at the execution's current step. If the retry
      // itself fails before ANY step of the whole execution completes, the
      // never-started release below fires again — the ledger idempotency
      // key (`wfexec-neverstarted:<executionId>`) makes it a no-op when the
      // refund was already applied, so repeated pre-start failures stay at
      // a NET 0 cost, and an actual start re-charges exactly once.
      startStepIndex: execution.currentStep,
      neverStartedAutoRefund: true,
      rechargeOnStart,
    });

    await logWorkflowEvent(userId, 'workflow_retried', {
      executionId,
      workflowId: execution.workflowId,
    });

    // Emit realtime event
    await emitWorkflowEvent('workflow_retried', userId, {
      executionId,
      workflowId: execution.workflowId,
    });

    return { success: true, executionId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry execution',
    };
  }
}

// ===== EXECUTION HISTORY =====

export async function getExecutionHistory(
  userId: string,
  filters?: {
    status?: string;
    workflowId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    /** Server-side search (workflow name or run error text). */
    search?: string;
  }
): Promise<{ executions: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
  try {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(Math.max(1, filters?.limit || 20), 100);
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      workflow: { userId },
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.workflowId) where.workflowId = filters.workflowId;
    if (filters?.dateFrom || filters?.dateTo) {
      const startedAt: Record<string, Date> = {};
      if (filters?.dateFrom) startedAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) startedAt.lte = new Date(filters.dateTo);
      where.startedAt = startedAt;
    }
    // Server-side search: workflow name OR the run's recorded error text
    // (SQLite `contains` is ASCII-case-insensitive — same behavior the
    // leads list relies on). Composable with every other filter.
    if (filters?.search && filters.search.trim()) {
      const needle = filters.search.trim();
      where.OR = [
        { workflow: { name: { contains: needle } } },
        { error: { contains: needle } },
      ];
    }

    const [executions, total] = await Promise.all([
      db.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          workflow: { select: { name: true, triggerType: true } },
        },
      }),
      db.workflowExecution.count({ where }),
    ]);

    // One extra grouped query attaches the per-run lead summary (batch
    // executions) without N+1 — legacy single-lead rows simply omit it.
    const leadCounts = await getLeadCountsForExecutions(
      executions.map((e) => e.id)
    );

    return {
      executions: executions.map((e) => {
        const counts = leadCounts.get(e.id);
        return {
          id: e.id,
          workflowId: e.workflowId,
          workflowName: e.workflow.name,
          triggerType: e.workflow.triggerType,
          status: e.status,
          currentStep: e.currentStep,
          totalSteps: e.totalSteps,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          durationMs: e.durationMs ?? (e.completedAt ? e.completedAt.getTime() - e.startedAt.getTime() : null),
          error: e.error,
          retryCount: e.retryCount,
          deadLettered: e.deadLettered,
          deadLetterReason: e.deadLetterReason,
          ...(counts && counts.total > 0
            ? {
                leadCount: counts.total,
                leadSummary: counts,
              }
            : {}),
        };
      }),
      total,
      page,
      totalPages: Math.max(0, Math.ceil(total / limit)),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution history:', error);
    return { executions: [], total: 0, page: 1, totalPages: 0 };
  }
}

// ===== EXECUTION DETAIL =====

export async function getExecutionDetail(
  executionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const execution = await db.workflowExecution.findFirst({
      where: { id: executionId },
      include: {
        workflow: { select: { name: true, triggerType: true, userId: true } },
        stepLogs: { orderBy: { createdAt: 'asc' } },
        leadItems: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!execution) return null;

    // Check ownership
    if (execution.workflow.userId !== userId) return null;

    return {
      id: execution.id,
      workflowId: execution.workflowId,
      workflowName: execution.workflow.name,
      triggerType: execution.workflow.triggerType,
      status: execution.status,
      currentStep: execution.currentStep,
      totalSteps: execution.totalSteps,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      durationMs: execution.durationMs ?? (execution.completedAt ? execution.completedAt.getTime() - execution.startedAt.getTime() : null),
      error: execution.error,
      retryCount: execution.retryCount,
      maxRetries: execution.maxRetries,
      timeoutMs: execution.timeoutMs,
      deadLettered: execution.deadLettered,
      deadLetterReason: execution.deadLetterReason,
      pausedAt: execution.pausedAt,
      resumedAt: execution.resumedAt,
      triggerData: execution.triggerData ? JSON.parse(execution.triggerData) : null,
      triggerEvent: execution.triggerEvent ? JSON.parse(execution.triggerEvent) : null,
      // Multi-lead batch runs: the per-lead child items (status, attempts,
      // error, per-step summary) — legacy single-lead rows carry an empty
      // array and their stepLogs remain the authoritative record.
      leadItems: (execution.leadItems ?? []).map((item) => ({
        id: item.id,
        leadId: item.leadId,
        leadName: item.leadName,
        niche: item.niche,
        status: item.status,
        attempts: item.attempts,
        error: item.error,
        stepSummary: item.stepSummary ? JSON.parse(item.stepSummary) : null,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        durationMs: item.durationMs,
      })),
      stepLogs: execution.stepLogs.map((log) => ({
        id: log.id,
        stepName: log.stepName,
        stepType: log.stepType,
        status: log.status,
        input: log.input ? JSON.parse(log.input) : null,
        output: log.output ? JSON.parse(log.output) : null,
        error: log.error,
        durationMs: log.durationMs,
        createdAt: log.createdAt,
      })),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution detail:', error);
    return null;
  }
}

// ===== EXECUTION METRICS =====

export async function getExecutionMetrics(
  userId: string
): Promise<Record<string, unknown>> {
  try {
    // Total executions
    const total = await db.workflowExecution.count({
      where: { workflow: { userId } },
    });

    // Success count
    const completed = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'completed' },
    });

    // Failed count
    const failed = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'failed' },
    });

    // Running count
    const running = await db.workflowExecution.count({
      where: { workflow: { userId }, status: 'running' },
    });

    // Dead lettered count
    const deadLettered = await db.workflowExecution.count({
      where: { workflow: { userId }, deadLettered: true },
    });

    // Success rate
    const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';

    // Average duration (for completed executions)
    const completedExecutions = await db.workflowExecution.findMany({
      where: { workflow: { userId }, status: 'completed', completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      take: 100,
    });

    const durations = completedExecutions
      .filter((e) => e.completedAt)
      .map((e) => e.completedAt!.getTime() - e.startedAt.getTime());

    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // By trigger type
    const byTriggerType = await db.workflowExecution.groupBy({
      by: ['workflowId'],
      where: { workflow: { userId } },
      _count: { id: true },
    });

    // By status
    const byStatus = await db.workflowExecution.groupBy({
      by: ['status'],
      where: { workflow: { userId } },
      _count: { id: true },
    });

    // This month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonth = await db.workflowExecution.count({
      where: { workflow: { userId }, startedAt: { gte: startOfMonth } },
    });

    return {
      total,
      completed,
      failed,
      running,
      deadLettered,
      successRate: `${successRate}%`,
      avgDurationMs,
      avgDurationFormatted: formatDuration(avgDurationMs),
      thisMonth,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
      byTriggerType: byTriggerType.map((t) => ({ workflowId: t.workflowId, count: t._count.id })),
    };
  } catch (error) {
    console.error('[WorkflowEngine] Failed to get execution metrics:', error);
    return {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      deadLettered: 0,
      successRate: '0%',
      avgDurationMs: 0,
      thisMonth: 0,
    };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
