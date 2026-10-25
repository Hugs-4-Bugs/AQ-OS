// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Multi-Lead Workflow Execution (batch model)
//
// ONE workflow run over N leads = ONE WorkflowExecution row. The lead set
// (explicitly selected, resolved from a niche, or discovered) is tracked as
// child WorkflowExecutionLead rows with per-lead status
// `pending → running → completed / failed / skipped`.
//
// Design rules (multi-lead execution task, Oct 2026):
//   • The executions list represents WORKFLOW RUNS, never individual leads.
//   • Per-lead isolation: one lead's failure marks THAT lead failed and the
//     run continues with the remaining leads (status 'partial' when some
//     succeeded).
//   • Billing is unchanged: flat 5 credits per successful run — never per
//     lead, per step, or per retry. A run that fails before ANY step
//     completes costs 0 (never-started refund, same ledger keys as the
//     single-lead engine).
//   • Rate-limit friendly: leads are processed SEQUENTIALLY with pacing
//     (a batch is exactly the situation where concurrent provider calls
//     caused 429 storms), and every step attempt rides the same
//     classify/backoff/timeout semantics as the single-lead engine.
//   • Reuse, not duplication: step dispatch is the engine's own processStep
//     (executeAction), validation is loadStepsForExecution, retry taxonomy
//     is workflow-retry.ts, billing is workflow-credits.ts. The legacy
//     single-lead runSteps path is untouched.
//   • Both the manual execute route AND Autopilot call THIS coordinator —
//     one execution engine for every entry point.
// ═══════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { db } from '@/lib/db';
import { processStep } from '@/lib/workflow-engine';
import { loadStepsForExecution, type ValidatedStep } from '@/lib/workflow-validation';
import {
  classifyStepError,
  computeBackoffDelayMs,
} from '@/lib/workflow-retry';
import {
  checkExecutionLimit,
  chargeWorkflowExecutionFee,
  refundNeverStartedWorkflowExecutionFee,
  rechargeWorkflowExecutionFeeOnStart,
  wasNeverStartedFeeRefunded,
  checkWorkflowExecutionFeeSufficiency,
  type WorkflowChargeSource,
} from '@/lib/workflow-credits';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { publishEvent } from '@/lib/realtime-event-bus';
import { createNotificationOnce } from '@/lib/notification-service';
import { resolveNicheLeads, maxTargetLeads, type ResolvedTargetLead } from '@/lib/workflow-targeting';
import { getLeadCounts, type LeadCounts } from '@/lib/workflow-execution-leads';
import { startDiscoveryJob } from '@/lib/lead-discovery-service';
import {
  resolveBusinessProfileForUser,
  buildLeadIntelligence,
  loadLeadFacts,
  type ProfileResolution,
} from '@/lib/lead-intelligence';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ===== ENV-TUNABLE KNOBS =====

function defaultTimeoutMs(): number {
  return Number(process.env.WORKFLOW_TIMEOUT) || 300000;
}
function defaultMaxRetries(): number {
  return Number(process.env.WORKFLOW_MAX_RETRIES) || 3;
}
/** Pacing between leads — the sequential batch's provider protection. */
function leadPacingMs(): number {
  const v = Number(process.env.WORKFLOW_LEAD_PACING_MS);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 500;
}
/** Extra cooldown before the NEXT lead after one failed while the provider
 * was rate-limited — the batch never hammers a provider that just refused
 * requests (mirrors the discovery pacer's philosophy; bounded per lead). */
function rateLimitCooldownMs(): number {
  const v = Number(process.env.WORKFLOW_RATE_LIMIT_COOLDOWN_MS);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 15000;
}
/** Max leads one discovery-bridged run will import and process. */
function discoveryMaxResults(): number {
  const v = Number(process.env.WORKFLOW_DISCOVERY_MAX_RESULTS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 25;
}
function discoveryPollIntervalMs(): number {
  const v = Number(process.env.WORKFLOW_DISCOVERY_POLL_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 3000;
}
function discoveryTimeoutMs(): number {
  const v = Number(process.env.WORKFLOW_DISCOVERY_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 900000; // 15 min
}

// ===== TYPES =====

export interface BatchLead {
  id: string;
  businessName: string;
  niche?: string | null;
}

export interface ExecuteWorkflowBatchOptions {
  /** The full lead set of this run (already resolved + owner-scoped). */
  leads: BatchLead[];
  /** Request-level target snapshot persisted on the execution (mode,
   * runBatchId, niche / selectedLeadIds / customTarget, leadCount…). */
  targetSnapshot: Record<string, unknown>;
  /** Stable run identity — replays collapse onto the SAME execution. */
  idempotencyKey?: string;
  /** false → the batch runs in the background (route responds immediately). */
  awaitCompletion?: boolean;
  /** Sole-scope charge covers this execution: auto-release the fee when the
   * run terminates with zero steps completed (same contract as the legacy
   * single-lead engine option). */
  neverStartedAutoRefund?: boolean;
  /** Phase 17 — explicitly supplied execution settings (HIGHEST precedence
   * tier). Accepted from the execute request body: { profileId?, tone?,
   * language?, cta?, channel?, style? }. Overrides the workflow's own
   * profile and any business-profile defaults. */
  executionSettings?: Record<string, unknown>;
  /** Phase 20 — per-lead profile resolutions (leadId → pre-resolved
   * ProfileResolution). Autopilot passes the resolution of the niche that
   * produced each lead so per-lead personalization honors the niche →
   * Business Profile mapping. PURELY ADDITIVE: when absent (every existing
   * caller), each lead uses the run-level resolvedProfile — behavior is
   * byte-identical to pre-Phase-20. */
  profileResolutionsByLeadId?: Record<string, ProfileResolution>;
}

export interface BatchExecutionResult {
  executionId: string;
  status: string;
  error?: string;
  leadCount: number;
  /** Step-units completed across the whole run (0 = never actually started). */
  stepsCompleted: number;
}

interface BatchRunOptions {
  timeoutMs: number;
  maxRetries: number;
  leadPacingMs: number;
  neverStartedAutoRefund: boolean;
  rechargeOnStart: boolean;
  /** Step-units completed by EARLIER segments of this execution (retry/resume). */
  startStepsCompleted: number;
  /** Wall-clock start of this segment (duration reporting). */
  startedAtMs: number;
  /** Phase 16/17 — per-lead personalization inputs: the run's resolved
   * business profile (precedence: execution setting > workflow > default)
   * and the explicit execution settings tier. */
  resolvedProfile?: ProfileResolution;
  executionSettings?: Record<string, unknown>;
  /** Phase 20 — optional per-lead profile resolutions (leadId-keyed). */
  profileResolutionsByLeadId?: Record<string, ProfileResolution>;
}

interface LeadStepOutcome {
  i: number;
  name: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
}

// ===== SMALL HELPERS (engine-local equivalents) =====

/** Per-step retry policy: explicit opt-in via config.retries, bounded by the
 * execution's maxRetries (identical semantics to the engine's private
 * stepRetryBudget). Default 0 — side-effecting steps never blindly repeat;
 * pure 429s are retried INSIDE the AI action wrapper instead. */
function stepRetryBudget(config: Record<string, unknown>, maxRetries: number): number {
  const raw = Number(config?.retries);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), Math.max(0, maxRetries));
}

async function emitWorkflowEvent(
  eventType: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await publishEvent({ channel: 'workflow_events', eventType, payload, userId });
  } catch {
    // Non-blocking: don't fail execution if event bus fails
  }
}

