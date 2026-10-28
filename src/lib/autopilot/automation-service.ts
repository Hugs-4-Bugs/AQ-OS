// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 1 — Automation Service (Objective CRUD)
//
// CRUD wrapper around the extended AutopilotWorkflow model.
//
// "Automation" = a persistent user-defined autonomous objective.
// Mirrors the existing AutopilotWorkflow table (Phase 18), extended
// in Part 1 with timezone, event triggers, business scoping, and
// permission/approval/execution/model-strategy policy documents.
//
// This service is the ONLY sanctioned entry point for creating /
// updating Automation rows. Direct prisma writes from API routes
// should go through here so the JSON policy documents stay validated.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { computeNextRunAt, parsePersistedSchedule } from './schedule';
import { randomUUID } from 'crypto';

export type AutomationStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'WAITING'
  | 'RUNNING'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface EventTriggerSpec {
  eventType:
    | 'new_lead'
    | 'new_email'
    | 'follow_up_due'
    | 'approval_response'
    | 'external_webhook';
  enabled: boolean;
  filter?: Record<string, unknown>;
  source?: string;
}

export interface ExecutionPolicy {
  autoResume?: boolean;
  maxConcurrentInvocations?: number;
  maxRetries?: number;
  backoffMs?: number;
  leaseTimeoutMs?: number;
  requireApprovalFor?: string[];
}

export interface ApprovalPolicy {
  mode?: 'auto' | 'escalate_high_risk' | 'always_require';
  escalationChannel?: 'in_app' | 'telegram' | 'none';
  expireAfterMs?: number;
}

export interface PermissionsPolicy {
  allowedTools?: string[];
  deniedTools?: string[];
  dataScope?: {
    ownLeadsOnly?: boolean;
    ownBusinessOnly?: boolean;
  };
}

export interface ModelStrategyConfig {
  strategy: 'single' | 'sequential' | 'parallel';
  models?: Array<{
    provider?: string;
    model?: string;
    role?: string;
  }>;
  concurrency?: number;
}

export interface CreateAutomationInput {
  userId: string;
  businessId?: string | null;
  name: string;
  niches?: string[];
  geography?: Record<string, unknown>;
  profileMappings?: Record<string, string>;
  workflowId: string;
  schedule?: string;
  timezone?: string;
  eventTriggers?: EventTriggerSpec[];
  executionPolicy?: ExecutionPolicy;
  approvalPolicy?: ApprovalPolicy;
  permissionsPolicy?: PermissionsPolicy;
  modelStrategyConfig?: ModelStrategyConfig | null;
  /** Initial status — defaults to DRAFT. */
  status?: AutomationStatus;
  orgId?: string | null;
}

export interface UpdateAutomationInput {
  name?: string;
  niches?: string[];
  geography?: Record<string, unknown>;
  profileMappings?: Record<string, string>;
  schedule?: string;
  timezone?: string | null;
  eventTriggers?: EventTriggerSpec[];
  executionPolicy?: ExecutionPolicy;
  approvalPolicy?: ApprovalPolicy;
  permissionsPolicy?: PermissionsPolicy;
  modelStrategyConfig?: ModelStrategyConfig | null;
  status?: AutomationStatus;
  businessId?: string | null;
}

