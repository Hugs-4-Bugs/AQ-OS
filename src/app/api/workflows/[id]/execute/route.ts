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
  leadMatchesRequestedNiches,
  NO_MATCHING_LEADS,
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

interface PerLeadExecution {
  leadId: string;
  leadName: string;
  executionId: string;
  status: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How long a batched (multi-lead) request waits for the kicked background
// executions to reach a terminal state before reporting current statuses.
// Env-configurable so tests can run without real waiting.
function batchSettleTimeoutMs(): number {
  return Number(process.env.WORKFLOW_BATCH_SETTLE_MS) || 90000;
}
function batchPollIntervalMs(): number {
  return Number(process.env.WORKFLOW_BATCH_POLL_MS) || 1500;
}
// Pacing between per-lead kicks — mirrors the autopilot runner's stagger so
// a large batch does not stampede external AI/email providers.
function kickStaggerMs(): number {
  const v = Number(process.env.WORKFLOW_KICK_STAGGER_MS);
  return Number.isFinite(v) ? Math.max(0, v) : 1000;
}

// Phase 6 — request-size guard (a genuine product limit, not an arbitrary
// silent cap): one run may target at most this many leads. Exceeding it is
// rejected honestly so the caller can refine the targeting; it never
// silently truncates the target set.
function maxTargetLeads(): number {
  const v = Number(process.env.WORKFLOW_MAX_TARGET_LEADS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1000;
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

/** Resolve a niche/industry target against the caller's own active leads.
 *
 * Phase 6.4 — pages through the ENTIRE matching set in chunked queries:
 * there is no arbitrary take(500) truncation. The request-size guard
 * (maxTargetLeads) bounds pathological sets honestly at the caller.
 *
 * Part 1 — a niche target may list multiple niches ("hospital, dentist").
 * Each requested niche is matched EXACTLY (case-insensitive) against the
 * leads' OWN stored niche, so a lead is attributed to the niche it actually
 * carries — never relabeled with the comma-joined request string.
 */
async function resolveNicheLeads(userId: string, niche: string): Promise<ResolvedLead[]> {
  const wantedList = splitNicheList(niche);
  if (wantedList.length === 0) return [];
  // Candidate narrowing per requested niche (contains stays index-friendly
  // on SQLite; the exact per-niche match is re-checked in JS below).
  const nicheContains = wantedList.map((n) => ({ niche: { contains: n } }));
  const all: ResolvedLead[] = [];
  let skip = 0;
  for (;;) {
    const candidates = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        ...(wantedList.length === 1
          ? { niche: { contains: wantedList[0] } }
          : { OR: nicheContains }),
      },
      select: { id: true, businessName: true, niche: true, city: true, stage: true },
      take: RESOLUTION_PAGE_SIZE,
      skip,
    });
    all.push(...candidates.filter((l) => leadMatchesRequestedNiches(l.niche, wantedList)));
    if (candidates.length < RESOLUTION_PAGE_SIZE) break;
    skip += RESOLUTION_PAGE_SIZE;
    if (all.length >= maxTargetLeads()) break; // bounded; caller enforces honestly
  }
  return all;
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

/** Wait until all batched executions reach a terminal state (or timeout).
 * Part 1 — 'exhausted' is terminal alongside completed/failed/cancelled. */
async function waitForBatchSettle(executionIds: string[]): Promise<void> {
  const deadline = Date.now() + batchSettleTimeoutMs();
  while (Date.now() < deadline) {
    const rows = await db.workflowExecution.findMany({
      where: { id: { in: executionIds } },
      select: { status: true },
    });
    const settled = rows.every((r) => TERMINAL_EXECUTION_STATUSES.has(r.status));
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
            // Part 1 — NO_MATCHING_LEADS is a structured BUSINESS result,
            // distinct from an engine crash, a provider failure, or an
            // invalid configuration. The frontend uses these fields to
            // offer the Find-Leads handoff; nothing was executed and no
            // execution record exists, so there is nothing to retry or
            // cancel server-side — the run ends here, honestly.
            return NextResponse.json(
              {
                success: false,
                code: NO_MATCHING_LEADS,
                error: `No active leads match the niche "${niche}". Discover leads in that niche first.`,
                workflowId: id,
                userId: user.id,
                targetMode: 'niche',
                requestedNiche: niche,
                requestedNiches: splitNicheList(niche),
                targetConfig: { mode: 'niche', niche },
                matchingLeadCount: leads.length,
              },
              { status: 400 }
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
        // resolution, plan/size limits, NO_MATCHING_LEADS) has already
        // passed above — so this is the "accepted for execution" moment.
        // The fee is a FLAT 5 credits regardless of lead count (1 or 1000),
        // charged atomically through the central credit service with an
        // idempotency key tied to the run identity: replays of the same
        // client run id (double-click / network retry) never double-charge.
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

        // 4. Kick one execution per lead (persisted target snapshot on each)
        const runBatchId = runKey;
        // Phase 6.9 — the EXACT request-level snapshot travels on every
        // per-lead execution: mode, batch id, the verbatim targeting inputs
        // (selected ids / niche / custom query) and the resolved population.
        const targetSnapshot: Record<string, unknown> = {
          mode,
          runBatchId,
          leadCount: leads.length,
          ...requestSnapshot,
        };
        const executions: PerLeadExecution[] = [];
        // Phase 6.8 — scale the kick stagger for large batches so creation
        // stays bounded (total pacing budget ~15s) instead of one giant
        // synchronous request; small batches keep the full provider-protection
        // stagger.
        const baseStagger = kickStaggerMs();
        const stagger = leads.length > 15
          ? Math.min(baseStagger, Math.max(0, Math.floor(15000 / leads.length)))
          : baseStagger;
        let kickError: unknown = null;
        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];
          try {
            const result = await executeWorkflow(
              id,
              user.id,
              {
                leadId: lead.id,
                leadName: lead.businessName,
                target: { ...targetSnapshot, leadId: lead.id },
              },
              `batch_${runBatchId}_${lead.id}`,
              { awaitCompletion: false }
            );
            executions.push({
              leadId: lead.id,
              leadName: lead.businessName,
              executionId: result.executionId,
              status: result.status,
              error: result.error,
            });
          } catch (kickErr) {
            // An internal preflight failure BEFORE any execution exists for
            // this lead — recorded and surfaced; the refund check below
            // releases the fee if NOTHING actually started.
            kickError = kickErr;
            executions.push({
              leadId: lead.id,
              leadName: lead.businessName,
              executionId: '',
              status: 'failed',
              error: kickErr instanceof Error ? kickErr.message : 'Failed to start execution',
            });
          }
          // Stagger kicks so concurrent outreach/email steps do not
          // stampede providers (mirrors autopilot pacing).
          if (i < leads.length - 1 && stagger > 0) await sleep(stagger);
        }

        // ── Part 2 §21 — reservation release ──
        // The flat fee was charged for THIS run; if an internal failure
        // prevented even ONE execution from being created (a genuine
        // preflight failure, not ordinary step failures), the run never
        // actually started and the fee is refunded — idempotently, so
        // retries of this code path can never double-refund.
        const anyStarted = executions.some((e) => Boolean(e.executionId));
        if (!anyStarted) {
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
              error: kickError instanceof Error
                ? `The run could not be started (${kickError.message}). The ${WORKFLOW_EXECUTION_FEE_CREDITS}-credit execution fee was refunded.`
                : `The run could not be started. The ${WORKFLOW_EXECUTION_FEE_CREDITS}-credit execution fee was refunded.`,
              code: 'RUN_START_FAILED',
              creditsRefunded: true,
              target: { mode, leadCount: leads.length, runBatchId },
              executions: executions.map(({ leadId, leadName, executionId, status, error }) => ({
                leadId, leadName, executionId, status, error,
              })),
            },
            { status: 500 }
          );
        }

        // Phase 6.8 — large batches respond immediately with honest 'running'
        // statuses (per-lead executions were already kicked in the
        // background); small batches keep the verified settle-and-aggregate
        // behavior so the response reports final per-lead outcomes.
        if (leads.length > batchSettleMaxLeads()) {
          return NextResponse.json(
            {
              executionId: executions[0]?.executionId,
              status: 'running',
              async: true,
              message: `${leads.length} targeted runs started in the background — monitor their outcomes on the Executions tab.`,
              target: { mode, leadCount: leads.length, runBatchId, runId: runKey },
              creditsCharged: WORKFLOW_EXECUTION_FEE_CREDITS,
              executions: executions.map(({ leadId, leadName, executionId, status, error }) => ({
                leadId, leadName, executionId, status, error,
              })),
            },
            { status: 202 }
          );
        }

        // 5. Wait for the batch to settle, then aggregate the persisted
        //    final states — the response reports what ACTUALLY happened.
        const realIds = executions.filter((e) => e.executionId).map((e) => e.executionId);
        if (realIds.length > 0) await waitForBatchSettle(realIds);
        const finalRows = realIds.length
          ? await db.workflowExecution.findMany({
              where: { id: { in: realIds } },
              select: { id: true, status: true, error: true },
            })
          : [];
        const byId = new Map(finalRows.map((r) => [r.id, r]));
        for (const e of executions) {
          const row = byId.get(e.executionId);
          if (row) {
            e.status = row.status;
            e.error = row.error || undefined;
          }
        }

        const completed = executions.filter((e) => e.status === 'completed').length;
        const failed = executions.filter((e) => e.status === 'failed' || e.status === 'exhausted');
        const overall: string = failed.length === 0
          ? 'completed'
          : completed === 0
            ? 'failed'
            : 'partial';

        return NextResponse.json(
          {
            executionId: executions[0]?.executionId,
            status: overall,
            error: failed.length > 0 ? (failed[0].error || 'One or more targeted runs failed.') : undefined,
            target: { mode, leadCount: leads.length, runBatchId, runId: runKey },
            creditsCharged: WORKFLOW_EXECUTION_FEE_CREDITS,
            executions: executions.map(({ leadId, leadName, executionId, status, error }) => ({
              leadId, leadName, executionId, status, error,
            })),
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

      // Execute the workflow
      const legacyTriggerData = (body.triggerData && typeof body.triggerData === 'object'
        ? body.triggerData
        : body) as Record<string, unknown>;
      const result = await executeWorkflow(
        id,
        user.id,
        legacyTriggerData,
        legacyRunKey
      );

      // ── Part 2 §21 — refund when the run never actually started ──
      // 'failed' with an executionId means a record exists and honestly
      // says why nothing ran (still a started-and-failed run — fee stands
      // per the explicit product rule). NO executionId at all (not found,
      // monthly execution limit, engine preflight) means NOTHING started:
      // the fee must be released, idempotently.
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

      // Return 202 Accepted with execution ID
      return NextResponse.json(
        {
          executionId: result.executionId,
          status: result.status,
          error: result.error,
          creditsCharged: WORKFLOW_EXECUTION_FEE_CREDITS,
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