/** Parse a lead item's persisted stepSummary (resume/retry progress). */
function parseStepSummary(raw: string | null | undefined): LeadStepOutcome[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LeadStepOutcome[]) : [];
  } catch {
    return [];
  }
}

/** Index of the last SUCCESS step in a lead's summary (−1 = start at 0). */
function lastCompletedStepIndex(outcomes: LeadStepOutcome[]): number {
  let last = -1;
  for (const o of outcomes) {
    if (o.status === 'success' && o.i > last) last = o.i;
  }
  return last;
}

// ===== ZAI PROVIDER CONFIG CHECK (discovery pre-flight) =====

/** Is the Z-ai provider (web search + LLM extraction, used by the discovery
 * pipeline) configured? The SDK resolves its config from .z-ai-config files
 * (cwd, home, /etc) — NOT env vars. Discovery without it cannot produce
 * REAL results, so the run is refused with an actionable message instead
 * of silently failing mid-flight. */
export function isZaiProviderConfigured(): boolean {
  const candidates = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];
  for (const filePath of candidates) {
    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        baseUrl?: unknown;
        apiKey?: unknown;
      };
      if (typeof config.baseUrl === 'string' && config.baseUrl && typeof config.apiKey === 'string' && config.apiKey) {
        return true;
      }
    } catch {
      // absent or invalid — keep checking
    }
  }
  return false;
}

// ===== MAIN ENTRY POINT =====

/**
 * Execute one workflow over a lead set as ONE WorkflowExecution.
 *
 * Creates the single execution row + one WorkflowExecutionLead child per
 * lead, then processes leads sequentially with per-lead isolation. The
 * response contract mirrors executeWorkflow (executionId + status +
 * stepsCompleted) so route/UI code can treat both paths uniformly.
 */
export async function executeWorkflowBatch(
  workflowId: string,
  userId: string,
  options: ExecuteWorkflowBatchOptions
): Promise<BatchExecutionResult> {
  const leads = options.leads;
  if (!Array.isArray(leads) || leads.length === 0) {
    return { executionId: '', status: 'failed', error: 'No leads to execute against', leadCount: 0, stepsCompleted: 0 };
  }

  try {
    const workflow = await db.workflowDefinition.findFirst({
      where: { id: workflowId, userId, status: { in: ['draft', 'active'] } },
      include: { workflowSteps: { orderBy: { order: 'asc' } } },
    });
    if (!workflow) {
      return { executionId: '', status: 'failed', error: 'Workflow not found or not active (drafts are executable for testing)', leadCount: leads.length, stepsCompleted: 0 };
    }

    // ONE run = ONE execution = ONE unit against the monthly execution
    // limit (a 100-lead batch is no longer 100 executions).
    const limitCheck = await checkExecutionLimit(userId);
    if (!limitCheck.allowed) {
      return {
        executionId: '',
        status: 'failed',
        error: `Monthly execution limit reached (${limitCheck.current}/${limitCheck.limit})`,
        leadCount: leads.length,
        stepsCompleted: 0,
      };
    }

    const stepLoad = loadStepsForExecution(workflow.workflowSteps, workflow.nodes);
    const steps: ValidatedStep[] = stepLoad.steps;

    // ── Phase 16/17 — per-lead personalization inputs (resolved ONCE per
    // run; owner-scoped; foreign/missing profiles fall through safely) ──
    // Precedence: explicit execution setting → workflow's own profile →
    // the user's deterministic default profile.
    const explicitProfileIdRaw = options.executionSettings?.profileId;
    const explicitProfileId =
      typeof explicitProfileIdRaw === 'string' && explicitProfileIdRaw.trim()
        ? explicitProfileIdRaw.trim()
        : null;
    const profileResolution = await resolveBusinessProfileForUser(userId, {
      explicitProfileId,
      workflowProfileId: workflow.profileId ?? null,
    }).catch(() => ({ profile: null, source: 'none' as const }));

    // Idempotency: a replay of the same run identity returns the SAME
    // execution — never a second history row, never a second charge scope.
    let existingExecution: { id: string; status: string; currentStep: number } | null = null;
    let createdExecution: { id: string } | null = null;

    const createExecutionRecord = async (client: typeof db): Promise<void> => {
      if (options.idempotencyKey) {
        const found = await client.workflowExecution.findFirst({
          where: { idempotencyKey: options.idempotencyKey, workflowId },
          select: { id: true, status: true, currentStep: true },
        });
        if (found) {
          existingExecution = found;
          return;
        }
      }
      createdExecution = await client.workflowExecution.create({
        data: {
          workflowId,
          userId,
          status: stepLoad.ok ? 'running' : 'failed',
          triggerData: JSON.stringify({
            ...options.targetSnapshot,
            leadIds: leads.map((l) => l.id),
            leadCount: leads.length,
            workflowSnapshot: {
              name: workflow.name,
              triggerType: workflow.triggerType,
              requiresApproval: workflow.requiresApproval,
              profileId: workflow.profileId ?? null,
              stepCount: steps.length,
              snapshottedAt: new Date().toISOString(),
            },
            // Phase 16/17 — the personalization configuration this run uses
            // (profile precedence resolution + snapshot; historical runs
            // never rewrite when the profile is later edited).
            intelligenceConfig: {
              profileId: profileResolution.profile?.id ?? null,
              profileName: profileResolution.profile?.name ?? null,
              profileSource: profileResolution.source,
              executionSettings: options.executionSettings ?? null,
              snapshottedAt: new Date().toISOString(),
            },
          }),
          triggerEvent: null,
          currentStep: 0,
          // Overall progress units: one per step per lead.
          totalSteps: steps.length * leads.length,
          idempotencyKey: options.idempotencyKey || null,
          maxRetries: defaultMaxRetries(),
          timeoutMs: defaultTimeoutMs(),
          ...(stepLoad.ok ? {} : { error: stepLoad.error, completedAt: new Date() }),
        },
      });
    };

    if (typeof (db as unknown as { $transaction?: unknown }).$transaction === 'function') {
      await (db as unknown as {
        $transaction: (fn: (tx?: typeof db) => Promise<void>) => Promise<void>;
      }).$transaction(async (tx) => createExecutionRecord((tx as typeof db) ?? db));
    } else {
      await createExecutionRecord(db);
    }

    const existingHit = existingExecution as { id: string; status: string; currentStep: number } | null;
    const createdHit = createdExecution as { id: string } | null;

    if (existingHit) {
      // Replay: report the persisted state of the SAME run.
      const leadCount = await countLeadItems(existingHit.id);
      return {
        executionId: existingHit.id,
        status: existingHit.status,
        leadCount,
        stepsCompleted: existingHit.currentStep ?? 0,
      };
    }
    if (!createdHit) {
      throw new Error('Failed to create execution record');
    }
    const executionId = createdHit.id;

    // Per-lead child rows — the run's item ledger.
    await createLeadItems(executionId, leads);

    // Invalid definition: honest failure, no steps, no side effects.
    if (!stepLoad.ok) {
      if (options.neverStartedAutoRefund) {
        await refundNeverStartedWorkflowExecutionFee({
          userId, workflowId, executionId, reason: stepLoad.error,
        }).catch(() => {});
      }
      await logWorkflowEvent(userId, 'workflow_failed', { workflowId, executionId, error: stepLoad.error });
      return { executionId, status: 'failed', error: stepLoad.error, leadCount: leads.length, stepsCompleted: 0 };
    }

    const runOptions: BatchRunOptions = {
      timeoutMs: defaultTimeoutMs(),
      maxRetries: defaultMaxRetries(),
      leadPacingMs: leadPacingMs(),
      neverStartedAutoRefund: options.neverStartedAutoRefund ?? false,
      rechargeOnStart: false,
      startStepsCompleted: 0,
      startedAtMs: Date.now(),
      resolvedProfile: profileResolution,
      executionSettings: options.executionSettings,
      // Phase 20 — per-lead resolutions pass through verbatim (absent for
      // every pre-existing caller → identical behavior).
      profileResolutionsByLeadId: options.profileResolutionsByLeadId,
    };

    try {
      if (options.awaitCompletion === false) {
        void runBatchSteps(executionId, workflowId, userId, runOptions).catch((error) => {
          console.error('[WorkflowBatch] Background batch execution error:', error);
        });
      } else {
        await runBatchSteps(executionId, workflowId, userId, runOptions);
      }
    } catch (error) {
      console.error('[WorkflowBatch] Batch execution error:', error);
    }

    await logWorkflowEvent(userId, 'workflow_executed', {
      workflowId, executionId, triggerType: workflow.triggerType, leadCount: leads.length,
    });
    await emitWorkflowEvent('workflow_started', userId, {
      workflowId, executionId, workflowName: workflow.name, leadCount: leads.length,
    });

    const finalExecution = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { id: true, status: true, error: true, currentStep: true },
    });

    return {
      executionId,
      status: finalExecution?.status || 'failed',
      error: finalExecution?.error || undefined,
      leadCount: leads.length,
      stepsCompleted: finalExecution?.currentStep ?? 0,
    };
  } catch (error) {
    console.error('[WorkflowBatch] Failed to execute workflow batch:', error);
    return {
      executionId: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Execution failed',
      leadCount: leads.length,
      stepsCompleted: 0,
    };
  }
}

