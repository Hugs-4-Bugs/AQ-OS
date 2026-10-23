// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Execute API Route
// Phase 12: Execute a workflow (returns 202 with executionId)
//
// Task 1 — Workflow Target Foundation:
//   A run can be targeted at
//     • explicitly selected leads (multi-select, one execution per lead),
//     • a niche/industry (resolved against the caller's own active leads),
//     • a custom free-text query (matched against the caller's own leads).
//   Legacy single-lead ({triggerData:{leadId}} / {leadId}) and no-target
//   bodies keep their exact historical shape and behavior.
//
//   Selection size is validated against the caller's EXISTING plan
//   entitlement (ENTITLEMENTS[plan].lead_discovery.limit — the same
//   centralized config every other route uses; Free=10, Starter=25,
//   Pro/Elite=null=unlimited). There is deliberately NO arbitrary
//   hard-coded cap: unlimited-plan users may select as many of their own
//   leads as they have.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { executeWorkflow } from '@/lib/workflow-engine';
import {
  executeWorkflowBatch,
  executeNicheRunWithDiscovery,
  isZaiProviderConfigured,
} from '@/lib/workflow-batch';
import { resolveNicheLeads, maxTargetLeads } from '@/lib/workflow-targeting';
import { getLeadCounts } from '@/lib/workflow-execution-leads';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import { ENTITLEMENTS, type PlanType } from '@/lib/entitlement-service';
import { resolveLeadForExecution } from '@/lib/lead-resolution';
import { validateDefinition } from '@/lib/workflow-validation';
import {
  chargeWorkflowExecutionFee,
  refundWorkflowExecutionFee,
  WORKFLOW_EXECUTION_FEE_CREDITS,
  type WorkflowChargeSource,
} from '@/lib/workflow-credits';
import {
  splitNicheList,
  TERMINAL_EXECUTION_STATUSES,
} from '@/lib/workflow-retry';
import { db } from '@/lib/db';

// ===== TYPES =====

type TargetMode = 'selected_leads' | 'niche' | 'custom';

interface RunTarget {
  mode?: string;
  leadIds?: unknown;
  niche?: string;
  customQuery?: string;
  /** Part 2 — client-supplied run identity for charge/execution
   * idempotency (double-click protection). */
  runId?: unknown;
}

