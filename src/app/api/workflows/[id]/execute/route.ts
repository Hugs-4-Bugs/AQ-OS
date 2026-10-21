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
import { db } from '@/lib/db';

// ===== TYPES =====

type TargetMode = 'selected_leads' | 'niche' | 'custom';

interface RunTarget {
  mode?: string;
  leadIds?: unknown;
  niche?: string;
  customQuery?: string;
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

/** Resolve a niche/industry target against the caller's own active leads. */
async function resolveNicheLeads(userId: string, niche: string): Promise<ResolvedLead[]> {
  // SQLite `contains` is case-insensitive for ASCII by default, but we need
  // an EXACT (case-insensitive) niche match, so widen with contains then
  // filter in JS — keeps the query index-friendly on SQLite.
  const candidates = await db.lead.findMany({
    where: { userId, isActive: true, deletedAt: null, niche: { contains: niche } },
    select: { id: true, businessName: true, niche: true, city: true, stage: true },
    take: 500,
  });
  const wanted = niche.toLowerCase();
  return candidates.filter((l) => (l.niche || '').toLowerCase() === wanted);
}

/** Resolve a custom free-text target against the caller's own active leads. */
async function resolveCustomLeads(userId: string, query: string): Promise<ResolvedLead[]> {
  const q = query.toLowerCase();
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
    select: { id: true, businessName: true, niche: true, city: true, stage: true },
    take: 500,
  });
  // Case-insensitive re-check (SQLite contains is ASCII-case-insensitive;
  // this keeps behavior consistent for non-ASCII locales too).
  return candidates.filter((l) =>
    [l.businessName, l.niche, l.city, (l as ResolvedLead & { ownerName?: string | null }).ownerName]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

/** Wait until all batched executions reach a terminal state (or timeout). */
async function waitForBatchSettle(executionIds: string[]): Promise<void> {
  const deadline = Date.now() + batchSettleTimeoutMs();
  while (Date.now() < deadline) {
    const rows = await db.workflowExecution.findMany({
      where: { id: { in: executionIds } },
      select: { status: true },
    });
    const settled = rows.every((r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled');
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

      // Verify ownership
      const workflow = await db.workflowDefinition.findFirst({
        where: { id, userId: user.id },
      });

      if (!workflow) {
        return NextResponse.json(
          { error: 'Workflow not found' },
          { status: 404 }
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
          if (leadIds.length > 1000) {
            return NextResponse.json(
              { success: false, error: 'Too many lead ids in one request (max 1000).', code: 'REQUEST_TOO_LARGE' },
              { status: 400 }
            );
          }

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
          leads = await resolveNicheLeads(user.id, niche);
          if (leads.length === 0) {
            return NextResponse.json(
              { success: false, error: `No active leads match the niche "${niche}". Discover leads in that niche first.`, code: 'NO_LEADS_FOR_NICHE' },
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
          leads = await resolveCustomLeads(user.id, customQuery);
          if (leads.length === 0) {
            return NextResponse.json(
              { success: false, error: `No active leads match "${customQuery}".`, code: 'NO_LEADS_FOR_QUERY' },
              { status: 400 }
            );
          }
        }

        // 4. Kick one execution per lead (persisted target snapshot on each)
        const runBatchId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        const executions: PerLeadExecution[] = [];
        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];
          const result = await executeWorkflow(
            id,
            user.id,
            {
              leadId: lead.id,
              leadName: lead.businessName,
              target: { mode, runBatchId, leadId: lead.id },
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
          // Stagger kicks so concurrent outreach/email steps do not
          // stampede providers (mirrors autopilot pacing).
          const stagger = kickStaggerMs();
          if (i < leads.length - 1 && stagger > 0) await sleep(stagger);
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
        const failed = executions.filter((e) => e.status === 'failed');
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
            target: { mode, leadCount: leads.length, runBatchId },
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

      // Execute the workflow
      const legacyTriggerData = (body.triggerData && typeof body.triggerData === 'object'
        ? body.triggerData
        : body) as Record<string, unknown>;
      const result = await executeWorkflow(
        id,
        user.id,
        legacyTriggerData,
        typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined
      );

      if (result.status === 'failed' && !result.executionId) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      // Return 202 Accepted with execution ID
      return NextResponse.json(
        {
          executionId: result.executionId,
          status: result.status,
          error: result.error,
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