/** Create the per-lead child rows (chunked; falls back to sequential creates
 * for test doubles without createMany). */
async function createLeadItems(executionId: string, leads: BatchLead[]): Promise<void> {
  const rows = leads.map((lead) => ({
    executionId,
    leadId: lead.id,
    leadName: lead.businessName,
    niche: lead.niche ?? null,
    status: 'pending',
  }));
  const CHUNK = 500;
  const createMany = (db.workflowExecutionLead as unknown as { createMany?: unknown }).createMany;
  if (typeof createMany === 'function') {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.workflowExecutionLead.createMany({ data: rows.slice(i, i + CHUNK) });
    }
    return;
  }
  for (const row of rows) {
    await db.workflowExecutionLead.create({ data: row });
  }
}

async function countLeadItems(executionId: string): Promise<number> {
  try {
    return await db.workflowExecutionLead.count({ where: { executionId } });
  } catch {
    return 0;
  }
}

// ===== BATCH STEP RUNNER =====

/**
 * Process every PENDING lead item of one execution, sequentially, with
 * per-lead isolation. One lead's failure/skip never touches another lead:
 * the item is marked and the loop continues.
 *
 * The per-lead step mechanics deliberately mirror the engine's runSteps:
 * same processStep dispatch (actions + WorkflowLog rows), same
 * classify-before-retry, same jittered backoff with Retry-After floor,
 * same timeout budget (per lead — each lead gets the budget a dedicated
 * execution would have), same linear condition-branch skip, same inline
 * delay cap.
 */
