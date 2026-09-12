// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM + Meeting Sync Service
// Full CRM synchronization on meeting lifecycle events:
// - Pipeline stage advancement with validation
// - Lead activity tracking
// - Deal/opportunity updates
// - Stage transition rules enforcement
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** CRM sync actions */
export type CRMAction =
  | 'meeting_scheduled'
  | 'meeting_rescheduled'
  | 'meeting_completed'
  | 'meeting_cancelled'
  | 'meeting_no_show';

/** Pipeline stage identifiers */
export type PipelineStage =
  | 'interested'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'proposal_pending'
  | 'negotiation'
  | 'won'
  | 'lost';

/** Pipeline stage with metadata */
export interface PipelineStageInfo {
  id: PipelineStage;
  name: string;
  order: number;
  description: string;
  color: string;
}

/** Stage transition validation result */
export interface StageTransitionResult {
  valid: boolean;
  reason?: string;
  currentStage: string;
  targetStage: string;
}

/** Meeting history item for a lead */
export interface LeadMeetingHistoryItem {
  id: string;
  title: string;
  status: string;
  meetingType: string;
  platform: string;
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;
  notes?: string | null;
  meetingUrl?: string | null;
  leadStageAtTime?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — Standard Pipeline Stages
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[CRMSync]';

/** Standard pipeline stages with metadata */
const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    id: 'interested',
    name: 'Interested',
    order: 1,
    description: 'Lead has shown interest — initial contact made',
    color: '#3b82f6', // blue-500
  },
  {
    id: 'meeting_scheduled',
    name: 'Meeting Scheduled',
    order: 2,
    description: 'A meeting has been scheduled with the lead',
    color: '#8b5cf6', // violet-500
  },
  {
    id: 'meeting_completed',
    name: 'Meeting Completed',
    order: 3,
    description: 'The meeting with the lead has taken place',
    color: '#0d9488', // teal-600
  },
  {
    id: 'proposal_pending',
    name: 'Proposal Pending',
    order: 4,
    description: 'A proposal is being prepared or has been sent',
    color: '#f59e0b', // amber-500
  },
  {
    id: 'negotiation',
    name: 'Negotiation',
    order: 5,
    description: 'Active negotiation on pricing/scope',
    color: '#ef4444', // red-500
  },
  {
    id: 'won',
    name: 'Won',
    order: 6,
    description: 'Deal closed successfully',
    color: '#22c55e', // green-500
  },
  {
    id: 'lost',
    name: 'Lost',
    order: 7,
    description: 'Deal lost — lead is no longer pursuing',
    color: '#6b7280', // gray-500
  },
];

/** Valid forward stage transitions */
const VALID_TRANSITIONS: Record<string, PipelineStage[]> = {
  discovered: ['interested', 'lost'],
  interested: ['meeting_scheduled', 'lost'],
  meeting_scheduled: ['meeting_completed', 'interested', 'lost'],
  meeting_completed: ['proposal_pending', 'negotiation', 'won', 'lost'],
  proposal_pending: ['negotiation', 'won', 'lost'],
  negotiation: ['won', 'lost', 'proposal_pending'],
  won: [], // Terminal stage
  lost: ['interested'], // Can re-engage a lost lead
};

/** CRM action to target stage mapping */
const ACTION_STAGE_MAP: Record<CRMAction, PipelineStage | null> = {
  meeting_scheduled: 'meeting_scheduled',
  meeting_rescheduled: null, // Keep current stage
  meeting_completed: 'meeting_completed',
  meeting_cancelled: 'interested', // Move back to interested
  meeting_no_show: 'interested', // Move back to interested
};

// ═══════════════════════════════════════════════════════════════════
// 1. SYNC MEETING WITH CRM — Full CRM sync on meeting events
// ═══════════════════════════════════════════════════════════════════

/**
 * Synchronize a meeting event with the CRM system.
 * Handles pipeline stage advancement, activity logging, and deal updates.
 *
 * @param meetingId - The meeting ID to sync
 * @param action - The CRM action that triggered the sync
 * @returns Sync result with updated entities
 */
