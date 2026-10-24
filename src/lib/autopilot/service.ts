// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Service (CRUD + state machine + entitlement)
//
// Server-side authority: plan/entitlement checks, ownership scoping,
// state-machine validation, and the ACTIVE+RUNNING slot limit all live
// here. The UI only mirrors what this service allows — it is never the
// enforcement layer.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import {
  getEntitlements,
  type PlanType,
} from '@/lib/entitlement-service';
import {
  AUTOPILOT_MAX_NICHES,
  AUTOPILOT_NICHE_MAX_LEN,
  canTransitionAutopilot,
  type AutopilotStatus,
} from './constants';
import {
  parseProfileMappings,
  resolveNicheSelection,
  validateProfileMappingsOwnership,
} from '@/lib/niches';
import {
  resolveCountrySelection,
  buildPersistedGeography,
  type AutopilotGeoSelection,
} from './country-selection';
import {
  computeInitialRunAt,
  computeNextRunAt,
  parsePersistedSchedule,
  parseScheduleInput,
  scheduleLabel,
  serializeSchedule,
  type ScheduleConfig,
} from './schedule';

// ===== PLAN NORMALIZATION =====

/**
 * Normalize a raw plan string from the session/user record to a PlanType.
 * Unknown / missing plans map to 'free' (safe-deny: an unrecognized plan
 * never gains Autopilot access). Case differences ('PRO') map onto the
 * canonical lowercase plans, but a plan value with no entitlement entry
 * (e.g. legacy 'enterprise') stays non-privileged.
 */
export function normalizePlan(plan?: string | null): PlanType {
  const p = (plan || 'free').toLowerCase();
  if (p === 'free' || p === 'starter' || p === 'pro' || p === 'elite') return p;
  return 'free';
}

/**
 * Server-side authoritative limits for Autopilot:
 *   free/starter → { enabled: false, limit: 0 }
 *   pro          → { enabled: true,  limit: 3 }
 *   elite        → { enabled: true,  limit: 7 }
 */
export function getAutopilotEntitlement(plan: PlanType): {
  enabled: boolean;
  limit: number;
} {
  const ent = getEntitlements(plan).autopilot_access;
  return { enabled: !!ent?.enabled, limit: ent?.limit ?? 0 };
}

/**
 * Count autopilots occupying an ACTIVE slot. Per the product rules:
 * ACTIVE and RUNNING both consume a slot (RUNNING counts so a
 * race between "start run" and "create/activate another autopilot"
 * cannot bypass the limit); DRAFT/PAUSED/COMPLETED/FAILED/DISABLED
 * do NOT consume a slot.
 */
export async function countActiveAutopilots(userId: string): Promise<number> {
  return db.autopilotWorkflow.count({
    where: { userId, status: { in: ['ACTIVE', 'RUNNING'] } },
  });
}

export interface AutopilotSlotCheck {
  allowed: boolean;
  reason?: string;
  limit: number;
  used: number;
}

/**
 * Verify the user's plan may run Autopilot AND has a free active slot.
 * Called on create (when status=ACTIVE), on activate, and on manual run.
 */
export async function checkAutopilotSlot(
  userId: string,
  rawPlan: string | null | undefined
): Promise<AutopilotSlotCheck> {
  const plan = normalizePlan(rawPlan);
  const ent = getAutopilotEntitlement(plan);
  const used = await countActiveAutopilots(userId);
  if (!ent.enabled || ent.limit <= 0) {
    return {
      allowed: false,
      reason:
        'PLAN_REQUIRED',
      limit: ent.limit,
      used,
    };
  }
  if (used >= ent.limit) {
    return {
      allowed: false,
      reason: `AUTOPILOT_LIMIT_REACHED: your ${plan} plan allows up to ${ent.limit} active Autopilot workflows and you currently have ${used}. Pause or complete one before creating another.`,
      limit: ent.limit,
      used,
    };
  }
  return { allowed: true, limit: ent.limit, used };
}

// ===== INPUT VALIDATION =====