async function runBatchSteps(
  executionId: string,
  workflowId: string,
  userId: string,
  runOptions: BatchRunOptions
): Promise<void> {
  // Approval gate (same load as the engine's runSteps).
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

  const steps = await loadExecutionSteps(workflowId);
  const segmentStartedAtMs = runOptions.startedAtMs;

  const items = await db.workflowExecutionLead.findMany({
    where: { executionId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  let totalCompletedSteps = runOptions.startStepsCompleted;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: string | null = null;
  let lastRetryable = false;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];

    // Mid-run cancel/pause (checked between leads).
    const liveStatus = await db.workflowExecution
      .findUnique({ where: { id: executionId }, select: { status: true } })
      .catch(() => null);
    if (liveStatus?.status === 'cancelled' || liveStatus?.status === 'paused') break;

    const leadStartedAt = Date.now();
    const outcomes: LeadStepOutcome[] = [];
    await db.workflowExecutionLead.update({
      where: { id: item.id },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 }, stepSummary: null },
    });
    await emitWorkflowEvent('workflow_lead_started', userId, {
      executionId, leadId: item.leadId, leadName: item.leadName,
    });

    // ── Phase 16/20 — THIS lead's personalized intelligence, composed ONCE
    // before its steps run and reused by every step of this lead. The
    // run-level resolved profile rides in via runOptions (precedence:
    // execution setting > workflow > default); when the caller supplied a
    // per-lead resolution (Phase 20 niche→profile mapping), THIS lead uses
    // its own — same canonical ProfileResolution object type, so the
    // personalization chain itself is unchanged. Null on lookup failure —
    // personalization must never break execution.
    const leadFacts = item.leadId
      ? await loadLeadFacts(userId, item.leadId).catch(() => null)
      : null;
    const leadIntelligence = leadFacts
      ? await buildLeadIntelligence(
          userId,
          { ...leadFacts, businessName: leadFacts.businessName || item.leadName || 'Unknown' },
          {
            resolvedProfile:
              (item.leadId ? runOptions.profileResolutionsByLeadId?.[item.leadId] : undefined) ??
              runOptions.resolvedProfile,
          }
        ).catch(() => null)
      : null;

    // Retry/resume: this item may already carry partial progress.
    const priorOutcomes = parseStepSummary(item.stepSummary);
    const fromStep = lastCompletedStepIndex(priorOutcomes) + 1;
    outcomes.push(...priorOutcomes);

    const previousOutputs: Record<string, unknown> = {};
    let leadFailed = false;
    let leadError: string | null = null;
    let completedInThisLead = 0;
    let interruptedMidLead = false;
    let rateLimitedLead = false;

    for (let i = fromStep; i < steps.length; i++) {
      const step = steps[i];

      // Honor mid-run cancellation and pause BEFORE each step.
      const stepStatus = await db.workflowExecution
        .findUnique({ where: { id: executionId }, select: { status: true } })
        .catch(() => null);
      if (stepStatus?.status === 'cancelled' || stepStatus?.status === 'paused') {
        interruptedMidLead = true;
        break;
      }

      // Overall progress (step-units across the whole run).
      await db.workflowExecution.update({
        where: { id: executionId },
        data: { currentStep: totalCompletedSteps + completedInThisLead },
      }).catch(() => {});

      // Per-step attempts with the engine's retry semantics.
      const retryBudget = stepRetryBudget(step.config, runOptions.maxRetries);
      let attempt = 0;
      let result: Awaited<ReturnType<typeof processStep>> | null = null;
      let classification: ReturnType<typeof classifyStepError> | null = null;
      let interruptedMidRetry = false;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const remaining = runOptions.timeoutMs - (Date.now() - leadStartedAt);
        if (remaining <= 0) {
          result = {
            success: false,
            error: `Execution timed out after ${runOptions.timeoutMs}ms — stopped before step "${step.name}"`,
            shouldContinue: false,
            durationMs: 0,
            neverRan: true,
          };
          break;
        }

        result = await runStepWithBudget(executionId, step, {
          userId,
          workflowId,
          executionId,
          leadId: item.leadId ?? undefined,
          // Phase 26 — step identity for model-invocation idempotency keys.
          stepName: step.name,
          triggerData: { leadId: item.leadId, leadName: item.leadName },
          previousOutputs,
          requiresApproval,
          // Phase 16/17 — per-lead personalization + highest-precedence
          // execution settings ride the action context.
          leadIntelligence: leadIntelligence ?? undefined,
          executionSettings: runOptions.executionSettings,
        }, attempt, remaining, item);

        if (result.success || attempt >= retryBudget) break;

        classification = classifyStepError(result.error);
        if (!classification.retryable) break;

        const midStatus = await db.workflowExecution
          .findUnique({ where: { id: executionId }, select: { status: true } })
          .catch(() => null);
        if (midStatus?.status === 'cancelled' || midStatus?.status === 'paused') {
          interruptedMidRetry = true;
          break;
        }
        if (Date.now() - leadStartedAt >= runOptions.timeoutMs) {
          result = {
            success: false,
            error: `Execution timed out after ${runOptions.timeoutMs}ms — stopped while retrying step "${step.name}"`,
            shouldContinue: false,
            durationMs: 0,
          };
          break;
        }

        await sleep(computeBackoffDelayMs(attempt, {
          retryAfterMs: classification.retryAfterMs,
        }));
        attempt++;
      }

      if (interruptedMidRetry) {
        interruptedMidLead = true;
        break;
      }

      if (result.output) {
        previousOutputs[step.id] = result.output;
      }

      if (result.success) {
        completedInThisLead++;
        totalCompletedSteps++;
        outcomes.push({ i, name: step.name, status: 'success', durationMs: result.durationMs });

        // ── Actual-start re-charge (retry reconciliation) ──
        // The FIRST step of the WHOLE execution just completed and earlier
        // segments completed nothing: the run has now ACTUALLY started.
        if (runOptions.rechargeOnStart && totalCompletedSteps === 1) {
          const recharge = await rechargeWorkflowExecutionFeeOnStart({
            userId, workflowId, executionId,
          }).catch((error) => {
            console.error('[WorkflowBatch] Actual-start fee re-charge failed:', error);
            return null;
          });
          if (recharge && !recharge.ok) {
            console.error(
              '[WorkflowBatch] Actual-start fee re-charge rejected:',
              `fee=${recharge.fee} balance=${recharge.balance}`
            );
          }
        }

        // Delay steps sleep inline (same 60s cap as the engine).
        if (step.type === 'delay' || step.type === 'wait_delay') {
          const delayMs = result.output?.delayMs as number | undefined;
          if (delayMs && delayMs > 0 && delayMs <= 86400000) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 60000)));
          }
        }

        // Linear condition-branch model (same as the engine).
        if (step.type === 'condition' || step.type === 'conditional_branch') {
          const branch = result.output?.branch as string | undefined;
          if (branch === 'false' || branch === 'skip') {
            i++;
            const skippedStep = steps[i];
            if (skippedStep) {
              outcomes.push({ i, name: skippedStep.name, status: 'skipped', error: 'Skipped by condition branch' });
            }
          }
        }
      } else {
        // ── Per-lead isolation: THIS lead fails; the run continues. ──
        leadFailed = true;
        leadError = result.error || 'Step execution failed';
        lastError = leadError;
        const failureClass = classifyStepError(leadError);
        lastRetryable = failureClass.retryable;
        // The provider just refused requests (429/rate limit): give it a
        // real cooldown before the next lead instead of hammering it —
        // bounded, so a long outage never stalls the batch indefinitely.
        if (failureClass.kind === 'rate_limited') {
          rateLimitedLead = true;
        }
        outcomes.push({ i, name: step.name, status: 'failed', durationMs: result.durationMs, error: leadError });
        // Remaining steps of THIS lead are honestly logged as skipped.
        for (let j = i + 1; j < steps.length; j++) {
          outcomes.push({ i: j, name: steps[j].name, status: 'skipped', error: `Not executed — lead stopped at step "${step.name}"` });
        }
        break;
      }
    }

    const leadDurationMs = Date.now() - leadStartedAt;

    if (interruptedMidLead) {
      // Persist this lead's partial progress so a later resume continues
      // from its last completed step; the item stays 'running'.
      await db.workflowExecutionLead.update({
        where: { id: item.id },
        data: { stepSummary: JSON.stringify(outcomes) },
      }).catch(() => {});
      break;
    } else if (leadFailed) {
      failed++;
      await db.workflowExecutionLead.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          error: leadError,
          stepSummary: JSON.stringify(outcomes),
          completedAt: new Date(),
          durationMs: leadDurationMs,
        },
      });
    } else {
      // All steps of this lead completed (or were legitimately skipped by
      // its own condition branches).
      succeeded++;
      await db.workflowExecutionLead.update({
        where: { id: item.id },
        data: {
          status: 'completed',
          stepSummary: JSON.stringify(outcomes),
          completedAt: new Date(),
          durationMs: leadDurationMs,
        },
      });
    }

    await emitWorkflowEvent(
      leadFailed ? 'workflow_lead_failed' : 'workflow_lead_completed',
      userId,
      { executionId, leadId: item.leadId, leadName: item.leadName, error: leadError ?? undefined }
    );

    // Provider-friendly pacing between leads — plus a rate-limit cooldown
    // when the previous lead failed because the provider was limiting.
    if (itemIndex < items.length - 1) {
      if (rateLimitedLead && rateLimitCooldownMs() > 0) {
        await sleep(rateLimitCooldownMs());
      } else if (runOptions.leadPacingMs > 0) {
        await sleep(runOptions.leadPacingMs);
      }
    }
  }

  // Mark any never-started pending items when the run was interrupted.
  const finalStatus = await db.workflowExecution
    .findUnique({ where: { id: executionId }, select: { status: true } })
    .catch(() => null);
  if (finalStatus?.status === 'cancelled' || finalStatus?.status === 'paused') {
    await db.workflowExecutionLead.updateMany({
      where: { executionId, status: 'pending' },
      data: { status: 'skipped', error: finalStatus.status === 'cancelled' ? 'Skipped — execution cancelled' : 'Skipped — execution paused' },
    }).catch(() => {});
    return; // the cancel/pause path owns the execution row's status
  }

  // ── Terminal aggregation ──
  const totals = await getLeadCounts(executionId);
  succeeded = totals.completed;
  failed = totals.failed;
  skipped = totals.skipped;

  const processedAll = totals.pending === 0 && totals.running === 0;
  let terminal: 'completed' | 'partial' | 'failed' | 'exhausted';
  if (succeeded > 0 && (failed > 0 || skipped > 0)) {
    terminal = 'partial';
  } else if (succeeded > 0) {
    terminal = 'completed';
  } else if (processedAll && failed > 0) {
    // All leads failed — 'exhausted' when the last failure was retryable
    // (same distinct-state convention as the engine).
    terminal = lastRetryable ? 'exhausted' : 'failed';
  } else {
    terminal = 'failed';
  }

  const summaryError =
    terminal === 'completed'
      ? null
      : terminal === 'partial'
        ? `${failed} of ${totals.total} lead${totals.total === 1 ? '' : 's'} failed${skipped > 0 ? `, ${skipped} skipped` : ''}.${lastError ? ` Last error: ${lastError.slice(0, 300)}` : ''}`
        : lastError || (totals.total === 0 ? 'No leads to process' : 'All leads failed');

  // ── Never-started fee release (BEFORE the terminal write, so settle
  // observers only ever see a terminal row after the ledger reconciled) ──
  if (
    runOptions.neverStartedAutoRefund &&
    totalCompletedSteps === 0 &&
    (terminal === 'failed' || terminal === 'exhausted')
  ) {
    await refundNeverStartedWorkflowExecutionFee({
      userId, workflowId, executionId, reason: summaryError || undefined,
    }).catch(() => {
      // Ledger idempotency (`wfexec-neverstarted:<executionId>`) makes a
      // later reconciliation retry safe.
    });
  }

  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: terminal,
      error: summaryError,
      completedAt: new Date(),
      currentStep: totalCompletedSteps,
      durationMs: Date.now() - segmentStartedAtMs,
    },
  }).catch(() => {});

  await createNotificationOnce({
    userId,
    type: terminal === 'completed' ? 'workflow_completed' : terminal === 'partial' ? 'workflow_completed' : 'workflow_failed',
    title: terminal === 'completed' ? 'Workflow completed' : terminal === 'partial' ? 'Workflow partially completed' : 'Workflow execution failed',
    message:
      terminal === 'completed'
        ? `A workflow run finished successfully — ${totals.total} lead${totals.total === 1 ? '' : 's'} processed (${steps.length} step${steps.length === 1 ? '' : 's'} each).`
        : terminal === 'partial'
          ? `A workflow run processed ${succeeded}/${totals.total} lead${totals.total === 1 ? '' : 's'} successfully; ${failed} failed. Retry the failed leads from the Executions page.`
          : `A workflow run failed for all ${totals.total} targeted lead${totals.total === 1 ? '' : 's'}. You can retry it from the Workflows page.`,
    actionUrl: '/business-ai/workflows',
    metadata: { workflowId, executionId, leadCount: totals.total, succeeded, failed, skipped },
    dedupeKey: `wfexec:${executionId}:${terminal}`,
  }).catch(() => {});

  await logWorkflowEvent(userId, terminal === 'completed' ? 'workflow_completed' : 'workflow_failed', {
    workflowId, executionId, leadCount: totals.total, succeeded, failed, skipped, error: summaryError,
  });
  await emitWorkflowEvent(terminal === 'completed' ? 'workflow_completed' : 'workflow_failed', userId, {
    workflowId, executionId, leadCount: totals.total, succeeded, failed, skipped,
  });
}