export async function syncMeetingWithCRM(
  meetingId: string,
  action?: CRMAction
): Promise<{
  leadUpdated: boolean;
  dealUpdated: boolean;
  activityCreated: boolean;
  stageAdvanced: boolean;
  errors: string[];
}> {
  console.log(`${LOG_PREFIX} Syncing meeting ${meetingId} with CRM (action: ${action || 'auto'})`);

  const result = {
    leadUpdated: false,
    dealUpdated: false,
    activityCreated: false,
    stageAdvanced: false,
    errors: [] as string[],
  };

  try {
    // 1. Fetch the meeting with related entities
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true, deal: true },
    });

    if (!meeting) {
      result.errors.push(`Meeting ${meetingId} not found`);
      return result;
    }

    // Determine the action if not provided
    const crmAction: CRMAction = action || inferCRMAction(meeting.status);

    // 2. Create lead activity record
    try {
      await createLeadActivityForMeeting(meetingId, crmAction);
      result.activityCreated = true;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to create lead activity:`, error);
      result.errors.push('Failed to create lead activity');
    }

    // 3. Advance lead pipeline stage
    if (meeting.leadId) {
      try {
        const targetStage = ACTION_STAGE_MAP[crmAction];
        if (targetStage) {
          const advanceResult = await advanceLeadStage(meeting.leadId, targetStage);
          result.leadUpdated = advanceResult.success;
          result.stageAdvanced = advanceResult.advanced;
          if (!advanceResult.success && advanceResult.reason) {
            result.errors.push(advanceResult.reason);
          }
        } else {
          result.leadUpdated = true; // No stage change needed
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to advance lead stage:`, error);
        result.errors.push('Failed to advance lead stage');
      }
    }

    // 4. Update deal/opportunity
    if (meeting.dealId) {
      try {
        await updateDealAfterMeeting(meetingId, crmAction);
        result.dealUpdated = true;
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to update deal:`, error);
        result.errors.push('Failed to update deal');
      }
    }

    console.log(`${LOG_PREFIX} CRM sync complete for meeting ${meetingId}:`, result);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error syncing meeting with CRM:`, error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown CRM sync error');
  }

  return result;
}

/**
 * Infer the CRM action from the meeting status.
 */