export interface AutopilotGeo extends AutopilotGeoSelection {}

export interface ParsedAutopilotConfig {
  niches: string[];
  geography: AutopilotGeo;
  /** Phase 21 — validated country selection (countries in catalog
   * order; worldwide=true means global discovery). */
  countrySelection: { countries: string[]; worldwide: boolean };
}

/**
 * Validate + sanitize the multi-niche selection and geography.
 * Niches: non-empty array of 1..AUTOPILOT_MAX_NICHES trimmed strings,
 * deduplicated case-insensitively. Geography: { country?, city?,
 * countries? } — Phase 21 validates the multi-country selection through
 * the canonical country-selection service (catalog names/aliases/ISO
 * codes accepted, duplicates collapse, ordering canonicalized,
 * unknown entries REJECTED, Worldwide exclusive, bounded by
 * AUTOPILOT_MAX_COUNTRIES). The legacy single `country` string keeps
 * its historical shape-only bounding (≤100 chars) so existing rows and
 * callers continue to work unchanged.
 */
export function parseAutopilotConfig(
  niches: unknown,
  geography: unknown
): { ok: true; value: ParsedAutopilotConfig } | { ok: false; error: string } {
  if (!Array.isArray(niches) || niches.length === 0) {
    return { ok: false, error: 'At least one niche must be selected' };
  }
  if (niches.length > AUTOPILOT_MAX_NICHES) {
    return { ok: false, error: `At most ${AUTOPILOT_MAX_NICHES} niches can be selected` };
  }
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of niches) {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Each niche must be a string' };
    }
    const niche = raw.trim().substring(0, AUTOPILOT_NICHE_MAX_LEN);
    if (!niche) {
      return { ok: false, error: 'Niches must be non-empty strings' };
    }
    const key = niche.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(niche);
  }
  if (cleaned.length === 0) {
    return { ok: false, error: 'At least one niche must be selected' };
  }

  const geo: AutopilotGeo = {};
  let countrySelection: { countries: string[]; worldwide: boolean } = { countries: [], worldwide: true };
  if (geography !== undefined && geography !== null) {
    if (typeof geography !== 'object' || Array.isArray(geography)) {
      return { ok: false, error: 'geography must be an object { country?, city?, countries? }' };
    }
    const g = geography as Record<string, unknown>;
    // ── Phase 21 — canonical multi-country selection ──
    // Present (even empty) ⇒ authoritative; absent ⇒ Worldwide for new
    // configs (legacy single `country` still honored below for callers
    // that only send that field).
    if (g.countries !== undefined && g.countries !== null) {
      const selection = resolveCountrySelection(g.countries);
      if (!selection.ok) {
        return { ok: false, error: selection.error };
      }
      countrySelection = { countries: selection.countries, worldwide: selection.worldwide };
    } else if (g.country !== undefined && g.country !== null) {
      // Legacy single-country shape: validate it as a 0-or-1 selection
      // through the same canonical service (aliases/codes resolve;
      // unknown values rejected deterministically — no more silent
      // acceptance of arbitrary strings).
      const c = String(g.country).trim();
      if (!c) {
        return { ok: false, error: 'geography.country must be a non-empty string when provided' };
      }
      if (isWorldwideSelection(c)) {
        countrySelection = { countries: [], worldwide: true };
      } else {
        const selection = resolveCountrySelection([c]);
        if (!selection.ok) {
          return { ok: false, error: selection.error };
        }
        countrySelection = { countries: selection.countries, worldwide: selection.worldwide };
        geo.country = selection.countries[0];
      }
    }
    if (g.city !== undefined && g.city !== null) {
      const ci = String(g.city).trim().substring(0, 100);
      if (!ci) return { ok: false, error: 'geography.city must be a non-empty string when provided' };
      geo.city = ci;
    }
  }
  // Phase 21 — persist the canonical selection shape (countries key
  // only for individual countries; Worldwide keeps the legacy shape).
  const persisted = buildPersistedGeography(countrySelection, geo.city);
  return {
    ok: true,
    value: {
      niches: cleaned,
      geography: Object.keys(persisted).length > 0 ? persisted : {},
      countrySelection,
    },
  };
}

