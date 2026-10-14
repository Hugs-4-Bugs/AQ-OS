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
  isAutopilotSchedule,
  type AutopilotStatus,
} from './constants';

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

export interface AutopilotGeo {
  country?: string;
  city?: string;
}

export interface ParsedAutopilotConfig {
  niches: string[];
  geography: AutopilotGeo;
}

/**
 * Validate + sanitize the multi-niche selection and geography.
 * Niches: non-empty array of 1..AUTOPILOT_MAX_NICHES trimmed strings,
 * deduplicated case-insensitively. Geography: { country?, city? } with
 * the same bounding the discovery route applies.
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
  if (geography !== undefined && geography !== null) {
    if (typeof geography !== 'object' || Array.isArray(geography)) {
      return { ok: false, error: 'geography must be an object { country?, city? }' };
    }
    const g = geography as Record<string, unknown>;
    if (g.country !== undefined && g.country !== null) {
      const c = String(g.country).trim().substring(0, 100);
      if (!c) return { ok: false, error: 'geography.country must be a non-empty string when provided' };
      geo.country = c;
    }
    if (g.city !== undefined && g.city !== null) {
      const ci = String(g.city).trim().substring(0, 100);
      if (!ci) return { ok: false, error: 'geography.city must be a non-empty string when provided' };
      geo.city = ci;
    }
  }
  return { ok: true, value: { niches: cleaned, geography: geo } };
}

// ===== CRUD =====

export interface CreateAutopilotInput {
  name: string;
  niches: string[];
  geography: AutopilotGeo;
  workflowId: string;
  schedule: string;
  activate: boolean;
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
 * Validate the linked workflow: must exist AND belong to the caller.
 * (executeWorkflow additionally requires status=active at run time.)
 */
async function verifyWorkflowOwnership(userId: string, workflowId: string): Promise<boolean> {
  const wf = await db.workflowDefinition.findFirst({
    where: { id: workflowId, userId },
    select: { id: true },
  });
  return !!wf;
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
  if (!isAutopilotSchedule(input.schedule)) {
    return { success: false, error: 'Invalid schedule', code: 'VALIDATION' };
  }
  const wfOk = await verifyWorkflowOwnership(userId, input.workflowId);
  if (!wfOk) {
    return { success: false, error: 'Workflow not found for this account', code: 'VALIDATION' };
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
      niches: JSON.stringify(input.niches),
      geography: JSON.stringify(input.geography),
      workflowId: input.workflowId,
      schedule: input.schedule,
      nextRunAt: desiredStatus === 'ACTIVE' ? new Date(Date.now() + 60000) : null,
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
  const updated = await db.autopilotWorkflow.update({
    where: { id: autopilot.id },
    data: {
      status: to,
      lastError: to === 'ACTIVE' ? null : autopilot.lastError,
      nextRunAt:
        to === 'ACTIVE'
          ? autopilot.nextRunAt && autopilot.nextRunAt > new Date()
            ? autopilot.nextRunAt
            : new Date(Date.now() + 60000)
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
  schedule?: string;
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
  if (fields.niches !== undefined || fields.geography !== undefined) {
    const parsed = parseAutopilotConfig(
      fields.niches !== undefined ? fields.niches : JSON.parse(autopilot.niches),
      fields.geography !== undefined ? fields.geography : JSON.parse(autopilot.geography)
    );
    if (!parsed.ok) {
      return { success: false, error: parsed.error, code: 'VALIDATION' };
    }
    data.niches = JSON.stringify(parsed.value.niches);
    data.geography = JSON.stringify(parsed.value.geography);
  }
  if (fields.workflowId !== undefined) {
    const wfId = String(fields.workflowId).trim();
    const ok = await verifyWorkflowOwnership(userId, wfId);
    if (!ok) {
      return { success: false, error: 'Workflow not found for this account', code: 'VALIDATION' };
    }
    data.workflowId = wfId;
  }
  if (fields.schedule !== undefined) {
    if (!isAutopilotSchedule(fields.schedule)) {
      return { success: false, error: 'Invalid schedule', code: 'VALIDATION' };
    }
    data.schedule = fields.schedule;
  }
  const updated = await db.autopilotWorkflow.update({
    where: { id: autopilot.id },
    data,
  });
  return { success: true, autopilot: { id: updated.id, status: updated.status, name: updated.name } };
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
  schedule: string;
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

function serializeAutopilot(a: {
  id: string;
  name: string;
  status: string;
  niches: string;
  geography: string;
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
}): AutopilotListItem {
  let niches: string[] = [];
  let geography: AutopilotGeo = {};
  try { niches = JSON.parse(a.niches); } catch { niches = []; }
  try { geography = JSON.parse(a.geography); } catch { geography = {}; }
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    niches,
    geography,
    workflowId: a.workflowId,
    schedule: a.schedule,
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

export async function listAutopilots(userId: string): Promise<AutopilotListItem[]> {
  const rows = await db.autopilotWorkflow.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(serializeAutopilot);
}