/** Load the steps for an execution's workflow via the shared loader. */
async function loadExecutionSteps(workflowId: string): Promise<ValidatedStep[]> {
  const workflow = await db.workflowDefinition.findUnique({
    where: { id: workflowId },
    include: { workflowSteps: { orderBy: { order: 'asc' } } },
  });
  if (!workflow) return [];
  return loadStepsForExecution(workflow.workflowSteps, workflow.nodes).steps;
}

/** One step attempt bounded by the lead's remaining timeout budget. */
async function runStepWithBudget(
  executionId: string,
  step: ValidatedStep,
  context: Parameters<typeof processStep>[2],
  retryAttempt: number,
  remainingMs: number,
  item: { leadId?: string | null; leadName?: string | null }
): Promise<Awaited<ReturnType<typeof processStep>>> {
  const budget = Math.max(1, remainingMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      processStep(executionId, step, context, retryAttempt, {
        leadId: item.leadId ?? undefined,
        leadName: item.leadName ?? undefined,
      }),
      new Promise<Awaited<ReturnType<typeof processStep>>>((_, reject) => {
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

// ===== NICHE RUN WITH DISCOVERY (missing-niche bridge) =====
//
// A niche-targeted run whose niche currently matches ZERO of the caller's
// active leads does NOT simply fail. The existing Lead Discovery pipeline
// runs for that niche (real web search + LLM extraction + DB-level
// deduplication against existing leads), and the workflow then continues
// against the discovered leads — all inside the SAME single execution row:
//
//   discovering → running → completed / partial / failed
//
// Billing stays honest: the flat fee is charged ONLY after discovery
// actually produced eligible leads and the run is about to execute steps.
// A discovery that finds nothing, times out, or fails (e.g. missing
// provider configuration) costs 0 workflow-execution credits.

export interface NicheDiscoveryRunParams {
  workflowId: string;
  userId: string;
  niche: string;
  runKey: string;
  /** Verbatim request snapshot (mode, requestedNiches…). */
  targetSnapshot: Record<string, unknown>;
  /** Optional geographic targeting from the workflow's business profile. */
  geo?: { country?: string; city?: string };
  /** Discovery size cap (the caller's plan allowance, when bounded). */
  maxResults?: number;
  source?: WorkflowChargeSource;
}

export interface NicheDiscoveryRunStart {
  executionId: string;
  status: 'discovering';
  jobId?: string;
}

/** Start a niche run whose niche has no leads yet: creates the ONE
 * execution in 'discovering' state, kicks the background continuation,
 * and returns immediately (the HTTP request never blocks on discovery). */
export async function executeNicheRunWithDiscovery(
  params: NicheDiscoveryRunParams
): Promise<NicheDiscoveryRunStart> {
  const { workflowId, userId, niche, runKey, targetSnapshot } = params;

  let existingExecution: { id: string } | null = null;
  let createdExecution: { id: string } | null = null;
  const idempotencyKey = `batch_${runKey}`;

  const createExecutionRecord = async (client: typeof db): Promise<void> => {
    const found = await client.workflowExecution.findFirst({
      where: { idempotencyKey, workflowId },
      select: { id: true },
    });
    if (found) {
      existingExecution = found;
      return;
    }
    createdExecution = await client.workflowExecution.create({
      data: {
        workflowId,
        userId,
        status: 'discovering',
        triggerData: JSON.stringify({
          ...targetSnapshot,
          runBatchId: runKey,
          leadCount: 0,
          discovery: { phase: 'discovery', niche, status: 'pending' },
        }),
        currentStep: 0,
        totalSteps: 0,
        idempotencyKey,
      },
    });
  };

  if (typeof (db as unknown as { $transaction?: unknown }).$transaction === 'function') {
    await (db as unknown as {
      $transaction: (fn: (tx?: typeof db) => Promise<void>) => Promise<void>;
    }).$transaction(async (tx) => createExecutionRecord((tx as typeof db) ?? db));
  } else {
    await createExecutionRecord(db);
  }

  const executionId = (existingExecution ?? createdExecution)?.id;
  if (!executionId) {
    throw new Error('Failed to create discovery execution record');
  }

  // Background continuation — the response has already returned.
  void continueNicheDiscoveryRun({ ...params, executionId }).catch((error) => {
    console.error('[WorkflowBatch] Niche discovery continuation error:', error);
  });

  return { executionId, status: 'discovering' };
}

/** Update the discovery phase recorded on the execution's triggerData. */
async function updateDiscoveryPhase(
  executionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  try {
    const row = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { triggerData: true },
    });
    const parsed = row?.triggerData ? (JSON.parse(row.triggerData) as Record<string, unknown>) : {};
    const discovery = (parsed.discovery && typeof parsed.discovery === 'object'
      ? parsed.discovery
      : {}) as Record<string, unknown>;
    parsed.discovery = { ...discovery, ...patch };
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { triggerData: JSON.stringify(parsed) },
    });
  } catch {
    // Explainability metadata must never block the run itself.
  }
}