export interface AutomationRecord {
  id: string;
  userId: string;
  businessId: string | null;
  name: string;
  status: AutomationStatus;
  niches: string[];
  geography: Record<string, unknown>;
  profileMappings: Record<string, string>;
  workflowId: string;
  schedule: string;
  timezone: string | null;
  eventTriggers: EventTriggerSpec[];
  executionPolicy: ExecutionPolicy;
  approvalPolicy: ApprovalPolicy;
  permissionsPolicy: PermissionsPolicy;
  modelStrategyConfig: ModelStrategyConfig | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastError: string | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: {
  id: string;
  userId: string;
  businessId: string | null;
  orgId: string | null;
  name: string;
  status: string;
  niches: string;
  geography: string;
  profileMappings: string;
  workflowId: string;
  schedule: string;
  timezone: string | null;
  eventTriggers: string;
  executionPolicy: string;
  approvalPolicy: string;
  permissionsPolicy: string;
  modelStrategyConfig: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastError: string | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}): AutomationRecord {
  return {
    id: row.id,
    userId: row.userId,
    businessId: row.businessId,
    name: row.name,
    status: row.status as AutomationStatus,
    niches: safeParseArray(row.niches),
    geography: safeParseObj(row.geography),
    profileMappings: safeParseObj(row.profileMappings) as Record<string, string>,
    workflowId: row.workflowId,
    schedule: row.schedule,
    timezone: row.timezone,
    eventTriggers: safeParseArray(row.eventTriggers),
    executionPolicy: safeParseObj(row.executionPolicy),
    approvalPolicy: safeParseObj(row.approvalPolicy),
    permissionsPolicy: safeParseObj(row.permissionsPolicy),
    modelStrategyConfig: row.modelStrategyConfig
      ? safeParseObj(row.modelStrategyConfig) as ModelStrategyConfig
      : null,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    lastError: row.lastError,
    runCount: row.runCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create a new Automation. Generates nextRunAt for ACTIVE automations.
 */
export async function createAutomation(
  input: CreateAutomationInput,
): Promise<AutomationRecord> {
  const status = input.status ?? 'DRAFT';
  const schedule = input.schedule ?? 'daily';

  // Compute nextRunAt only if ACTIVE — drafts wait.
  let nextRunAt: Date | null = null;
  if (status === 'ACTIVE') {
    try {
      const parsed = parsePersistedSchedule({
        kind: 'interval',
        interval: schedule as 'hourly' | 'every_6_hours' | 'every_12_hours' | 'daily' | 'weekly',
      });
      nextRunAt = computeNextRunAt(parsed, new Date());
    } catch {
      // If schedule parsing fails, fall back to "now + 1 hour" so the
      // automation still fires. The user can correct the schedule later.
      nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  const row = await db.autopilotWorkflow.create({
    data: {
      userId: input.userId,
      orgId: input.orgId ?? null,
      businessId: input.businessId ?? null,
      name: input.name,
      status,
      niches: JSON.stringify(input.niches ?? []),
      geography: JSON.stringify(input.geography ?? {}),
      profileMappings: JSON.stringify(input.profileMappings ?? {}),
      workflowId: input.workflowId,
      schedule,
      timezone: input.timezone ?? null,
      eventTriggers: JSON.stringify(input.eventTriggers ?? []),
      executionPolicy: JSON.stringify(input.executionPolicy ?? {}),
      approvalPolicy: JSON.stringify(input.approvalPolicy ?? {}),
      permissionsPolicy: JSON.stringify(input.permissionsPolicy ?? {}),
      modelStrategyConfig: input.modelStrategyConfig
        ? JSON.stringify(input.modelStrategyConfig)
        : null,
      nextRunAt,
    },
  });
  return toRecord(row);
}

/**
 * Update an existing Automation. Re-derives nextRunAt when schedule or
 * timezone change AND the automation is ACTIVE.
 */
export async function updateAutomation(
  automationId: string,
  input: UpdateAutomationInput,
  /** Caller userId for isolation. The automation MUST belong to this user. */
  callerUserId: string,
): Promise<AutomationRecord | null> {
  // Load first to enforce user isolation.
  const existing = await db.autopilotWorkflow.findFirst({
    where: { id: automationId, userId: callerUserId },
  });
  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.niches !== undefined) patch.niches = JSON.stringify(input.niches);
  if (input.geography !== undefined) patch.geography = JSON.stringify(input.geography);
  if (input.profileMappings !== undefined)
    patch.profileMappings = JSON.stringify(input.profileMappings);
  if (input.schedule !== undefined) patch.schedule = input.schedule;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.eventTriggers !== undefined)
    patch.eventTriggers = JSON.stringify(input.eventTriggers);
  if (input.executionPolicy !== undefined)
    patch.executionPolicy = JSON.stringify(input.executionPolicy);
  if (input.approvalPolicy !== undefined)
    patch.approvalPolicy = JSON.stringify(input.approvalPolicy);
  if (input.permissionsPolicy !== undefined)
    patch.permissionsPolicy = JSON.stringify(input.permissionsPolicy);
  if (input.modelStrategyConfig !== undefined)
    patch.modelStrategyConfig = input.modelStrategyConfig
      ? JSON.stringify(input.modelStrategyConfig)
      : null;
  if (input.businessId !== undefined) patch.businessId = input.businessId;

  // Recompute nextRunAt if the schedule changed or the automation was
  // just activated.
  const newStatus = input.status ?? (existing.status as AutomationStatus);
  const newSchedule = (input.schedule ?? existing.schedule) as
    | 'hourly'
    | 'every_6_hours'
    | 'every_12_hours'
    | 'daily'
    | 'weekly';

  if (newStatus === 'ACTIVE' && (input.schedule || input.timezone || input.status)) {
    try {
      const parsed = parsePersistedSchedule({ kind: 'interval', interval: newSchedule });
      patch.nextRunAt = computeNextRunAt(parsed, new Date());
    } catch {
      patch.nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
    }
  }
  if (newStatus === 'PAUSED' || newStatus === 'DRAFT') {
    // Don't fire while paused/drafting — clear the alarm clock.
    patch.nextRunAt = null;
  }
  if (input.status !== undefined) patch.status = input.status;

  if (Object.keys(patch).length === 0) {
    return toRecord(existing);
  }

  const row = await db.autopilotWorkflow.update({
    where: { id: automationId },
    data: patch,
  });
  return toRecord(row);
}

/**
 * Fetch a single Automation. Enforces user isolation.
 */
export async function getAutomation(
  automationId: string,
  callerUserId: string,
): Promise<AutomationRecord | null> {
  const row = await db.autopilotWorkflow.findFirst({
    where: { id: automationId, userId: callerUserId },
  });
  return row ? toRecord(row) : null;
}

/**
 * List a user's automations. Filters by status / businessId if provided.
 */
export async function listAutomations(input: {
  userId: string;
  businessId?: string;
  status?: AutomationStatus;
  limit?: number;
  cursor?: string;
}): Promise<AutomationRecord[]> {
  const rows = await db.autopilotWorkflow.findMany({
    where: {
      userId: input.userId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  return rows.map(toRecord);
}

/**
 * Transition automation status. Used by the unified trigger to flip
 * ACTIVE → RUNNING when an invocation starts, and back when it ends.
 *
 * Returns the new record, or null if the automation doesn't belong to
 * the caller (or doesn't exist).
 */
export async function transitionAutomationStatus(input: {
  automationId: string;
  to: AutomationStatus;
  /** Optional caller (the invoking user) — enforced for direct UI calls. */
  callerUserId?: string;
  lastError?: string | null;
  lastRunAt?: Date;
}): Promise<AutomationRecord | null> {
  const where: Record<string, unknown> = { id: input.automationId };
  if (input.callerUserId) where.userId = input.callerUserId;

  const existing = await db.autopilotWorkflow.findFirst({ where });
  if (!existing) return null;

  const row = await db.autopilotWorkflow.update({
    where: { id: input.automationId },
    data: {
      status: input.to,
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.lastRunAt ? { lastRunAt: input.lastRunAt } : {}),
      runCount: input.to === 'RUNNING' ? existing.runCount : existing.runCount,
    },
  });
  return toRecord(row);
}

/**
 * Delete is CANCELLED-then-soft-purge: we don't physically delete the
 * row (audit / linked runs), but we mark it CANCELLED and clear the
 * next alarm clock. Hard-delete is intentionally NOT exposed — the
 * existing Phase 18 runner respects CANCELLED as a terminal state.
 */
export async function cancelAutomation(
  automationId: string,
  callerUserId: string,
): Promise<AutomationRecord | null> {
  const where: Record<string, unknown> = { id: automationId };
  if (callerUserId) where.userId = callerUserId;
  const existing = await db.autopilotWorkflow.findFirst({ where });
  if (!existing) return null;
  // Single update — set status=CANCELLED + clear nextRunAt atomically.
  const row = await db.autopilotWorkflow.update({
    where: { id: automationId },
    data: {
      status: 'CANCELLED',
      nextRunAt: null,
      lastError: null,
    },
  });
  return toRecord(row);
}

function safeParseArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeParseObj(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Generate a deterministic idempotency key for a manual invocation.
 * Manual invocations are unique per (automationId, epochMs) — never
 * collapse two manual clicks onto the same row.
 */
export function manualIdempotencyKey(automationId: string, at: Date = new Date()): string {
  return `manual:${automationId}:${at.getTime()}:${randomUUID().slice(0, 8)}`;
}

/**
 * Generate a deterministic idempotency key for a scheduled invocation.
 * Two scheduler ticks landing on the same slot converge on the same key
 * → the unique constraint on AutopilotRun.idempotencyKey guarantees
 * the second tick is a no-op.
 */
export function scheduleIdempotencyKey(
  automationId: string,
  slotEpochMs: number,
): string {
  return `schedule:${automationId}:${slotEpochMs}`;
}

/**
 * Generate a deterministic idempotency key for an event-triggered
 * invocation. Two duplicate events with the same AgentEvent.id converge
 * on the same key → no duplicate invocation.
 */
export function eventIdempotencyKey(
  automationId: string,
  triggerEventId: string,
): string {
  return `event:${automationId}:${triggerEventId}`;
}