interface ResolvedLead {
  id: string;
  businessName: string;
  niche?: string | null;
  city?: string | null;
  stage?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How long a batched (multi-lead) request waits for the background batch
// execution to reach a terminal state before reporting the current state.
// Env-configurable so tests can run without real waiting.
function batchSettleTimeoutMs(): number {
  return Number(process.env.WORKFLOW_BATCH_SETTLE_MS) || 90000;
}
function batchPollIntervalMs(): number {
  return Number(process.env.WORKFLOW_BATCH_POLL_MS) || 1500;
}

// Phase 6.8 — batches up to this size wait for their background executions
// to settle and report final per-lead statuses (the verified Task 1
// behavior). Larger batches respond immediately with honest 'running'
// statuses instead of holding one giant synchronous request.
function batchSettleMaxLeads(): number {
  const v = Number(process.env.WORKFLOW_BATCH_SETTLE_MAX_LEADS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 50;
}

// ── Part 2 — flat execution fee identity ─────────────────────────
// One accepted workflow run costs WORKFLOW_EXECUTION_FEE_CREDITS (5),
// charged exactly once per run identity. The client may supply a run id
// (`target.runId`, or the legacy `body.idempotencyKey`): a rapid
// double-click then replays the SAME identity, so the engine's per-lead
// idempotency keys AND the ledger's charge idempotency both dedupe —
// one logical run, one 5-credit charge. Invalid/absent ids degrade to a
// server-generated key (a genuinely new run).
const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
function sanitizeRunKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return RUN_KEY_PATTERN.test(v) ? v : null;
}
function generateRunKey(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Insufficient-credits rejection (Part 2 §11): honest 402 BEFORE any
 * execution record, side effect, or misleading running state exists. */
function insufficientCreditsResponse(
  workflowId: string,
  charge: { fee: number; balance: number; shortfall: number }
) {
  return NextResponse.json(
    {
      success: false,
      code: 'INSUFFICIENT_CREDITS',
      error:
        `Insufficient credits to run this workflow — the execution fee is ${charge.fee} credit${charge.fee === 1 ? '' : 's'}, ` +
        `and this account has ${charge.balance}. Nothing was executed. Top up credits or reduce spending, then run again.`,
      workflowId,
      fee: charge.fee,
      balance: charge.balance,
      shortfall: charge.shortfall,
    },
    { status: 402 }
  );
}

// Resolution page size for niche/custom target queries — chunked database
// queries keep memory flat while paging through arbitrarily large sets.
const RESOLUTION_PAGE_SIZE = 500;

// ===== HELPERS =====

/** Extract the target mode from a request body (new shape or legacy). */
function resolveTargetMode(body: Record<string, unknown>): TargetMode | null {
  const target = (body.target && typeof body.target === 'object' ? body.target : {}) as RunTarget;
  const mode = String(target.mode || '').toLowerCase();
  if (mode === 'selected_leads' || mode === 'niche' || mode === 'custom') {
    return mode;
  }
  // Legacy shapes: an array of lead ids, a single leadId, or no target.
  if (Array.isArray(target.leadIds) || Array.isArray(body.leadIds)) return 'selected_leads';
  if (body.leadId || (body.triggerData && typeof body.triggerData === 'object' && (body.triggerData as Record<string, unknown>).leadId)) {
    return null; // legacy single-lead — handled by the original code path
  }
  return null; // legacy no-target — handled by the original code path
}

/**
 * Resolve the caller's lead-selection entitlement.
 *
 * The plan's `lead_discovery` limit is the product's existing "how many
 * leads does this plan allow" number (Free=10, Starter=25, Pro/Elite=
 * unlimited). It is the ONLY limit applied to a multi-lead selection —
 * no arbitrary hard-coded cap exists in this route.
 */
function getLeadSelectionLimit(plan: string): number | null {
  const planType = (plan || 'free') as PlanType;
  const entitlement = ENTITLEMENTS[planType]?.lead_discovery;
  // Unknown plan strings degrade to the free tier's limit, never to null.
  if (entitlement && typeof entitlement.limit === 'number') return entitlement.limit;
  if (entitlement && entitlement.limit === null) return null;
  return ENTITLEMENTS.free.lead_discovery.limit;
}

/**
 * Resolve selected lead ids to the caller's OWN active leads (all-or-nothing).
 * Every id must resolve through the owner-scoped resolution path — a foreign
 * or unknown id rejects the whole request before anything executes.
 */
async function resolveSelectedLeads(
  userId: string,
  leadIds: string[]
): Promise<{ ok: true; leads: ResolvedLead[] } | { ok: false; failed: string[] }> {
  const failed: string[] = [];
  const leads: ResolvedLead[] = [];
  for (const leadId of leadIds) {
    const resolved = await resolveLeadForExecution(userId, leadId, {
      select: { id: true, businessName: true, niche: true, city: true, stage: true },
    });
    if (resolved.ok) {
      leads.push(resolved.lead as ResolvedLead);
    } else {
      failed.push(leadId);
    }
  }
  return failed.length > 0 ? { ok: false, failed } : { ok: true, leads };
}

/** Resolve a custom free-text target against the caller's own active leads.
 *
 * Phase 6.4 — same chunked pagination: no arbitrary take(500) truncation.
 */
async function resolveCustomLeads(userId: string, query: string): Promise<ResolvedLead[]> {
  const q = query.toLowerCase();
  const all: (ResolvedLead & { ownerName?: string | null })[] = [];
  let skip = 0;
  for (;;) {
    const candidates = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        OR: [
          { businessName: { contains: query } },
          { niche: { contains: query } },
          { city: { contains: query } },
          { ownerName: { contains: query } },
        ],
      },
      select: { id: true, businessName: true, niche: true, city: true, stage: true, ownerName: true },
      take: RESOLUTION_PAGE_SIZE,
      skip,
    });
    // Case-insensitive re-check (SQLite contains is ASCII-case-insensitive;
    // this keeps behavior consistent for non-ASCII locales too).
    all.push(...candidates.filter((l) =>
      [l.businessName, l.niche, l.city, l.ownerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    ));
    if (candidates.length < RESOLUTION_PAGE_SIZE) break;
    skip += RESOLUTION_PAGE_SIZE;
    if (all.length >= maxTargetLeads()) break; // bounded; caller enforces honestly
  }
  return all;
}

