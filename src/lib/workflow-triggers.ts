// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Trigger Engine
// Phase 12: Evaluate triggers and fire matching workflows
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeWorkflow } from '@/lib/workflow-engine';

// ===== TYPES =====

export type WorkflowEventType =
  | 'lead_discovered'
  | 'lead_moved'
  | 'gmail_connected'
  | 'email_received'
  | 'telegram_received'
  | 'whatsapp_received'
  | 'payment_success'
  | 'trial_ending'
  | 'credits_low'
  | 'ai_completed'
  | 'score_change'
  | 'lead_reply'
  | 'webhook';

export interface TriggerEventData {
  leadId?: string;
  fromStage?: string;
  toStage?: string;
  scoreField?: string;
  scoreValue?: number;
  replyType?: string;
  channelId?: string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
}

// ===== EVALUATE TRIGGER =====

/**
 * Check if any active workflow matches this trigger event.
 * For each matching workflow, execute it.
 * Returns array of execution IDs started.
 */
export async function evaluateTrigger(
  eventType: WorkflowEventType | string,
  eventData: TriggerEventData,
  userId: string
): Promise<string[]> {
  try {
    // Find all active workflows with matching trigger type
    const matchingWorkflows = await db.workflowDefinition.findMany({
      where: {
        userId,
        status: 'active',
        triggerType: eventType,
      },
      select: { id: true, triggerConfig: true, name: true },
    });

    if (matchingWorkflows.length === 0) {
      return [];
    }

    const executionIds: string[] = [];

    for (const workflow of matchingWorkflows) {
      // Check if trigger config matches event data
      const configMatches = matchTriggerCondition(
        eventType,
        workflow.triggerConfig,
        eventData
      );

      if (configMatches) {
        // Generate idempotency key to prevent duplicate executions
        const idempotencyKey = `trigger_${eventType}_${workflow.id}_${eventData.leadId || 'no-lead'}_${Date.now()}`;

        const result = await executeWorkflow(
          workflow.id,
          userId,
          { eventType, ...eventData },
          idempotencyKey
        );

        if (result.executionId) {
          executionIds.push(result.executionId);
        }
      }
    }

    return executionIds;
  } catch (error) {
    console.error('[WorkflowTriggers] Failed to evaluate trigger:', error);
    return [];
  }
}

// ===== MATCH TRIGGER CONDITION =====

/**
 * Check if the trigger config matches the event data.
 * Returns true if the workflow should fire for this event.
 */
export function matchTriggerCondition(
  triggerType: string,
  triggerConfig: string | null,
  eventData: TriggerEventData
): boolean {
  // No config means match all events of this type
  if (!triggerConfig) return true;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(triggerConfig);
  } catch {
    return true; // Invalid config, match by default
  }

  switch (triggerType) {
    case 'lead_moved': {
      // Check fromStage/toStage conditions
      if (config.fromStage && config.fromStage !== eventData.fromStage) return false;
      if (config.toStage && config.toStage !== eventData.toStage) return false;
      return true;
    }

    case 'score_change': {
      // Check field, operator, value
      if (config.field && config.field !== eventData.scoreField) return false;
      if (config.operator && config.value !== undefined) {
        const threshold = Number(config.value);
        const actual = Number(eventData.scoreValue || 0);
        switch (config.operator) {
          case '>': return actual > threshold;
          case '>=': return actual >= threshold;
          case '<': return actual < threshold;
          case '<=': return actual <= threshold;
          case '==': return actual === threshold;
          default: return true;
        }
      }
      return true;
    }

    case 'lead_reply': {
      // Check reply type
      if (config.replyType && config.replyType !== 'any' && config.replyType !== eventData.replyType) {
        return false;
      }
      return true;
    }

    case 'credits_low': {
      // Check threshold
      if (config.threshold && eventData.scoreValue !== undefined) {
        return Number(eventData.scoreValue) <= Number(config.threshold);
      }
      return true;
    }

    case 'trial_ending': {
      // Check days threshold
      if (config.daysThreshold && eventData.scoreValue !== undefined) {
        return Number(eventData.scoreValue) <= Number(config.daysThreshold);
      }
      return true;
    }

    case 'scheduled': {
      // Scheduled triggers are handled by processScheduledTriggers
      return false;
    }

    case 'webhook': {
      // Webhook triggers are handled by the webhook endpoint
      return false;
    }

    default:
      return true;
  }
}

// ===== FIRE WORKFLOW TRIGGER =====

/**
 * Fire a workflow trigger — evaluate matching workflows and execute them.
 * Returns a structured result with execution IDs and count of triggered workflows.
 */