/** Case-insensitive Worldwide test for the legacy single-country field. */
function isWorldwideSelection(value: string): boolean {
  return value.trim().toLowerCase() === 'worldwide';
}

// ===== WORKFLOW ELIGIBILITY (Phase 19) =====

/**
 * A workflow the authenticated user may select for Autopilot. Derived
 * LIVE from the workflow system (never a fixed list) so newly created
 * active workflows appear automatically without code changes.
 */
export interface EligibleWorkflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  profileId: string | null;
  stepCount: number;
  updatedAt: string;
}

/**
 * Canonical eligibility rule for Autopilot workflows — ONE definition,
 * reused by the eligible-workflow listing, create/update validation,
 * and (as the run-time authority) the runner's pre-execution check:
 *   the workflow must exist AND belong to the user AND be active.
 * (runAutopilot independently enforces the same rule before any charge.)
 */
export async function listEligibleWorkflows(userId: string): Promise<EligibleWorkflow[]> {
  const rows = await db.workflowDefinition.findMany({
    where: { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { _count: { select: { workflowSteps: true } } },
  });
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description ?? null,
    status: w.status,
    triggerType: w.triggerType,
    profileId: w.profileId ?? null,
    stepCount: w._count?.workflowSteps ?? 0,
    updatedAt: w.updatedAt instanceof Date ? w.updatedAt.toISOString() : String(w.updatedAt),
  }));
}

export type WorkflowEligibility =
  | { ok: true; workflow: { id: string; name: string; status: string; profileId: string | null } }
  | { ok: false; code: 'NOT_FOUND' | 'INACTIVE'; workflowName?: string };

/**
 * Resolve ONE workflow's eligibility for Autopilot selection. A missing
 * row and a foreign user's row are deliberately indistinguishable
 * (NOT_FOUND) — no cross-user existence leak. INACTIVE carries the name
 * so callers can surface a clear, actionable error.
 */
export async function resolveAutopilotWorkflow(
  userId: string,
  workflowId: string
): Promise<WorkflowEligibility> {
  const wf = await db.workflowDefinition.findFirst({
    where: { id: workflowId, userId },
    select: { id: true, name: true, status: true, profileId: true },
  });
  if (!wf) return { ok: false, code: 'NOT_FOUND' };
  if (wf.status !== 'active') {
    return { ok: false, code: 'INACTIVE', workflowName: wf.name };
  }
  return { ok: true, workflow: { id: wf.id, name: wf.name, status: wf.status, profileId: wf.profileId ?? null } };
}

// ===== CRUD =====

export interface CreateAutopilotInput {
  name: string;
  niches: string[];
  geography: AutopilotGeo;
  workflowId: string;
  /** Phase 22 — legacy whitelist string OR canonical
   * {every, unit, timezone, startAt?, enabled?} object (validated
   * server-side through the canonical schedule module). */
  schedule: unknown;
  activate: boolean;
  /** Phase 20 — optional { [nicheKey]: businessProfileId } mapping. */
  profileMappings?: unknown;
}

export interface AutopilotMutationResult {
  success: boolean;
  error?: string;
  code?: string;
  autopilot?: {
    id: string;
    status: string;
    name: string;
  };
}

/**
 * Validate the linked workflow for SELECTION (Phase 19): must exist,
 * belong to the caller, AND be active. Deleted (archived), paused and
 * draft workflows are rejected with a clear error at selection time —
 * never silently substituted, never charged. (executeWorkflow
 * independently re-validates the same rule at run time — the runner
 * stays the final authority.)
 */
async function verifyWorkflowEligibility(
  userId: string,
  workflowId: string
): Promise<{ ok: boolean; error?: string }> {
  const eligibility = await resolveAutopilotWorkflow(userId, workflowId);
  if (!eligibility.ok) {
    if (eligibility.code === 'INACTIVE') {
      return {
        ok: false,
        error: `Workflow "${eligibility.workflowName}" is not active — activate it in Workflows first`,
      };
    }
    return { ok: false, error: 'Workflow not found for this account' };
  }
  return { ok: true };
}