function inferCRMAction(meetingStatus: string): CRMAction {
  switch (meetingStatus) {
    case 'scheduled':
    case 'confirmed':
      return 'meeting_scheduled';
    case 'rescheduled':
      return 'meeting_rescheduled';
    case 'completed':
      return 'meeting_completed';
    case 'cancelled':
      return 'meeting_cancelled';
    default:
      return 'meeting_scheduled';
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. ADVANCE LEAD STAGE — Advance lead pipeline stage with validation
// ═══════════════════════════════════════════════════════════════════

/**
 * Advance a lead's pipeline stage with validation.
 * Only allows forward transitions (or specific backward transitions).
 *
 * @param leadId - The lead to advance
 * @param stage - The target stage
 * @returns Result with success status and reason
 */
export async function advanceLeadStage(
  leadId: string,
  stage: PipelineStage
): Promise<{
  success: boolean;
  advanced: boolean;
  previousStage?: string;
  newStage?: string;
  reason?: string;
}> {
  console.log(`${LOG_PREFIX} Advancing lead ${leadId} to stage: ${stage}`);

  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { stage: true, businessName: true },
    });

    if (!lead) {
      return { success: false, advanced: false, reason: `Lead ${leadId} not found` };
    }

    const currentStage = lead.stage;

    // No change needed
    if (currentStage === stage) {
      return {
        success: true,
        advanced: false,
        previousStage: currentStage,
        newStage: currentStage,
      };
    }

    // Validate the transition
    const validation = validateStageTransition(currentStage, stage);
    if (!validation.valid) {
      console.warn(`${LOG_PREFIX} Invalid stage transition: ${currentStage} → ${stage}: ${validation.reason}`);
      return {
        success: false,
        advanced: false,
        previousStage: currentStage,
        reason: validation.reason,
      };
    }

    // Update the lead stage
    await db.lead.update({
      where: { id: leadId },
      data: {
        stage,
        lastContactedAt: new Date(),
      },
    });

    console.log(`${LOG_PREFIX} Lead ${leadId} stage advanced: ${currentStage} → ${stage}`);

    return {
      success: true,
      advanced: true,
      previousStage: currentStage,
      newStage: stage,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error advancing lead stage:`, error);
    return {
      success: false,
      advanced: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. CREATE LEAD ACTIVITY FOR MEETING — Create lead activity records
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a lead activity record for a meeting event.
 *
 * @param meetingId - The meeting that triggered the activity
 * @param action - The CRM action
 * @param details - Optional additional details
 * @returns The created activity ID or null
 */
export async function createLeadActivityForMeeting(
  meetingId: string,
  action: CRMAction,
  details?: Record<string, unknown>
): Promise<string | null> {
  console.log(`${LOG_PREFIX} Creating lead activity for meeting ${meetingId}, action: ${action}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      select: {
        leadId: true,
        title: true,
        status: true,
        startDateTime: true,
        endDateTime: true,
        meetingType: true,
        platform: true,
        durationMinutes: true,
      },
    });

    if (!meeting || !meeting.leadId) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found or has no lead`);
      return null;
    }

    // Build activity description
    const descriptions: Record<CRMAction, string> = {
      meeting_scheduled: `Meeting "${meeting.title}" scheduled for ${formatDateTime(meeting.startDateTime)}`,
      meeting_rescheduled: `Meeting "${meeting.title}" rescheduled to ${formatDateTime(meeting.startDateTime)}`,
      meeting_completed: `Meeting "${meeting.title}" completed (${meeting.durationMinutes} min)`,
      meeting_cancelled: `Meeting "${meeting.title}" was cancelled`,
      meeting_no_show: `Meeting "${meeting.title}" — lead did not show up`,
    };

    const activity = await db.leadActivity.create({
      data: {
        leadId: meeting.leadId,
        type: `meeting_${action}`,
        description: descriptions[action] || `Meeting "${meeting.title}" — ${action}`,
        metadata: JSON.stringify({
          meetingId,
          action,
          meetingType: meeting.meetingType,
          platform: meeting.platform,
          durationMinutes: meeting.durationMinutes,
          scheduledAt: meeting.startDateTime.toISOString(),
          ...details,
        }),
      },
    });

    console.log(`${LOG_PREFIX} Lead activity created: ${activity.id}`);
    return activity.id;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating lead activity:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. GET MEETING PIPELINE STAGES — Return the standard pipeline stages
// ═══════════════════════════════════════════════════════════════════

/**
 * Return the standard meeting pipeline stages with metadata.
 * These are the stages a lead progresses through in the acquisition pipeline.
 *
 * @returns Array of pipeline stage info objects
 */
export function getMeetingPipelineStages(): PipelineStageInfo[] {
  return [...PIPELINE_STAGES];
}

// ═══════════════════════════════════════════════════════════════════
// 5. VALIDATE STAGE TRANSITION — Validate stage transitions
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate whether a stage transition is allowed.
 * Enforces forward progression and specific backward transitions.
 *
 * @param currentStage - The current pipeline stage
 * @param targetStage - The desired target stage
 * @returns Validation result with reason if invalid
 */
export function validateStageTransition(
  currentStage: string,
  targetStage: string
): StageTransitionResult {
  // Allow if stages are the same (no-op)
  if (currentStage === targetStage) {
    return {
      valid: true,
      currentStage,
      targetStage,
    };
  }

  // Check if the target is a valid transition from the current stage
  const allowedTransitions = VALID_TRANSITIONS[currentStage];

  if (!allowedTransitions) {
    return {
      valid: false,
      reason: `Unknown current stage: "${currentStage}"`,
      currentStage,
      targetStage,
    };
  }

  if (!allowedTransitions.includes(targetStage as PipelineStage)) {
    // Special case: always allow moving to 'lost'
    if (targetStage === 'lost') {
      return {
        valid: true,
        currentStage,
        targetStage,
      };
    }

    return {
      valid: false,
      reason: `Cannot transition from "${currentStage}" to "${targetStage}". Allowed: [${allowedTransitions.join(', ')}]`,
      currentStage,
      targetStage,
    };
  }

  return {
    valid: true,
    currentStage,
    targetStage,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 6. GET LEAD MEETING HISTORY — Get complete meeting history for a lead
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the complete meeting history for a lead.
 * Includes all meetings (scheduled, completed, cancelled, etc.) ordered by date.
 *
 * @param leadId - The lead whose meeting history to fetch
 * @returns Array of meeting history items
 */
export async function getLeadMeetingHistory(
  leadId: string
): Promise<LeadMeetingHistoryItem[]> {
  console.log(`${LOG_PREFIX} Getting meeting history for lead ${leadId}`);

  try {
    const meetings = await db.meeting.findMany({
      where: { leadId },
      select: {
        id: true,
        title: true,
        status: true,
        meetingType: true,
        platform: true,
        startDateTime: true,
        endDateTime: true,
        durationMinutes: true,
        notes: true,
        meetingUrl: true,
        createdAt: true,
        lead: {
          select: { stage: true },
        },
      },
      orderBy: { startDateTime: 'desc' },
    });

    return meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      meetingType: meeting.meetingType,
      platform: meeting.platform,
      startDateTime: meeting.startDateTime,
      endDateTime: meeting.endDateTime,
      durationMinutes: meeting.durationMinutes,
      notes: meeting.notes,
      meetingUrl: meeting.meetingUrl,
      leadStageAtTime: meeting.lead?.stage,
      createdAt: meeting.createdAt,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting lead meeting history:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. UPDATE DEAL AFTER MEETING — Update deal/opportunity after meeting events
// ═══════════════════════════════════════════════════════════════════

/**
 * Update a deal/opportunity after a meeting event.
 * Advances the deal status to match the CRM action.
 *
 * @param meetingId - The meeting that triggered the update
 * @param action - The CRM action
 * @returns Update result
 */
export async function updateDealAfterMeeting(
  meetingId: string,
  action: CRMAction
): Promise<{
  updated: boolean;
  dealId?: string;
  previousStatus?: string;
  newStatus?: string;
  error?: string;
}> {
  console.log(`${LOG_PREFIX} Updating deal after meeting ${meetingId}, action: ${action}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      select: { dealId: true },
    });

    if (!meeting || !meeting.dealId) {
      return { updated: false, error: 'No deal associated with this meeting' };
    }

    const deal = await db.deal.findUnique({
      where: { id: meeting.dealId },
      select: { id: true, status: true },
    });

    if (!deal) {
      return { updated: false, error: `Deal ${meeting.dealId} not found` };
    }

    // Map CRM action to deal status
    const dealStatusMap: Record<CRMAction, string | null> = {
      meeting_scheduled: 'meeting_scheduled',
      meeting_rescheduled: null, // No status change
      meeting_completed: 'meeting_completed',
      meeting_cancelled: 'draft', // Move back to draft
      meeting_no_show: 'draft', // Move back to draft
    };

    const newStatus = dealStatusMap[action];
    if (!newStatus) {
      return { updated: true, dealId: deal.id, previousStatus: deal.status, newStatus: deal.status };
    }

    // Update deal status
    await db.deal.update({
      where: { id: deal.id },
      data: { status: newStatus },
    });

    console.log(`${LOG_PREFIX} Deal ${deal.id} updated: ${deal.status} → ${newStatus}`);

    return {
      updated: true,
      dealId: deal.id,
      previousStatus: deal.status,
      newStatus,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating deal after meeting:`, error);
    return {
      updated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a date for display in activity descriptions.
 */
function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