export async function fireWorkflowTrigger(
  triggerType: WorkflowEventType | string,
  triggerData: TriggerEventData,
  userId: string
): Promise<{ success: boolean; executionIds: string[]; triggeredCount: number; error?: string }> {
  try {
    const executionIds = await evaluateTrigger(triggerType, triggerData, userId);

    return {
      success: true,
      executionIds,
      triggeredCount: executionIds.length,
    };
  } catch (error) {
    console.error('[WorkflowTriggers] Failed to fire trigger:', error);
    return {
      success: false,
      executionIds: [],
      triggeredCount: 0,
      error: error instanceof Error ? error.message : 'Failed to fire trigger',
    };
  }
}

// ===== REGISTER TRIGGER =====

/**
 * Register a workflow trigger for future evaluation.
 * For now, this is a no-op since we query the DB directly.
 * In the future, this could populate a cache or event bus subscription.
 */
export async function registerWorkflowTrigger(
  workflowId: string,
  triggerType: string,
  triggerConfig: string | null
): Promise<void> {
  // The workflow is already stored in the DB with its triggerType and triggerConfig.
  // We just need to ensure the workflow is active.
  // No additional registration needed for our DB-based approach.
  console.log(`[WorkflowTriggers] Registered trigger: ${triggerType} for workflow ${workflowId}`);
}

// ===== UNREGISTER TRIGGER =====

/**
 * Unregister a workflow trigger.
 * For our DB-based approach, this is handled by deactivating the workflow.
 */
export async function unregisterWorkflowTrigger(
  workflowId: string
): Promise<void> {
  console.log(`[WorkflowTriggers] Unregistered trigger for workflow ${workflowId}`);
}

// ===== PROCESS SCHEDULED TRIGGERS =====

/**
 * Process scheduled/cron triggers. Called by the server-side scheduler
 * (POST /api/cron/workflow-scheduler, wired to the external cron gateway).
 *
 * Missed-job policy: if a scheduled tick was missed (process restart, cron
 * outage), the workflow still fires as long as "now" is within the catch-up
 * window (SCHEDULE_CATCHUP_MINUTES) of the scheduled time. Once-per-local-day
 * is enforced by the day-granular idempotency key, so catch-up can never
 * double-fire a workflow that already ran.
 */
export async function processScheduledTriggers(): Promise<string[]> {
  try {
    const now = new Date();

    // Find all active scheduled workflows
    const scheduledWorkflows = await db.workflowDefinition.findMany({
      where: {
        status: 'active',
        triggerType: 'scheduled',
      },
      select: { id: true, userId: true, triggerConfig: true, name: true },
    });

    const executionIds: string[] = [];

    for (const workflow of scheduledWorkflows) {
      if (!workflow.triggerConfig) continue;

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(workflow.triggerConfig);
      } catch {
        continue;
      }

      // Timezone-aware match with catch-up window (server-side execution —
      // never dependent on a browser tab).
      if (!shouldFireSchedule(config, now)) continue;

      // Day-granular idempotency keyed on the WORKFLOW's LOCAL date, so a
      // 08:00 Asia/Kolkata schedule dedupes on the Kolkata calendar day.
      const tz = scheduleTimezone(config);
      const dateKey = getZonedTimeParts(now, tz).dateKey;

      const result = await executeWorkflow(
        workflow.id,
        workflow.userId,
        { eventType: 'scheduled', firedAt: now.toISOString() },
        `scheduled_${workflow.id}_${dateKey}`
      );

      if (result.executionId) {
        executionIds.push(result.executionId);
      }
    }

    return executionIds;
  } catch (error) {
    console.error('[WorkflowTriggers] Failed to process scheduled triggers:', error);
    return [];
  }
}

// ===== SCHEDULE EVALUATOR (timezone-aware, with catch-up) =====

/** Missed-job catch-up window in minutes (see processScheduledTriggers). */
export const SCHEDULE_CATCHUP_MINUTES = 15;

/** Default timezone for workflow schedules (product spec). */
export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Kolkata';

export interface ZonedTimeParts {
  minute: number;
  hour: number;
  /** Day of month (1-based). */
  day: number;
  /** Month (1-based). */
  month: number;
  /** Day of week, 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** Minutes since local midnight. */
  minutesOfDay: number;
  /** Local calendar date key YYYY-MM-DD (used for per-day idempotency). */
  dateKey: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Resolve the workflow's schedule timezone from its trigger config. */
export function scheduleTimezone(config: Record<string, unknown>): string {
  const tz = config.timezone;
  return typeof tz === 'string' && tz.trim() ? tz.trim() : DEFAULT_SCHEDULE_TIMEZONE;
}

/**
 * Compute wall-clock parts for a Date in an IANA timezone using Intl.
 * Falls back to server-local time on an invalid timezone (never throws).
 */
export function getZonedTimeParts(date: Date, timeZone: string): ZonedTimeParts {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    const day = parseInt(parts.day, 10);
    const month = parseInt(parts.month, 10);
    const dayOfWeek = WEEKDAY_MAP[parts.weekday] ?? date.getDay();
    if (
      Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(day) || Number.isNaN(month)
    ) {
      throw new Error('unparseable zoned parts');
    }
    return {
      hour,
      minute,
      day,
      month,
      dayOfWeek,
      minutesOfDay: hour * 60 + minute,
      dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    };
  } catch {
    // Invalid/unsupported timezone → server-local fallback (legacy behavior).
    return {
      minute: date.getMinutes(),
      hour: date.getHours(),
      day: date.getDate(),
      month: date.getMonth() + 1,
      dayOfWeek: date.getDay(),
      minutesOfDay: date.getHours() * 60 + date.getMinutes(),
      dateKey: date.toISOString().split('T')[0],
    };
  }
}