export async function createAutopilot(
  userId: string,
  orgId: string | null,
  rawPlan: string | null | undefined,
  input: CreateAutopilotInput
): Promise<AutopilotMutationResult> {
  const name = input.name?.trim().substring(0, 200);
  if (!name) {
    return { success: false, error: 'Name is required', code: 'VALIDATION' };
  }
  // ── Phase 22 — canonical schedule validation (legacy string OR
  // configurable object; timezone/interval/start validated here,
  // server-side only — never trusted from the client). ──
  const scheduleParsed = parseScheduleInput(input.schedule);
  if (!scheduleParsed.ok) {
    return { success: false, error: scheduleParsed.error, code: 'VALIDATION' };
  }
  const scheduleConfig = scheduleParsed.config;
  const wfCheck = await verifyWorkflowEligibility(userId, input.workflowId);
  if (!wfCheck.ok) {
    return { success: false, error: wfCheck.error, code: 'VALIDATION' };
  }

  // ── Phase 20 — canonical niche resolution (server-side authority) ──
  // Every entry must be a predefined niche or one of the caller's OWN
  // saved custom niches (by name or `custom:<id>`). Foreign/unknown
  // niches are rejected BEFORE any row exists — no discovery, no charge.
  const shape = parseAutopilotConfig(input.niches, input.geography);
  if (!shape.ok) {
    return { success: false, error: shape.error, code: 'VALIDATION' };
  }
  const nicheSelection = await resolveNicheSelection(userId, shape.value.niches);
  if (!nicheSelection.ok) {
    return { success: false, error: nicheSelection.error, code: 'VALIDATION' };
  }
  const niches = nicheSelection.niches;

  // ── Phase 20 — profile mapping validation (ownership + shape) ──
  const mappings = parseProfileMappings(input.profileMappings, niches);
  if (!mappings.ok) {
    return { success: false, error: mappings.error, code: 'VALIDATION' };
  }
  const mappingOwnership = await validateProfileMappingsOwnership(userId, mappings.value);
  if (!mappingOwnership.ok) {
    return { success: false, error: mappingOwnership.error, code: 'VALIDATION' };
  }

  // Entitlement + slot limit — server-side, BEFORE any row is created.
  const desiredStatus: AutopilotStatus = input.activate ? 'ACTIVE' : 'DRAFT';
  if (input.activate) {
    const slot = await checkAutopilotSlot(userId, rawPlan);
    if (!slot.allowed) {
      return {
        success: false,
        error:
          slot.reason === 'PLAN_REQUIRED'
            ? 'This feature requires a Pro or Elite plan. Please upgrade.'
            : slot.reason,
        code: slot.reason === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : 'AUTOPILOT_LIMIT_REACHED',
      };
    }
  }

  const autopilot = await db.autopilotWorkflow.create({
    data: {
      userId,
      orgId,
      name,
      status: desiredStatus,
      niches: JSON.stringify(niches),
      // Phase 21 — the canonical geography (validated + normalized
      // country selection; Worldwide keeps the legacy JSON shape).
      geography: JSON.stringify(shape.value.geography),
      profileMappings: JSON.stringify(mappings.value),
      workflowId: input.workflowId,
      // Phase 22 — canonical schedule JSON (additive semantics on the
      // existing String column; legacy whitelist strings still parse).
      schedule: serializeSchedule(scheduleConfig),
      // Phase 22 — first run: anchored schedules → next wall-clock
      // occurrence in the schedule timezone; interval schedules keep
      // the Phase 18 ~60s activation grace. Disabled → not scheduled.
      nextRunAt:
        desiredStatus === 'ACTIVE'
          ? scheduleConfig.enabled
            ? computeInitialRunAt(scheduleConfig)
            : null
          : null,
    },
  });
  return { success: true, autopilot: { id: autopilot.id, status: autopilot.status, name: autopilot.name } };
}