/** Wait until the batch execution reaches a terminal state (or timeout).
 * Part 1 — 'exhausted' is terminal alongside completed/failed/cancelled;
 * the multi-lead batch model adds 'partial' (a settled mixed-outcome run). */
async function waitForBatchSettle(executionIds: string[]): Promise<void> {
  const deadline = Date.now() + batchSettleTimeoutMs();
  while (Date.now() < deadline) {
    const rows = await db.workflowExecution.findMany({
      where: { id: { in: executionIds } },
      select: { status: true },
    });
    const settled = rows.every(
      (r) => TERMINAL_EXECUTION_STATUSES.has(r.status) || r.status === 'partial',
    );
    if (settled || rows.length < executionIds.length) return;
    await sleep(batchPollIntervalMs());
  }
}

// ===== ROUTE =====

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

      // Entitlement check: workflow_access feature (Pro/Elite). Backend
      // authorization is the source of truth — a downgraded account cannot
      // run workflows even if a stale UI still shows the button.
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      // Verify ownership (with persisted steps — Run Now validates the
      // full definition before creating any execution record)
      const workflow = await db.workflowDefinition.findFirst({
        where: { id, userId: user.id },
        include: { workflowSteps: { orderBy: { order: 'asc' } } },
      });

      if (!workflow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
        );
      }

      // Phase 3 — Run Now configuration pre-flight. A workflow whose
      // persisted definition is invalid (missing required step config,
      // unsupported action, malformed JSON, or no steps at all) is
      // rejected with a repair error BEFORE any execution record or
      // side effect exists. Legacy/malformed definitions surface here
      // as a clear 422 instead of silently "completing" with 0 steps
      // or failing mid-run with a confusing payload error.
      const definitionValidation = validateDefinition(
        workflow.workflowSteps as unknown as { type: string; name: string; config: string; order: number }[],
        workflow.nodes
      );
      if (!definitionValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Workflow configuration is invalid — repair it before running.',
            code: 'WORKFLOW_INVALID',
            issues: definitionValidation.issues,
          },
          { status: 422 }
        );
      }

      // Subscription-retention gate (3-layer defense: UI disabled → API 400 → execute 403)
      // A workflow flagged disabledBySubscription cannot be executed until the
      // user renews their subscription (which auto-resumes the workflow).
      if (workflow.disabledBySubscription) {
        return NextResponse.json(
          {
            success: false,
            error: 'Workflow execution blocked — subscription is paused. Please renew your subscription.',
            code: 'SUBSCRIPTION_PAUSED',
          },
          { status: 403 }
        );
      }

      // ── Targeted runs (multi-lead / niche / custom) ──────────────────
      const mode = resolveTargetMode(body);
      if (mode) {
        const target = (body.target && typeof body.target === 'object' ? body.target : {}) as RunTarget;

        // ── Phase 17 — explicitly supplied execution settings ─────────
        // The HIGHEST precedence tier for personalization: they override
        // workflow/campaign overrides, which override business-profile
        // defaults. Accepted keys are whitelisted; everything else in the
        // request body is ignored (no injection surface). profileId is
        // validated owner-side inside the batch runner's profile resolver.
        const rawSettings =
          body.executionSettings && typeof body.executionSettings === 'object'
            ? (body.executionSettings as Record<string, unknown>)
            : {};
        const executionSettings: Record<string, unknown> = {};
        for (const key of ['profileId', 'tone', 'language', 'cta', 'channel', 'style'] as const) {
          const v = rawSettings[key];
          if (typeof v === 'string' && v.trim()) executionSettings[key] = v.trim().slice(0, 200);
        }

        // 1. Resolve the lead set for the requested mode
        let leads: ResolvedLead[] = [];
        // Exact request-level target snapshot (Phase 6.9): what the user
        // ACTUALLY targeted at execution time, preserved verbatim on every
        // per-lead execution even if the workflow or targeting changes later.
        let requestSnapshot: Record<string, unknown> = {};
        if (mode === 'selected_leads') {
          const rawIds = Array.isArray(target.leadIds)
            ? target.leadIds
            : Array.isArray(body.leadIds)
              ? (body.leadIds as unknown[])
              : [];
          const leadIds = [...new Set(
            rawIds
              .map((v) => (typeof v === 'string' ? v.trim() : ''))
              .filter(Boolean)
          )];
          if (leadIds.length === 0) {
            return NextResponse.json(
              { success: false, error: 'Select at least one lead to run this workflow against.', code: 'NO_LEADS_SELECTED' },
              { status: 400 }
            );
          }
          if (leadIds.length > maxTargetLeads()) {
            return NextResponse.json(
              { success: false, error: `Too many lead ids in one request (max ${maxTargetLeads()}).`, code: 'REQUEST_TOO_LARGE' },
              { status: 400 }
            );
          }
          requestSnapshot = { selectedLeadIds: leadIds };

          // 2. Entitlement validation — the plan's OWN lead limit, not an
          //    arbitrary constant. Pro/Elite (limit: null) are unlimited.
          const limit = getLeadSelectionLimit(user.plan);
          if (limit !== null && leadIds.length > limit) {
            const planType = (user.plan || 'free') as PlanType;
            return NextResponse.json(
              {
                success: false,
                error: `Your ${planType} plan allows up to ${limit} leads. You selected ${leadIds.length}. Upgrade to Pro for unlimited leads.`,
                code: 'PLAN_LEAD_LIMIT_EXCEEDED',
                plan: planType,
                limit,
                selected: leadIds.length,
              },
              { status: 400 }
            );
          }

          // 3. All-or-nothing ownership validation
          const resolved = await resolveSelectedLeads(user.id, leadIds);
          if (!resolved.ok) {
            return NextResponse.json(
              {
                success: false,
                error: `${resolved.failed.length} of ${leadIds.length} selected lead${leadIds.length === 1 ? '' : 's'} could not be found among your active leads. Nothing was executed.`,
                code: 'LEAD_NOT_FOUND',
              },
              { status: 400 }
            );
          }
          leads = resolved.leads;
        } else if (mode === 'niche') {
          const niche = String(target.niche || '').trim();
          if (!niche) {
            return NextResponse.json(
              { success: false, error: 'A niche is required for niche-targeted runs.', code: 'NICHE_REQUIRED' },
              { status: 400 }
            );
          }
          if (niche.length > 100) {
            return NextResponse.json(
              { success: false, error: 'The niche is too long (max 100 characters).', code: 'NICHE_TOO_LONG' },
              { status: 400 }
            );
          }
          requestSnapshot = { niche, requestedNiches: splitNicheList(niche) };
          leads = await resolveNicheLeads(user.id, niche);
          if (leads.length === 0) {
            // ── Missing-niche discovery bridge (multi-lead task §4) ──
            // A niche with no matching leads does NOT simply fail the run:
            // the existing Lead Discovery pipeline runs for that niche
            // (real web search + LLM extraction + DB-level dedup against
            // existing leads) and the workflow CONTINUES with the
            // discovered leads — all inside ONE execution that transitions
            // discovering → running → terminal. The flat fee is charged
            // only once discovery actually produced eligible leads; a
            // discovery that yields nothing or fails costs 0 credits.
            //
            // Pre-flight: discovery depends on the Z-ai provider config
            // (.z-ai-config) — without it the run is refused with an
            // actionable configuration error instead of silently failing.
            if (!isZaiProviderConfigured()) {
              return NextResponse.json(
                {
                  success: false,
                  code: 'DISCOVERY_PROVIDER_NOT_CONFIGURED',
                  error:
                    `No active leads match the niche "${niche}", and lead discovery cannot run because the ` +
                    'Z-ai provider (web search + AI extraction) is not configured. Create a valid ' +
                    '.z-ai-config file (with baseUrl and apiKey) in the project root or home directory, ' +
                    'or discover leads manually first, then run again.',
                  workflowId: id,
                  targetMode: 'niche',
                  requestedNiche: niche,
                  requestedNiches: splitNicheList(niche),
                  targetConfig: { mode: 'niche', niche },
                  matchingLeadCount: 0,
                },
                { status: 422 }
              );
            }

            // Cap discovery to the plan's own lead allowance (Free=10,
            // Starter=25, Pro/Elite unlimited) — the same entitlement the
            // resolved-target path enforces below.
            const planLimit = getLeadSelectionLimit(user.plan);
            const discoveryRunKey =
              sanitizeRunKey((body.target as RunTarget | undefined)?.runId) ??
              sanitizeRunKey(body.idempotencyKey) ??
              generateRunKey();
            const discoveryStart = await executeNicheRunWithDiscovery({
              workflowId: id,
              userId: user.id,
              niche,
              runKey: discoveryRunKey,
              targetSnapshot: {
                mode: 'niche',
                runBatchId: discoveryRunKey,
                leadCount: 0,
                ...requestSnapshot,
              },
              ...(planLimit !== null ? { maxResults: planLimit } : {}),
              source: 'MANUAL_WORKFLOW' satisfies WorkflowChargeSource,
            });
            return NextResponse.json(
              {
                executionId: discoveryStart.executionId,
                status: 'discovering',
                async: true,
                message:
                  `No active leads match the niche "${niche}" — lead discovery is running for that niche. ` +
                  'The workflow will continue automatically with the discovered leads (deduplicated against your existing leads); ' +
                  'monitor the run on the Executions tab.',
                target: {
                  mode: 'niche',
                  niche,
                  runBatchId: discoveryRunKey,
                  runId: discoveryRunKey,
                  discovery: true,
                  ...(planLimit !== null ? { discoveryCap: planLimit } : {}),
                },
                creditsCharged: 0,
              },
              { status: 202 }
            );
          }
        } else {
          const customQuery = String(target.customQuery || '').trim();
          if (!customQuery) {
            return NextResponse.json(
              { success: false, error: 'A search query is required for custom-targeted runs.', code: 'CUSTOM_QUERY_REQUIRED' },
              { status: 400 }
            );
          }
          if (customQuery.length > 200) {
            return NextResponse.json(
              { success: false, error: 'The query is too long (max 200 characters).', code: 'CUSTOM_QUERY_TOO_LONG' },
              { status: 400 }
            );
          }
          requestSnapshot = { customTarget: customQuery };
          leads = await resolveCustomLeads(user.id, customQuery);
          if (leads.length === 0) {
            return NextResponse.json(
              { success: false, error: `No active leads match "${customQuery}".`, code: 'NO_LEADS_FOR_QUERY' },
              { status: 400 }
            );
          }
        }

        // Phase 6.5 — backend validation for EVERY mode: the resolved target
        // population is checked against the plan's own lead limit (niche and
        // custom resolutions previously bypassed the entitlement gate) and
        // against the honest request-size guard (no silent truncation — the
        // resolver pages through the full set, and an oversized set is
        // rejected so the caller refines the targeting).
        const resolvedLimit = getLeadSelectionLimit(user.plan);
        if (leads.length > maxTargetLeads()) {
          return NextResponse.json(
            {
              success: false,
              error: `This run would target ${leads.length} leads — the maximum is ${maxTargetLeads()} per run. Refine the targeting (e.g. a narrower niche) and run again.`,
              code: 'TARGET_TOO_LARGE',
              resolved: leads.length,
              max: maxTargetLeads(),
            },
            { status: 400 }
          );
        }
        if (resolvedLimit !== null && leads.length > resolvedLimit) {
          const planType = (user.plan || 'free') as PlanType;
          return NextResponse.json(
            {
              success: false,
              error: `Your ${planType} plan allows up to ${resolvedLimit} leads. This target resolves to ${leads.length} of your leads. Upgrade to Pro for unlimited leads.`,
              code: 'PLAN_LEAD_LIMIT_EXCEEDED',
              plan: planType,
              limit: resolvedLimit,
              resolved: leads.length,
            },
            { status: 400 }
          );
        }

        // ── Part 2 — flat execution fee, charged exactly ONCE per run ──
        // Every validation that can reject the run for free (entitlement,
        // ownership, definition validity, subscription state, target
        // resolution, plan/size limits) has already passed above — so this
        // is the "accepted for execution" moment. The fee is a FLAT 5
        // credits regardless of lead count (1 or 1000), charged atomically
        // through the central credit service with an idempotency key tied
        // to the run identity: replays of the same client run id
        // (double-click / network retry) never double-charge.
        const runKey =
          sanitizeRunKey((body.target as RunTarget | undefined)?.runId) ??
          sanitizeRunKey(body.idempotencyKey) ??
          generateRunKey();
        const charge = await chargeWorkflowExecutionFee({
          userId: user.id,
          workflowId: id,
          chargeKey: `wfexec-run:${runKey}`,
          source: 'MANUAL_WORKFLOW' satisfies WorkflowChargeSource,
          referenceId: runKey,
          leadCount: leads.length,
        });
        if (!charge.ok) {
          return insufficientCreditsResponse(id, charge);
        }

        // ── Multi-lead execution model: ONE run = ONE execution ──
        // The whole lead set (selected / niche / custom) executes as a
        // SINGLE grouped WorkflowExecution with one child item per lead
        // (pending → running → completed/failed/skipped, per-lead
        // isolation, sequential provider-friendly pacing). The executions
        // history shows ONE row for this run.
        const runBatchId = runKey;
        const targetSnapshot: Record<string, unknown> = {
          mode,
          runBatchId,
          leadCount: leads.length,
          ...requestSnapshot,
        };
        let batchKickError: unknown = null;
        const batchResult = await executeWorkflowBatch(id, user.id, {
          leads: leads.map((lead) => ({
            id: lead.id,
            businessName: lead.businessName,
            niche: lead.niche ?? null,
          })),
          targetSnapshot,
          idempotencyKey: `batch_${runBatchId}`,
          // Background: the batch processes leads sequentially (the
          // rate-limit-safe model); the route settles/polls below instead
          // of holding one giant synchronous request.
          awaitCompletion: false,
          // The route's ONE charge covers this ONE execution — the batch
          // runner itself releases the fee when the run terminates with
          // zero steps completed (never actually started).
          neverStartedAutoRefund: true,
          // Phase 17 — explicitly supplied execution settings (highest
          // precedence tier for per-lead personalization).
          executionSettings,
        }).catch((kickErr: unknown) => {
          batchKickError = kickErr;
          return { executionId: '', status: 'failed', leadCount: leads.length, stepsCompleted: 0 } as Awaited<ReturnType<typeof executeWorkflowBatch>>;
        });

        // ── Part 2 §21 — reservation release ──
        // The flat fee was charged for THIS run; an internal failure that
        // prevented the execution record from being created means nothing
        // started — the fee is released idempotently (no execution exists,
        // so the runner-side refund can never have fired; the two paths
        // can never double-refund).
        if (!batchResult.executionId) {
          await refundWorkflowExecutionFee({
            userId: user.id,
            workflowId: id,
            chargeKey: `wfexec-run:${runKey}`,
            source: 'MANUAL_WORKFLOW' satisfies WorkflowChargeSource,
            referenceId: runKey,
          }).catch(() => {
            // A refund failure must not mask the run's real outcome; the
            // ledger's idempotency key makes a later retry safe.
          });
          return NextResponse.json(
            {
              success: false,
              error: batchKickError instanceof Error
                ? `The run could not be started (${batchKickError.message}). The ${WORKFLOW_EXECUTION_FEE_CREDITS}-credit execution fee was refunded.`
                : batchResult.error
                  ? `The run could not be started (${batchResult.error}). The ${WORKFLOW_EXECUTION_FEE_CREDITS}-credit execution fee was refunded.`
                  : `The run could not be started. The ${WORKFLOW_EXECUTION_FEE_CREDITS}-credit execution fee was refunded.`,
              code: 'RUN_START_FAILED',
              creditsRefunded: true,
              target: { mode, leadCount: leads.length, runBatchId },
            },
            { status: 500 }
          );
        }

        // Phase 6.8 — large batches respond immediately with an honest
        // 'running' status (the ONE grouped execution processes its leads
        // in the background); small batches keep the verified
        // settle-and-report behavior so the response carries final
        // per-lead outcomes.
        if (leads.length > batchSettleMaxLeads()) {
          return NextResponse.json(
            {
              executionId: batchResult.executionId,
              status: 'running',
              async: true,
              message: `The workflow run started in the background for ${leads.length} lead${leads.length === 1 ? '' : 's'} — monitor its progress on the Executions tab.`,
              target: { mode, leadCount: leads.length, runBatchId, runId: runKey },
              creditsCharged: WORKFLOW_EXECUTION_FEE_CREDITS,
            },
            { status: 202 }
          );
        }

        // Wait for the ONE grouped execution to settle, then report the
        // persisted per-lead outcomes — the response reports what ACTUALLY
        // happened. The batch runner performs its own never-started refund
        // BEFORE writing the terminal status, so a settled row is always
        // fully reconciled.
        await waitForBatchSettle([batchResult.executionId]);
        const finalRow = await db.workflowExecution.findUnique({
          where: { id: batchResult.executionId },
          select: { id: true, status: true, error: true, currentStep: true },
        });
        const finalLeadItems = await db.workflowExecutionLead.findMany({
          where: { executionId: batchResult.executionId },
          orderBy: { createdAt: 'asc' },
          select: { leadId: true, leadName: true, status: true, error: true },
        });
        const leadCounts = await getLeadCounts(batchResult.executionId);

        // Per-lead outcomes (the UI's `executions` field name is kept for
        // compatibility; `leads` is the same array under its true name).
        const perLead = finalLeadItems.map((item) => ({
          leadId: item.leadId || '',
          leadName: item.leadName || '',
          executionId: batchResult.executionId,
          status: item.status,
          error: item.error || undefined,
        }));
        const overall: string =
          finalRow?.status === 'completed'
            ? 'completed'
            : finalRow?.status === 'partial'
              ? 'partial'
              : finalRow?.status === 'exhausted'
                ? 'failed'
                : finalRow?.status === 'cancelled'
                  ? 'cancelled'
                  : finalRow?.status ?? 'running';

        // Zero steps completed + terminal failure = the run never actually
        // started (the runner already released the fee idempotently).
        const neverStarted =
          (finalRow?.status === 'failed' || finalRow?.status === 'exhausted') &&
          (finalRow?.currentStep ?? 0) === 0;

        return NextResponse.json(
          {
            executionId: batchResult.executionId,
            status: overall,
            error: finalRow?.error || undefined,
            target: { mode, leadCount: leads.length, runBatchId, runId: runKey },
            leadSummary: leadCounts,
            creditsCharged: neverStarted ? 0 : WORKFLOW_EXECUTION_FEE_CREDITS,
            ...(neverStarted ? { creditsRefunded: true } : {}),
            leads: perLead,
            // Compat alias (the workflows UI reads `executions`).
            executions: perLead,
          },
          { status: 202 }
        );
      }

      // ── Legacy paths (byte-compatible with the pre-Task-1 API) ───────
      // A legacy single-lead body carries triggerData.leadId (or a bare
      // leadId). Owner-scope it BEFORE executing — the same all-or-nothing
      // isolation rule as targeted runs (a foreign/unknown lead id rejects
      // with 400 instead of creating a doomed execution record).
      const legacyLeadIdRaw = (body.triggerData && typeof body.triggerData === 'object'
        ? (body.triggerData as Record<string, unknown>).leadId
        : body.leadId);
      if (legacyLeadIdRaw !== undefined) {
        const leadId = typeof legacyLeadIdRaw === 'string' ? legacyLeadIdRaw.trim() : '';
        if (!leadId) {
          return NextResponse.json(
            { success: false, error: 'Lead not found', code: 'LEAD_NOT_FOUND' },
            { status: 400 }
          );
        }
        const legacyLead = await resolveLeadForExecution(user.id, leadId, {
          select: { id: true, businessName: true },
        });
        if (!legacyLead.ok) {
          return NextResponse.json(
            { success: false, error: 'Lead not found', code: 'LEAD_NOT_FOUND' },
            { status: 400 }
          );
        }
      }

      // ── Part 2 — flat execution fee for the legacy (single/no-target) ──
      // Same acceptance moment as targeted runs: every free rejection has
      // already happened above (entitlement, ownership, definition
      // validation, subscription gate, lead resolution). The charge key
      // rides the SAME idempotency identity the engine uses, so replays
      // (double-click with the same client key, network retry) dedupe on
      // both the execution and the charge.
      const legacyRunKey = sanitizeRunKey(body.idempotencyKey) ?? generateRunKey();
      const legacyCharge = await chargeWorkflowExecutionFee({
        userId: user.id,
        workflowId: id,
        chargeKey: `wfexec-run:${legacyRunKey}`,
        source: 'MANUAL_WORKFLOW' satisfies WorkflowChargeSource,
        referenceId: legacyRunKey,
        leadCount: legacyLeadIdRaw !== undefined ? 1 : 0,
      });
      if (!legacyCharge.ok) {
        return insufficientCreditsResponse(id, legacyCharge);
      }

      // Execute the workflow. neverStartedAutoRefund: this legacy path's
      // ONE charge covers this ONE execution — the engine itself releases
      // the fee if the run terminates with ZERO steps completed (it never
      // actually started). The route's §21 release below still covers the
      // no-execution-record case; both use ledger idempotency, so they can
      // never double-refund.
      const legacyTriggerData = (body.triggerData && typeof body.triggerData === 'object'
        ? body.triggerData
        : body) as Record<string, unknown>;
      const result = await executeWorkflow(
        id,
        user.id,
        legacyTriggerData,
        legacyRunKey,
        { neverStartedAutoRefund: true }
      );

      // ── Part 2 §21 — refund when the run never actually started ──
      // NO executionId at all (not found, monthly execution limit, engine
      // preflight) means NOTHING started: the fee is released, idempotently.
      // An execution record that terminated with ZERO steps completed also
      // never actually started (e.g. the first step's webhook/network call
      // failed before any step executed): the ENGINE already released the
      // fee (neverStartedAutoRefund above) — the response reports it.
      if (!result.executionId) {
        await refundWorkflowExecutionFee({
          userId: user.id,
          workflowId: id,
          chargeKey: `wfexec-run:${legacyRunKey}`,
          source: 'MANUAL_WORKFLOW' satisfies WorkflowChargeSource,
          referenceId: legacyRunKey,
        }).catch(() => {
          // Ledger idempotency makes a later retry safe.
        });
        return NextResponse.json(
          {
            error: result.error || 'Workflow execution could not be started',
            code: 'RUN_START_FAILED',
            creditsRefunded: true,
          },
          { status: 400 }
        );
      }

      // Zero completed steps + terminal failure = never actually started:
      // the engine released the fee (refund is idempotent + retry-safe, so
      // the response honestly reflects the reconciled ledger state).
      const legacyNeverStarted =
        (result.status === 'failed' || result.status === 'exhausted') &&
        result.stepsCompleted === 0;

      // Return 202 Accepted with execution ID
      return NextResponse.json(
        {
          executionId: result.executionId,
          status: result.status,
          error: result.error,
          creditsCharged: legacyNeverStarted ? 0 : WORKFLOW_EXECUTION_FEE_CREDITS,
          ...(legacyNeverStarted ? { creditsRefunded: true } : {}),
        },
        { status: 202 }
      );
    } catch (error) {
      console.error('[WorkflowExecuteAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to execute workflow' },
        { status: 500 }
      );
    }
  });
}