/** Terminal failure of a discovery-bridged run (0 credits — the fee was
 * never charged because no step ever executed). */
async function failDiscoveryRun(
  executionId: string,
  workflowId: string,
  userId: string,
  error: string,
  discoveryPatch: Record<string, unknown> = {}
): Promise<void> {
  await updateDiscoveryPhase(executionId, { status: 'failed', ...discoveryPatch });
  await db.workflowExecution.update({
    where: { id: executionId },
    data: { status: 'failed', error, completedAt: new Date() },
  }).catch(() => {});
  await createNotificationOnce({
    userId,
    type: 'workflow_failed',
    title: 'Workflow run failed',
    message: error.slice(0, 300),
    actionUrl: '/business-ai/workflows',
    metadata: { workflowId, executionId },
    dedupeKey: `wfexec:${executionId}:failed`,
  }).catch(() => {});
  await logWorkflowEvent(userId, 'workflow_failed', { workflowId, executionId, error });
  await emitWorkflowEvent('workflow_failed', userId, { workflowId, executionId, error });
}

/** Background: discovery → resolve/dedupe leads → charge → run the batch. */
async function continueNicheDiscoveryRun(
  params: NicheDiscoveryRunParams & { executionId: string }
): Promise<void> {
  const { workflowId, userId, niche, runKey, geo, executionId, source } = params;
  const maxResults = Math.max(1, params.maxResults ?? discoveryMaxResults());

  await updateDiscoveryPhase(executionId, { status: 'running', startedAt: new Date().toISOString() });

  // 1. Trigger the EXISTING production discovery pipeline.
  let jobId: string | null = null;
  try {
    const job = await startDiscoveryJob(
      userId,
      {
        niche,
        country: geo?.country,
        city: geo?.city,
        source: 'ai_search',
        maxResults,
      },
      undefined
    );
    if (job.status === 'failed' || !job.jobId) {
      await failDiscoveryRun(
        executionId, workflowId, userId,
        `Lead discovery could not start for niche "${niche}": ${job.message || 'unknown error'}. ` +
        'Check the discovery provider configuration (Settings → integrations) and run again.',
        { jobId: null }
      );
      return;
    }
    jobId = job.jobId;
  } catch (error) {
    await failDiscoveryRun(
      executionId, workflowId, userId,
      `Lead discovery could not start for niche "${niche}": ${error instanceof Error ? error.message : 'unknown error'}.`,
      { jobId: null }
    );
    return;
  }

  // 2. Wait for the job to reach a terminal state (bounded).
  let job: {
    status: string; totalFound: number; imported: number; duplicates: number;
    errorMessage: string | null; resultData: string | null;
  };
  try {
    job = await pollDiscoveryJobToTerminal(jobId);
  } catch (error) {
    await failDiscoveryRun(
      executionId, workflowId, userId,
      `Lead discovery for niche "${niche}" did not complete: ${error instanceof Error ? error.message : 'unknown error'}.`,
      { jobId }
    );
    return;
  }

  await updateDiscoveryPhase(executionId, {
    jobId,
    status: job.status,
    discovered: job.totalFound,
    imported: job.imported,
    duplicates: job.duplicates,
  });

  if (job.status === 'failed') {
    await failDiscoveryRun(
      executionId, workflowId, userId,
      `Lead discovery failed for niche "${niche}": ${job.errorMessage || 'unknown provider error'}. ` +
      'Verify the discovery provider configuration (web search + AI extraction credentials) and run again.',
      { jobId }
    );
    return;
  }

  // 3. Resolve the eligible lead set: the re-resolved niche (discovery
  //    imports carry the niche) UNIONED with the job's persisted payloads
  //    (deterministic matching — website → email → phone → name+city),
  //    deduplicated by lead id.
  const leads = await resolveDiscoveredLeadSet(userId, niche, job.resultData);

  // The user may have cancelled the run while discovery was working —
  // respect it BEFORE charging anything (a cancelled discovery run costs
  // 0 workflow-execution credits).
  const liveStatus = await db.workflowExecution
    .findUnique({ where: { id: executionId }, select: { status: true } })
    .catch(() => null);
  if (liveStatus?.status === 'cancelled') {
    await updateDiscoveryPhase(executionId, { status: 'cancelled', jobId });
    return;
  }

  if (leads.length === 0) {
    await failDiscoveryRun(
      executionId, workflowId, userId,
      `Discovery for niche "${niche}" completed but produced no eligible new leads ` +
      `(${job.totalFound} found, ${job.imported} imported, ${job.duplicates} duplicates of existing leads). ` +
      'Try a broader niche or discover leads manually first.',
      { jobId }
    );
    return;
  }

  // 4. The run is about to ACTUALLY execute — this is the acceptance
  //    moment for the flat fee (exactly once per run identity).
  const charge = await chargeWorkflowExecutionFee({
    userId,
    workflowId,
    chargeKey: `wfexec-run:${runKey}`,
    source: source ?? ('MANUAL_WORKFLOW' satisfies WorkflowChargeSource),
    referenceId: runKey,
    leadCount: leads.length,
  });
  if (!charge.ok) {
    await failDiscoveryRun(
      executionId, workflowId, userId,
      `Insufficient credits to run this workflow — the execution fee is ${charge.fee} credits, ` +
      `and this account has ${charge.balance}. The discovered leads were kept; top up credits and retry the run.`,
      { jobId }
    );
    return;
  }

  // 5. Continue the SAME execution with the discovered leads.
  const workflow = await db.workflowDefinition.findUnique({
    where: { id: workflowId },
    include: { workflowSteps: { orderBy: { order: 'asc' } } },
  });
  const steps = workflow
    ? loadStepsForExecution(workflow.workflowSteps, workflow.nodes).steps
    : [];

  await createLeadItems(executionId, leads);
  await updateDiscoveryPhase(executionId, { status: 'completed', jobId, resolvedLeads: leads.length });
  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'running',
      totalSteps: steps.length * leads.length,
      error: null,
    },
  });

  await runBatchSteps(executionId, workflowId, userId, {
    timeoutMs: defaultTimeoutMs(),
    maxRetries: defaultMaxRetries(),
    leadPacingMs: leadPacingMs(),
    neverStartedAutoRefund: true,
    rechargeOnStart: false,
    startStepsCompleted: 0,
    startedAtMs: Date.now(),
  });
}