export async function getAutopilotForUser(userId: string, id: string) {
  return db.autopilotWorkflow.findFirst({ where: { id, userId } });
}

/**
 * Apply a status transition (activate/pause/resume/complete/disable) with
 * state-machine + entitlement enforcement. Returning success=false with
 * code signals the API layer exactly what happened.
 */
export async function transitionAutopilot(
  userId: string,
  rawPlan: string | null | undefined,
  id: string,
  to: AutopilotStatus
): Promise<AutopilotMutationResult> {
  const autopilot = await getAutopilotForUser(userId, id);
  if (!autopilot) {
    return { success: false, error: 'Autopilot not found', code: 'NOT_FOUND' };
  }
  if (!canTransitionAutopilot(autopilot.status, to)) {
    return {
      success: false,
      error: `Invalid state transition ${autopilot.status} → ${to}`,
      code: 'INVALID_TRANSITION',
    };
  }
  // Activating (from DRAFT/PAUSED/FAILED) consumes an ACTIVE slot → re-check.
  if (to === 'ACTIVE') {
    const slot = await checkAutopilotSlot(userId, rawPlan);
    if (!slot.allowed) {
      return {
        success: false,
        error:
          slot.reason === 'PLAN_REQUIRED'
            ? 'This feature requires a Pro or Elite plan. Please upgrade.'
            : slot.reason,
        code: slot.reason === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : 'AUTOPILOT_LIMIT_REACHED',
      };
    }
  }
  // Phase 22 — canonical next-run recalculation on (re)activation:
  // a still-future nextRunAt survives; a stale/absent one is
  // recomputed from the persisted schedule config (timezone-aware).
  // A disabled schedule is never given a next run.
  const scheduleConfig = parsePersistedSchedule(autopilot.schedule);
  const resumeNextRunAt =
    !scheduleConfig.enabled
      ? null
      : autopilot.nextRunAt && autopilot.nextRunAt > new Date()
        ? autopilot.nextRunAt
        : computeNextRunAt(scheduleConfig);
  const updated = await db.autopilotWorkflow.update({
    where: { id: autopilot.id },
    data: {
      status: to,
      lastError: to === 'ACTIVE' ? null : autopilot.lastError,
      nextRunAt:
        to === 'ACTIVE'
          ? resumeNextRunAt
          : to === 'PAUSED' || to === 'COMPLETED' || to === 'DISABLED'
            ? null
            : autopilot.nextRunAt,
    },
  });
  return { success: true, autopilot: { id: updated.id, status: updated.status, name: updated.name } };
}

export interface UpdateAutopilotFields {
  name?: string;
  niches?: unknown;
  geography?: unknown;
  workflowId?: string;
  /** Phase 22 — legacy whitelist string OR canonical schedule object.
   * Only revalidated/rewritten when EXPLICITLY provided (a niches-only
   * update never touches the stored schedule). */
  schedule?: unknown;
  /** Phase 20 — { [nicheKey]: businessProfileId } (validated against the
   * effective niche selection — new niches when provided, else existing). */
  profileMappings?: unknown;
}