function parseHHMM(time: string): { hours: number; minutes: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  return { hours: parseInt(m[1], 10), minutes: parseInt(m[2], 10) };
}

/**
 * Check if a schedule config should fire at the given time.
 * Supports: interval, daily, weekly, monthly, cron.
 *
 * All wall-clock comparisons happen in the workflow's configured timezone
 * (default: Asia/Kolkata). Daily/weekly/monthly/cron schedules fire within a
 * catch-up window after the scheduled minute (missed-job policy); the caller
 * enforces once-per-day via the idempotency key.
 */
export function shouldFireSchedule(config: Record<string, unknown>, now: Date): boolean {
  const scheduleType = String(config.frequency || config.type || 'daily');
  const tz = scheduleTimezone(config);
  const nowParts = getZonedTimeParts(now, tz);

  const withinWindowOf = (targetMinutes: number, targetDay?: number): boolean => {
    if (targetDay !== undefined && nowParts.dayOfWeek !== targetDay) return false;
    // Difference from the scheduled minute, tolerant to midnight wraparound.
    let diff = nowParts.minutesOfDay - targetMinutes;
    if (diff < 0) diff += 24 * 60;
    return diff >= 0 && diff <= SCHEDULE_CATCHUP_MINUTES;
  };

  switch (scheduleType) {
    case 'interval': {
      // Interval-based: fire when the zoned minute-of-day is a multiple of the
      // interval (self-healing — a missed tick fires at the next multiple).
      const intervalMinutes = Number(config.intervalMinutes || config.interval || 60);
      return intervalMinutes > 0 && nowParts.minutesOfDay % intervalMinutes === 0;
    }

    case 'daily': {
      // Daily at a specific time (product default: 08:00).
      const time = parseHHMM(String(config.time || '08:00'));
      if (!time) return false;
      return withinWindowOf(time.hours * 60 + time.minutes);
    }

    case 'weekly': {
      // Weekly on a specific day and time.
      const dayOfWeek = String(config.dayOfWeek || 'monday').toLowerCase();
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const targetDay = dayMap[dayOfWeek] ?? 1;
      const time = parseHHMM(String(config.time || '08:00'));
      if (!time) return false;
      return withinWindowOf(time.hours * 60 + time.minutes, targetDay);
    }

    case 'monthly': {
      // Monthly on a specific day.
      const dayOfMonth = Number(config.dayOfMonth || 1);
      const time = parseHHMM(String(config.time || '08:00'));
      if (!time) return false;
      return nowParts.day === dayOfMonth && withinWindowOf(time.hours * 60 + time.minutes);
    }

    case 'cron': {
      // Cron expression (basic patterns). With catch-up: the schedule matches
      // if ANY minute inside the catch-up window would have matched — this is
      // the missed-job policy for cron workflows.
      const cronExpr = String(config.cron || '0 8 * * *');
      for (let back = 0; back <= SCHEDULE_CATCHUP_MINUTES; back++) {
        const minuteDate = new Date(now.getTime() - back * 60_000);
        if (evaluateCron(cronExpr, getZonedTimeParts(minuteDate, tz))) return true;
      }
      return false;
    }

    default:
      return false;
  }
}

/**
 * Basic cron evaluator against PRE-COMPUTED zoned wall-clock parts.
 * Format: minute hour dayOfMonth month dayOfWeek
 * Supports: star, specific values, star-slash-n intervals, and comma lists.
 */
export function evaluateCron(expr: string, parts: ZonedTimeParts): boolean {
  const segments = expr.trim().split(/\s+/);
  if (segments.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = segments;

  return (
    cronPartMatches(minute, parts.minute) &&
    cronPartMatches(hour, parts.hour) &&
    cronPartMatches(dayOfMonth, parts.day) &&
    cronPartMatches(month, parts.month) &&
    cronPartMatches(dayOfWeek, parts.dayOfWeek)
  );
}

function cronPartMatches(part: string, value: number): boolean {
  if (part === '*') return true;
  if (part.startsWith('*/')) {
    const interval = parseInt(part.slice(2), 10);
    return interval > 0 && value % interval === 0;
  }
  if (part.includes(',')) {
    return part.split(',').some((p) => parseInt(p, 10) === value);
  }
  return parseInt(part, 10) === value;
}