/** Poll a discovery job row to a terminal state (bounded wait). */
async function pollDiscoveryJobToTerminal(
  jobId: string
): Promise<{
  status: string; totalFound: number; imported: number; duplicates: number;
  errorMessage: string | null; resultData: string | null;
}> {
  const deadline = Date.now() + discoveryTimeoutMs();
  for (;;) {
    await sleep(discoveryPollIntervalMs());
    const job = await db.discoveryJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`Discovery job ${jobId} disappeared`);
    if (job.status === 'completed' || job.status === 'failed') {
      return {
        status: job.status,
        totalFound: job.totalFound,
        imported: job.imported,
        duplicates: job.duplicates,
        errorMessage: job.errorMessage,
        resultData: job.resultData,
      };
    }
    if (Date.now() > deadline) {
      throw new Error(`Discovery job ${jobId} timed out after ${Math.round(discoveryTimeoutMs() / 60000)} min`);
    }
  }
}

/** Resolve the run's eligible lead set after discovery: the re-resolved
 * niche ∪ the job's persisted payloads, deduplicated by lead id and
 * capped at the honest request-size guard. */
async function resolveDiscoveredLeadSet(
  userId: string,
  niche: string,
  resultData: string | null
): Promise<BatchLead[]> {
  const byId = new Map<string, BatchLead>();

  // The niche re-resolution catches every lead whose stored niche now
  // matches (including leads the discovery pipeline just imported).
  const nicheLeads: ResolvedTargetLead[] = await resolveNicheLeads(userId, niche).catch(() => []);
  for (const lead of nicheLeads) {
    byId.set(lead.id, { id: lead.id, businessName: lead.businessName, niche: lead.niche ?? null });
  }

  // Payload matching catches imported leads whose stored niche differs
  // from the request string (e.g. normalized attributions).
  if (resultData) {
    let payloads: unknown[] = [];
    try {
      const parsed = JSON.parse(resultData);
      payloads = Array.isArray(parsed) ? parsed : [];
    } catch {
      payloads = [];
    }
    for (const raw of payloads) {
      if (!raw || typeof raw !== 'object') continue;
      const payload = raw as Record<string, unknown>;
      const matched = await matchPersistedLead(userId, payload).catch(() => null);
      if (matched && !byId.has(matched.id)) {
        byId.set(matched.id, { id: matched.id, businessName: matched.businessName, niche: matched.niche ?? null });
      }
    }
  }

  const all = [...byId.values()];
  return all.length > maxTargetLeads() ? all.slice(0, maxTargetLeads()) : all;
}

/** Deterministic payload → persisted-lead matching (website → email →
 * phone → name+city), mirroring the autopilot runner's resolver. */
async function matchPersistedLead(
  userId: string,
  payload: Record<string, unknown>
): Promise<{ id: string; businessName: string; niche: string | null } | null> {
  const select = { id: true, businessName: true, niche: true };
  const website = typeof payload.website === 'string' ? payload.website.trim() : '';
  if (website) {
    const bySite = await db.lead.findFirst({ where: { userId, website, isActive: true }, select });
    if (bySite) return bySite;
  }
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (email) {
    const byEmail = await db.lead.findFirst({ where: { userId, email, isActive: true }, select });
    if (byEmail) return byEmail;
  }
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  if (phone) {
    const byPhone = await db.lead.findFirst({ where: { userId, phone, isActive: true }, select });
    if (byPhone) return byPhone;
  }
  const businessName = typeof payload.businessName === 'string' ? payload.businessName.trim() : '';
  const city = typeof payload.city === 'string' ? payload.city.trim() : '';
  if (businessName && city) {
    const byName = await db.lead.findFirst({ where: { userId, businessName, city, isActive: true }, select });
    if (byName) return byName;
  }
  return null;
}

// ===== BATCH-AWARE RETRY / RESUME =====
//
// Batch executions retry ONLY the leads that failed (or were skipped by a
// cancel): completed leads are never re-executed — no duplicate outreach,
// no duplicate charges. The fee reconciliation mirrors the engine's
// single-lead retry: a never-started run's refunded fee is re-charged the
// moment the retry's first step actually completes (`wfexec-started:<id>`).

/** Load the workflow's steps + resolve this RUN's personalization inputs
 * from the execution's OWN persisted intelligenceConfig snapshot (retry/
 * resume continuation): the profile the run originally used is re-resolved
 * owner-scoped (falls back to the default resolution when it was since
 * deleted), and the run's original execution settings ride along. */