/** Update editable fields (never status — use transitionAutopilot). */
export async function updateAutopilotFields(
  userId: string,
  id: string,
  fields: UpdateAutopilotFields
): Promise<AutopilotMutationResult> {
  const autopilot = await getAutopilotForUser(userId, id);
  if (!autopilot) {
    return { success: false, error: 'Autopilot not found', code: 'NOT_FOUND' };
  }
  const data: Record<string, unknown> = {};
  if (fields.name !== undefined) {
    const name = String(fields.name).trim().substring(0, 200);
    if (!name) return { success: false, error: 'Name cannot be empty', code: 'VALIDATION' };
    data.name = name;
  }

  // ── Phase 20 — niche updates resolve through the canonical service ──
  // (predefined or the caller's OWN custom niches; foreign/unknown
  // rejected before any row changes). Legacy rows that never touch
  // `niches` keep working unchanged.
  // ── Phase 21 — geography is only revalidated/rewritten when the
  // caller EXPLICITLY sends it: a niches-only update must never be
  // blocked by (nor silently rewrite) a pre-Phase-21 stored geography. ──
  let effectiveNiches: string[] | null = null;
  if (fields.niches !== undefined || fields.geography !== undefined) {
    const parsed = parseAutopilotConfig(
      fields.niches !== undefined ? fields.niches : JSON.parse(autopilot.niches),
      fields.geography !== undefined ? fields.geography : undefined
    );
    if (!parsed.ok) {
      return { success: false, error: parsed.error, code: 'VALIDATION' };
    }
    let niches = parsed.value.niches;
    if (fields.niches !== undefined) {
      const nicheSelection = await resolveNicheSelection(userId, parsed.value.niches);
      if (!nicheSelection.ok) {
        return { success: false, error: nicheSelection.error, code: 'VALIDATION' };
      }
      niches = nicheSelection.niches;
    }
    effectiveNiches = niches;
    if (fields.niches !== undefined) {
      data.niches = JSON.stringify(niches);
    }
    if (fields.geography !== undefined) {
      data.geography = JSON.stringify(parsed.value.geography);
    }
  }

  // ── Phase 20 — profile mapping updates (shape + ownership) ──
  // Not provided → existing mappings are kept verbatim (non-destructive;
  // the runner only reads mappings for niches that are actually selected,
  // so an orphaned key after a niche removal is inert, never harmful).
  if (fields.profileMappings !== undefined) {
    const selected = effectiveNiches ?? parseJsonArray(autopilot.niches);
    const mappings = parseProfileMappings(fields.profileMappings, selected);
    if (!mappings.ok) {
      return { success: false, error: mappings.error, code: 'VALIDATION' };
    }
    const ownership = await validateProfileMappingsOwnership(userId, mappings.value);
    if (!ownership.ok) {
      return { success: false, error: ownership.error, code: 'VALIDATION' };
    }
    data.profileMappings = JSON.stringify(mappings.value);
  }

  if (fields.workflowId !== undefined) {
    const wfId = String(fields.workflowId).trim();
    if (!wfId) {
      return { success: false, error: 'Workflow not found for this account', code: 'VALIDATION' };
    }
    const check = await verifyWorkflowEligibility(userId, wfId);
    if (!check.ok) {
      return { success: false, error: check.error, code: 'VALIDATION' };
    }
    data.workflowId = wfId;
  }
  if (fields.schedule !== undefined) {
    // ── Phase 22 — canonical schedule update (validate → persist →
    // recompute nextRunAt). An ACTIVE autopilot's next run follows the
    // NEW config immediately (anchored → next wall-clock occurrence;
    // interval → now + interval). A disabled schedule clears the next
    // run. Non-ACTIVE rows keep nextRunAt null (set on activation). ──
    const scheduleParsed = parseScheduleInput(fields.schedule);
    if (!scheduleParsed.ok) {
      return { success: false, error: scheduleParsed.error, code: 'VALIDATION' };
    }
    data.schedule = serializeSchedule(scheduleParsed.config);
    if (autopilot.status === 'ACTIVE') {
      data.nextRunAt = scheduleParsed.config.enabled
        ? computeNextRunAt(scheduleParsed.config)
        : null;
    }
  }
  const updated = await db.autopilotWorkflow.update({
    where: { id: autopilot.id },
    data,
  });
  return { success: true, autopilot: { id: updated.id, status: updated.status, name: updated.name } };
}

