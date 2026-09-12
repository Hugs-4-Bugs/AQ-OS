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
 * Process scheduled/cron triggers.
 * Called by Celery Beat to check if any scheduled workflows should fire.
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

      // Check if schedule matches current time
      if (shouldFireSchedule(config, now)) {
        const result = await executeWorkflow(
          workflow.id,
          workflow.userId,
          { eventType: 'scheduled', firedAt: now.toISOString() },
          `scheduled_${workflow.id}_${now.toISOString().split('T')[0]}`
        );

        if (result.executionId) {
          executionIds.push(result.executionId);
        }
      }
    }

    return executionIds;
  } catch (error) {
    console.error('[WorkflowTriggers] Failed to process scheduled triggers:', error);
    return [];
  }
}

// ===== SCHEDULE EVALUATOR =====

/**
 * Check if a schedule config should fire at the given time.
 * Supports: interval, daily, cron
 */
function shouldFireSchedule(config: Record<string, unknown>, now: Date): boolean {
  const scheduleType = String(config.frequency || config.type || 'daily');

  switch (scheduleType) {
    case 'interval': {
      // Interval-based: check if enough time has passed since last execution
      // For simplicity, we check if the current minute is a multiple of the interval
      const intervalMinutes = Number(config.intervalMinutes || config.interval || 60);
      const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
      return minutesSinceMidnight % intervalMinutes === 0;
    }

    case 'daily': {
      // Daily at a specific time
      const time = String(config.time || '09:00');
      const [hours, minutes] = time.split(':').map(Number);
      return now.getHours() === hours && now.getMinutes() === minutes;
    }

    case 'weekly': {
      // Weekly on a specific day and time
      const dayOfWeek = String(config.dayOfWeek || 'monday').toLowerCase();
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const targetDay = dayMap[dayOfWeek] ?? 1;
      const time = String(config.time || '09:00');
      const [hours, minutes] = time.split(':').map(Number);
      return now.getDay() === targetDay && now.getHours() === hours && now.getMinutes() === minutes;
    }

    case 'monthly': {
      // Monthly on a specific day
      const dayOfMonth = Number(config.dayOfMonth || 1);
      const time = String(config.time || '09:00');
      const [hours, minutes] = time.split(':').map(Number);
      return now.getDate() === dayOfMonth && now.getHours() === hours && now.getMinutes() === minutes;
    }

    case 'cron': {
      // Cron expression (simplified — only handles basic patterns)
      // For a full cron implementation, use a library like cron-parser
      const cronExpr = String(config.cron || '0 9 * * *');
      return evaluateCron(cronExpr, now);
    }

    default:
      return false;
  }
}

/**
 * Very basic cron evaluator.
 * Format: minute hour dayOfMonth month dayOfWeek
 * Supports: star, specific values, and star-slash-n intervals
 */
function evaluateCron(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return (
    cronPartMatches(minute, now.getMinutes()) &&
    cronPartMatches(hour, now.getHours()) &&
    cronPartMatches(dayOfMonth, now.getDate()) &&
    cronPartMatches(month, now.getMonth() + 1) &&
    cronPartMatches(dayOfWeek, now.getDay())
  );
}

function cronPartMatches(part: string, value: number): boolean {
  if (part === '*') return true;
  if (part.startsWith('*/')) {
    const interval = parseInt(part.slice(2), 10);
    return interval > 0 && value % interval === 0;
  }
  return parseInt(part, 10) === value;
}