async function loadRunPersonalization(
  execution: { workflowId: string; triggerData?: string | null },
  userId: string
): Promise<{ resolvedProfile?: ProfileResolution; executionSettings?: Record<string, unknown> }> {
  let snapshottedProfileId: string | null = null;
  let executionSettings: Record<string, unknown> | undefined;
  try {
    const parsed = execution.triggerData
      ? (JSON.parse(execution.triggerData) as Record<string, unknown>)
      : {};
    const ic = parsed.intelligenceConfig as Record<string, unknown> | undefined;
    if (ic && typeof ic === 'object') {
      if (typeof ic.profileId === 'string' && ic.profileId) snapshottedProfileId = ic.profileId;
      if (ic.executionSettings && typeof ic.executionSettings === 'object') {
        executionSettings = ic.executionSettings as Record<string, unknown>;
      }
    }
  } catch {
    // unparseable triggerData → fresh resolution below
  }
  const workflow = await db.workflowDefinition.findUnique({
    where: { id: execution.workflowId },
    select: { profileId: true },
  }).catch(() => null);
  const resolvedProfile = await resolveBusinessProfileForUser(userId, {
    explicitProfileId: snapshottedProfileId,
    workflowProfileId: workflow?.profileId ?? null,
  }).catch(() => ({ profile: null, source: 'none' as const }));
  return { resolvedProfile, executionSettings };
}

export async function retryBatchExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  const execution = await db.workflowExecution.findFirst({
    where: { id: executionId },
    include: { workflow: { select: { userId: true, id: true } } },
  });
  if (!execution) return { success: false, error: 'Execution not found' };
  if (execution.workflow.userId !== userId) return { success: false, error: 'Not authorized' };

  const retriable = ['failed', 'cancelled', 'exhausted', 'partial'];
  if (!retriable.includes(execution.status)) {
    return { success: false, error: `Cannot retry execution in '${execution.status}' status` };
  }

  const counts = await getLeadCounts(executionId);
  if (counts.failed === 0 && counts.skipped === 0) {
    return { success: false, error: 'Nothing to retry — no failed or skipped leads in this run' };
  }

  // Never-started fee reconciliation (same ledger lookup as the engine's
  // single-lead retry: execution id + the run's batch id).
  let rechargeOnStart = false;
  if (execution.currentStep === 0) {
    const refundRefs: string[] = [execution.id];
    try {
      const parsed = execution.triggerData ? (JSON.parse(execution.triggerData) as Record<string, unknown>) : {};
      if (typeof parsed.runBatchId === 'string') refundRefs.push(parsed.runBatchId);
      const target = (parsed.target && typeof parsed.target === 'object' ? parsed.target : {}) as Record<string, unknown>;
      if (typeof target.runBatchId === 'string') refundRefs.push(target.runBatchId);
    } catch {
      // unparseable triggerData never blocks a retry
    }
    if (await wasNeverStartedFeeRefunded(userId, refundRefs)) {
      const feeCheck = await checkWorkflowExecutionFeeSufficiency(userId);
      if (!feeCheck.sufficient) {
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

  const workflow = await db.workflowDefinition.findUnique({
    where: { id: execution.workflowId },
    include: { workflowSteps: { orderBy: { order: 'asc' } } },
  });
  if (!workflow) return { success: false, error: 'Workflow not found' };
  const stepLoad = loadStepsForExecution(workflow.workflowSteps, workflow.nodes);
  if (!stepLoad.ok) {
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'failed', error: stepLoad.error, completedAt: new Date() },
    });
    return { success: false, error: stepLoad.error };
  }

  // Reset the failed leads (and leads skipped by a cancellation) to
  // pending. Completed leads are NEVER reset — no duplicate outreach.
  await db.workflowExecutionLead.updateMany({
    where: { executionId, status: 'failed' },
    data: { status: 'pending', error: null },
  });
  if (execution.status === 'cancelled') {
    await db.workflowExecutionLead.updateMany({
      where: { executionId, status: 'skipped' },
      data: { status: 'pending', error: null },
    });
  }

  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'running',
      error: null,
      completedAt: null,
      retryCount: { increment: 1 },
      lastRetryAt: new Date(),
    },
  });

  await runBatchSteps(executionId, execution.workflowId, userId, {
    timeoutMs: execution.timeoutMs ?? defaultTimeoutMs(),
    maxRetries: execution.maxRetries ?? defaultMaxRetries(),
    leadPacingMs: leadPacingMs(),
    neverStartedAutoRefund: true,
    rechargeOnStart,
    startStepsCompleted: execution.currentStep ?? 0,
    startedAtMs: Date.now(),
    // Retry continues the SAME run: the originally-snapshotted profile +
    // execution settings are restored from the execution record.
    ...(await loadRunPersonalization(execution, userId)),
  });

  await logWorkflowEvent(userId, 'workflow_retried', { executionId, workflowId: execution.workflowId });
  await emitWorkflowEvent('workflow_retried', userId, { executionId, workflowId: execution.workflowId });
  return { success: true, executionId };
}

export async function resumeBatchExecution(
  executionId: string,
  userId: string
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  const execution = await db.workflowExecution.findFirst({
    where: { id: executionId },
    include: { workflow: { select: { userId: true, id: true } } },
  });
  if (!execution) return { success: false, error: 'Execution not found' };
  if (execution.workflow.userId !== userId) return { success: false, error: 'Not authorized' };
  if (execution.status !== 'paused') {
    return { success: false, error: `Cannot resume execution in '${execution.status}' status` };
  }

  const counts = await getLeadCounts(executionId);
  if (counts.running === 0 && counts.pending === 0 && counts.skipped === 0) {
    return { success: false, error: 'Nothing to resume — no interrupted or pending leads' };
  }

  // The interrupted lead stays 'running' with persisted partial progress
  // (runBatchSteps resumes it from its last completed step); leads skipped
  // by the pause go back to pending.
  await db.workflowExecutionLead.updateMany({
    where: { executionId, status: 'skipped' },
    data: { status: 'pending', error: null },
  });
  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'running',
      error: null,
      resumedAt: new Date(),
    },
  });

  await runBatchSteps(executionId, execution.workflowId, userId, {
    timeoutMs: execution.timeoutMs ?? defaultTimeoutMs(),
    maxRetries: execution.maxRetries ?? defaultMaxRetries(),
    leadPacingMs: leadPacingMs(),
    neverStartedAutoRefund: true,
    rechargeOnStart: false,
    startStepsCompleted: execution.currentStep ?? 0,
    startedAtMs: Date.now(),
    // Resume continues the SAME run: restore its personalization config.
    ...(await loadRunPersonalization(execution, userId)),
  });
  return { success: true, executionId };
}