/** Tolerant parse of a stored niches JSON array (legacy-safe). */
function parseJsonArray(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/** Delete an autopilot and (cascade-style, explicit) its runs + ledger rows. */
export async function deleteAutopilot(userId: string, id: string): Promise<AutopilotMutationResult> {
  const autopilot = await getAutopilotForUser(userId, id);
  if (!autopilot) {
    return { success: false, error: 'Autopilot not found', code: 'NOT_FOUND' };
  }
  if (autopilot.status === 'RUNNING') {
    return {
      success: false,
      error: 'Autopilot is currently running — wait for the run to finish or pause it first.',
      code: 'RUNNING',
    };
  }
  await db.autopilotLead.deleteMany({ where: { autopilotId: autopilot.id } });
  await db.autopilotRun.deleteMany({ where: { autopilotId: autopilot.id } });
  await db.autopilotWorkflow.delete({ where: { id: autopilot.id } });
  return { success: true };
}

// ===== LISTING =====

export interface AutopilotListItem {
  id: string;
  name: string;
  status: string;
  niches: string[];
  geography: AutopilotGeo;
  workflowId: string;
  // Phase 19 — linked-workflow health for the UI: null when the workflow
  // no longer exists (deleted); present-but-ineligible when paused/draft/
  // archived. The autopilot config itself is NEVER auto-deleted — the
  // user relinks a valid workflow to recover.
  workflow: { id: string; name: string; status: string } | null;
  workflowEligible: boolean;
  // Phase 20 — persisted { [nicheKey]: businessProfileId } mapping.
  profileMappings: Record<string, string>;
  schedule: string;
  // Phase 22 — canonical schedule config (parsed from the schedule
  // column) + human label for the UI. `schedule` stays the raw stored
  // string for backward compatibility.
  scheduleConfig: ScheduleConfig;
  scheduleLabel: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  runCount: number;
  totalDiscovered: number;
  totalSaved: number;
  totalProcessed: number;
  totalExecutions: number;
  createdAt: string;
}

function serializeAutopilot(
  a: {
    id: string;
    name: string;
    status: string;
    niches: string;
    geography: string;
    profileMappings: string;
    workflowId: string;
    schedule: string;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastError: string | null;
    runCount: number;
    totalDiscovered: number;
    totalSaved: number;
    totalProcessed: number;
    totalExecutions: number;
    createdAt: Date;
  },
  workflow: { id: string; name: string; status: string } | null
): AutopilotListItem {
  let niches: string[] = [];
  let geography: AutopilotGeo = {};
  let profileMappings: Record<string, string> = {};
  try { niches = JSON.parse(a.niches); } catch { niches = []; }
  try { geography = JSON.parse(a.geography); } catch { geography = {}; }
  try { profileMappings = JSON.parse(a.profileMappings); } catch { profileMappings = {}; }
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    niches,
    geography,
    workflowId: a.workflowId,
    workflow,
    workflowEligible: !!workflow && workflow.status === 'active',
    profileMappings,
    schedule: a.schedule,
    // Phase 22 — canonical schedule config (tolerant parse: legacy
    // whitelist strings resolve to equivalent configs) + human label.
    scheduleConfig: parsePersistedSchedule(a.schedule),
    scheduleLabel: scheduleLabel(a.schedule),
    lastRunAt: a.lastRunAt ? a.lastRunAt.toISOString() : null,
    nextRunAt: a.nextRunAt ? a.nextRunAt.toISOString() : null,
    lastError: a.lastError,
    runCount: a.runCount,
    totalDiscovered: a.totalDiscovered,
    totalSaved: a.totalSaved,
    totalProcessed: a.totalProcessed,
    totalExecutions: a.totalExecutions,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * List the caller's autopilots with linked-workflow health (Phase 19):
 * ONE extra batched query resolves every distinct workflowId — user-
 * scoped, so a foreign or missing workflow resolves to null (eligible=false)
 * without leaking anything. Derived live; no stored state to drift.
 */
export async function listAutopilots(userId: string): Promise<AutopilotListItem[]> {
  const rows = await db.autopilotWorkflow.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const wfIds = [...new Set(rows.map((r) => r.workflowId).filter(Boolean))];
  const workflows = wfIds.length
    ? await db.workflowDefinition.findMany({
        where: { userId, id: { in: wfIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const wfById = new Map(workflows.map((w) => [w.id, w]));
  return rows.map((r) => serializeAutopilot(r, wfById.get(r.workflowId) ?? null));
}
