// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomy Engine for Meeting Approval Workflows
// Manages the three autonomy modes:
// - approval: All meetings require explicit user approval
// - assisted: AI suggests with context, user approves
// - autonomous: AI auto-schedules based on learned preferences
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';
import { sendMeetingApprovalRequest } from '@/lib/meeting/meeting-email';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Autonomy mode for meeting scheduling */
export type AutonomyMode = 'approval' | 'assisted' | 'autonomous';

/** Intent data from AI detection or user input */
export interface IntentData {
  leadId?: string;
  leadName?: string;
  clientEmail?: string;
  clientName?: string;
  meetingTitle: string;
  meetingType?: 'video' | 'phone' | 'in-person';
  platform?: string;
  suggestedStartDateTime?: Date;
  suggestedEndDateTime?: Date;
  suggestedDurationMinutes?: number;
  timezone?: string;
  agenda?: string;
  sourceType?: string; // 'email' | 'chat' | 'whatsapp' | 'telegram' | 'manual'
  sourceId?: string;
  confidence: number;
  originalText?: string;
  detectedIntent?: string;
}

/** Meeting data for scheduling */
export interface MeetingScheduleData {
  userId: string;
  leadId?: string;
  dealId?: string;
  title: string;
  description?: string;
  meetingType?: 'video' | 'phone' | 'in-person';
  platform?: string;
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes?: number;
  timezone?: string;
  agenda?: Array<{ title: string; durationMinutes?: number; description?: string }>;
  attendees?: Array<{ email: string; name?: string; status?: string }>;
  location?: string;
  reminders?: Array<{ minutesBefore: number; type: 'email' | 'notification' | 'both' }>;
  createdBy: 'user' | 'ai_suggestion' | 'ai_auto';
  metadata?: Record<string, unknown>;
}

/** Approval request stored in meeting metadata */
export interface ApprovalRequest {
  meetingId: string;
  userId: string;
  autonomyMode: AutonomyMode;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  requestedBy: 'ai' | 'user';
  reason: string;
  modifications?: Record<string, unknown>;
  resolvedAt?: Date;
  resolvedBy?: string;
  rejectionReason?: string;
}

/** Action result from autonomy determination */
export interface AutonomyAction {
  action: 'auto_schedule' | 'request_approval' | 'request_assisted_approval' | 'reject';
  reason: string;
  autonomyMode: AutonomyMode;
  approvalRequest?: ApprovalRequest;
  meetingData?: MeetingScheduleData;
}

/** Pending approval item */
export interface PendingApproval {
  meetingId: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  durationMinutes: number;
  platform: string;
  leadId?: string;
  leadName?: string;
  clientName?: string;
  clientEmail?: string;
  requestedAt: Date;
  requestedBy: string;
  reason: string;
  approvalStatus: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[AutonomyEngine]';

/** Minimum confidence threshold for autonomous scheduling */
const AUTONOMOUS_CONFIDENCE_THRESHOLD = 0.8;

/** Minimum confidence threshold for assisted mode */
const ASSISTED_CONFIDENCE_THRESHOLD = 0.5;

/** Default autonomy mode for new users */
const DEFAULT_AUTONOMY_MODE: AutonomyMode = 'approval';

// ═══════════════════════════════════════════════════════════════════
// 1. DETERMINE AUTONOMY ACTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine what action to take based on the user's autonomy mode
 * and the intent data from AI detection.
 *
 * @param userId - The user whose autonomy settings to check
 * @param intentData - The detected meeting intent data
 * @returns The action to take with reasoning
 */
export async function determineAutonomyAction(
  userId: string,
  intentData: IntentData
): Promise<AutonomyAction> {
  console.log(`${LOG_PREFIX} Determining autonomy action for user ${userId}`);

  try {
    // 1. Get user's autonomy mode from settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: {
        meetingAutonomyMode: true,
        meetingAutoSchedule: true,
        meetingPlatform: true,
        meetingDurationDefault: true,
        meetingTimezone: true,
      },
    });

    const autonomyMode = (settings?.meetingAutonomyMode as AutonomyMode) ||
      (settings?.meetingAutoSchedule ? 'autonomous' : DEFAULT_AUTONOMY_MODE);

    const confidence = intentData.confidence;

    // 2. Determine action based on mode and confidence
    switch (autonomyMode) {
      case 'autonomous': {
        // Auto-schedule if confidence is high enough
        if (confidence >= AUTONOMOUS_CONFIDENCE_THRESHOLD) {
          const meetingData = buildMeetingData(userId, intentData, settings, 'ai_auto');
          return {
            action: 'auto_schedule',
            reason: `Autonomous mode: confidence ${confidence.toFixed(2)} meets threshold ${AUTONOMOUS_CONFIDENCE_THRESHOLD}`,
            autonomyMode,
            meetingData,
          };
        }

        // Fall back to assisted approval for lower confidence
        if (confidence >= ASSISTED_CONFIDENCE_THRESHOLD) {
          return {
            action: 'request_assisted_approval',
            reason: `Autonomous mode but confidence ${confidence.toFixed(2)} below threshold ${AUTONOMOUS_CONFIDENCE_THRESHOLD}. Suggesting assisted approval.`,
            autonomyMode,
          };
        }

        // Very low confidence — request full approval
        return {
          action: 'request_approval',
          reason: `Low confidence (${confidence.toFixed(2)}). Full approval required even in autonomous mode.`,
          autonomyMode,
        };
      }

      case 'assisted': {
        // In assisted mode, always request approval but with more context
        if (confidence >= ASSISTED_CONFIDENCE_THRESHOLD) {
          return {
            action: 'request_assisted_approval',
            reason: `Assisted mode: confidence ${confidence.toFixed(2)}. Scheduling suggestion with context provided.`,
            autonomyMode,
          };
        }

        // Low confidence — full approval needed
        return {
          action: 'request_approval',
          reason: `Assisted mode: low confidence (${confidence.toFixed(2)}). Full approval required.`,
          autonomyMode,
        };
      }

      case 'approval':
      default: {
        // Always require explicit approval
        return {
          action: 'request_approval',
          reason: `Approval mode: all meetings require explicit user approval.`,
          autonomyMode: 'approval',
        };
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error determining autonomy action:`, error);
    // Default to approval mode on error (safest option)
    return {
      action: 'request_approval',
      reason: `Error determining autonomy mode. Defaulting to approval for safety.`,
      autonomyMode: 'approval',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. REQUEST MEETING APPROVAL
// ═══════════════════════════════════════════════════════════════════

/**
 * Create an approval request for a meeting.
 * Creates a meeting record with pending_approval status and sends
 * approval request notification/email to the user.
 *
 * @param userId - The user who needs to approve
 * @param meetingData - The meeting data to get approval for
 * @returns The created meeting ID and approval request
 */
export async function requestMeetingApproval(
  userId: string,
  meetingData: MeetingScheduleData
): Promise<{
  meetingId: string;
  approvalRequest: ApprovalRequest;
  notificationSent: boolean;
  emailSent: boolean;
}> {
  console.log(`${LOG_PREFIX} Requesting meeting approval for user ${userId}`);

  try {
    // Get user's autonomy mode
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { meetingAutonomyMode: true },
    });

    const autonomyMode = (settings?.meetingAutonomyMode as AutonomyMode) || DEFAULT_AUTONOMY_MODE;

    // 1. Create the meeting with pending_approval status
    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId: meetingData.leadId || null,
        dealId: meetingData.dealId || null,
        title: meetingData.title,
        description: meetingData.description || null,
        meetingType: meetingData.meetingType || 'video',
        platform: meetingData.platform || 'google_meet',
        startDateTime: meetingData.startDateTime,
        endDateTime: meetingData.endDateTime,
        durationMinutes: meetingData.durationMinutes || 30,
        timezone: meetingData.timezone || 'UTC',
        agenda: meetingData.agenda ? JSON.stringify(meetingData.agenda) : null,
        attendees: JSON.stringify(meetingData.attendees || []),
        location: meetingData.location || null,
        reminders: JSON.stringify(meetingData.reminders || [
          { minutesBefore: 60, type: 'email' },
          { minutesBefore: 15, type: 'notification' },
        ]),
        createdBy: meetingData.createdBy,
        approvalStatus: 'pending',
        status: 'pending_approval',
        metadata: JSON.stringify({
          ...meetingData.metadata,
          approvalRequest: {
            autonomyMode,
            requestedBy: meetingData.createdBy === 'ai_auto' || meetingData.createdBy === 'ai_suggestion' ? 'ai' : 'user',
            requestedAt: new Date().toISOString(),
            reason: `Meeting suggested by ${meetingData.createdBy === 'ai_suggestion' ? 'AI assistant' : meetingData.createdBy === 'ai_auto' ? 'AI (auto)' : 'user'}`,
          },
        }),
      },
    });

    // 2. Build the approval request
    const approvalRequest: ApprovalRequest = {
      meetingId: meeting.id,
      userId,
      autonomyMode,
      status: 'pending',
      requestedAt: new Date(),
      requestedBy: meetingData.createdBy === 'ai_auto' || meetingData.createdBy === 'ai_suggestion' ? 'ai' : 'user',
      reason: `Meeting suggested by ${meetingData.createdBy === 'ai_suggestion' ? 'AI assistant' : meetingData.createdBy === 'ai_auto' ? 'AI (auto)' : 'user'}`,
    };

    // 3. Send in-app notification
    let notificationSent = false;
    try {
      await sendNotification({
        userId,
        type: 'meeting_approval',
        title: 'Meeting Approval Required',
        message: `"${meetingData.title}" needs your approval${meetingData.leadId ? ` (Lead: ${meetingData.metadata?.leadName || 'unknown'})` : ''}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          approvalStatus: 'pending',
          autonomyMode,
          startDateTime: meetingData.startDateTime.toISOString(),
          leadId: meetingData.leadId,
        },
      });
      notificationSent = true;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send approval notification:`, error);
    }

    // 4. Send approval request email
    let emailSent = false;
    try {
      const emailResult = await sendMeetingApprovalRequest({
        userId,
        meetingId: meeting.id,
        meetingTitle: meetingData.title,
        leadName: meetingData.metadata?.leadName as string | undefined,
        leadId: meetingData.leadId,
        startDateTime: meetingData.startDateTime,
        endDateTime: meetingData.endDateTime,
        timezone: meetingData.timezone || 'UTC',
        durationMinutes: meetingData.durationMinutes || 30,
        platform: meetingData.platform || 'google_meet',
        suggestedBy: approvalRequest.requestedBy,
        reason: approvalRequest.reason,
        clientEmail: meetingData.attendees?.[0]?.email,
        clientName: meetingData.attendees?.[0]?.name,
      });
      emailSent = emailResult.sent;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send approval email:`, error);
    }

    console.log(`${LOG_PREFIX} Approval request created for meeting ${meeting.id}`);

    return {
      meetingId: meeting.id,
      approvalRequest,
      notificationSent,
      emailSent,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error requesting meeting approval:`, error);
    throw error instanceof Error ? error : new Error('Failed to request meeting approval');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. APPROVE MEETING
// ═══════════════════════════════════════════════════════════════════

/**
 * Approve a pending meeting and activate it.
 * Optionally apply modifications before approval.
 *
 * @param meetingId - The meeting to approve
 * @param userId - The user approving the meeting (must own it)
 * @param modifications - Optional modifications to apply before approval
 * @returns The updated meeting
 */
export async function approveMeeting(
  meetingId: string,
  userId: string,
  modifications?: Partial<MeetingScheduleData>
) {
  console.log(`${LOG_PREFIX} Approving meeting ${meetingId} by user ${userId}`);

  try {
    // 1. Fetch the meeting
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }

    if (meeting.approvalStatus !== 'pending') {
      throw new Error(`Meeting is not pending approval (current status: ${meeting.approvalStatus})`);
    }

    // 2. Apply modifications if provided
    const updateData: Record<string, unknown> = {
      approvalStatus: 'approved',
      status: 'scheduled',
    };

    if (modifications) {
      if (modifications.title) updateData.title = modifications.title;
      if (modifications.description) updateData.description = modifications.description;
      if (modifications.meetingType) updateData.meetingType = modifications.meetingType;
      if (modifications.platform) updateData.platform = modifications.platform;
      if (modifications.startDateTime) updateData.startDateTime = modifications.startDateTime;
      if (modifications.endDateTime) updateData.endDateTime = modifications.endDateTime;
      if (modifications.durationMinutes) updateData.durationMinutes = modifications.durationMinutes;
      if (modifications.timezone) updateData.timezone = modifications.timezone;
      if (modifications.agenda) updateData.agenda = JSON.stringify(modifications.agenda);
      if (modifications.attendees) updateData.attendees = JSON.stringify(modifications.attendees);
      if (modifications.location) updateData.location = modifications.location;
      if (modifications.reminders) updateData.reminders = JSON.stringify(modifications.reminders);
    }

    // 3. Update the metadata with approval resolution
    let metadata: Record<string, unknown> = {};
    if (meeting.metadata) {
      try {
        metadata = JSON.parse(meeting.metadata) as Record<string, unknown>;
      } catch {
        // Start fresh
      }
    }

    const approvalMeta = (metadata.approvalRequest as Record<string, unknown>) || {};
    approvalMeta.status = 'approved';
    approvalMeta.resolvedAt = new Date().toISOString();
    approvalMeta.resolvedBy = userId;
    if (modifications) {
      approvalMeta.modifications = Object.keys(modifications);
    }
    metadata.approvalRequest = approvalMeta;
    updateData.metadata = JSON.stringify(metadata);

    // 4. Update the meeting
    const updated = await db.meeting.update({
      where: { id: meetingId },
      data: updateData,
    });

    // 5. Send notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_approved',
        title: 'Meeting Approved',
        message: `"${updated.title}" has been approved and scheduled`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: {
          meetingId,
          approvalStatus: 'approved',
          modifications: modifications ? Object.keys(modifications) : [],
        },
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send approval notification:`, error);
    }

    console.log(`${LOG_PREFIX} Meeting ${meetingId} approved successfully`);
    return updated;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error approving meeting:`, error);
    throw error instanceof Error ? error : new Error('Failed to approve meeting');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. REJECT MEETING
// ═══════════════════════════════════════════════════════════════════

/**
 * Reject a pending meeting suggestion.
 *
 * @param meetingId - The meeting to reject
 * @param userId - The user rejecting the meeting (must own it)
 * @param reason - Optional rejection reason
 * @returns The updated meeting
 */
export async function rejectMeeting(
  meetingId: string,
  userId: string,
  reason?: string
) {
  console.log(`${LOG_PREFIX} Rejecting meeting ${meetingId} by user ${userId}`);

  try {
    // 1. Fetch the meeting
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }

    if (meeting.approvalStatus !== 'pending') {
      throw new Error(`Meeting is not pending approval (current status: ${meeting.approvalStatus})`);
    }

    // 2. Update the metadata with rejection
    let metadata: Record<string, unknown> = {};
    if (meeting.metadata) {
      try {
        metadata = JSON.parse(meeting.metadata) as Record<string, unknown>;
      } catch {
        // Start fresh
      }
    }

    const approvalMeta = (metadata.approvalRequest as Record<string, unknown>) || {};
    approvalMeta.status = 'rejected';
    approvalMeta.resolvedAt = new Date().toISOString();
    approvalMeta.resolvedBy = userId;
    approvalMeta.rejectionReason = reason || null;
    metadata.approvalRequest = approvalMeta;

    // 3. Update the meeting to cancelled
    const updated = await db.meeting.update({
      where: { id: meetingId },
      data: {
        approvalStatus: 'rejected',
        status: 'cancelled',
        cancellationReason: reason || 'Rejected by user',
        metadata: JSON.stringify(metadata),
      },
    });

    // 4. Send notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_rejected',
        title: 'Meeting Rejected',
        message: `"${meeting.title}" has been rejected${reason ? `: ${reason}` : ''}`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: {
          meetingId,
          approvalStatus: 'rejected',
          reason,
        },
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send rejection notification:`, error);
    }

    console.log(`${LOG_PREFIX} Meeting ${meetingId} rejected`);
    return updated;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error rejecting meeting:`, error);
    throw error instanceof Error ? error : new Error('Failed to reject meeting');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. AUTO SCHEDULE IF AUTONOMOUS
// ═══════════════════════════════════════════════════════════════════

/**
 * Auto-schedule a meeting if the user is in autonomous mode.
 * Creates the meeting directly with approved status without requiring
 * manual approval.
 *
 * @param userId - The user whose meeting to auto-schedule
 * @param meetingData - The meeting data to schedule
 * @returns The created meeting, or null if not in autonomous mode
 */
export async function autoScheduleIfAutonomous(
  userId: string,
  meetingData: MeetingScheduleData
): Promise<{
  scheduled: boolean;
  meetingId?: string;
  reason: string;
} | null> {
  console.log(`${LOG_PREFIX} Checking auto-schedule eligibility for user ${userId}`);

  try {
    // 1. Check if user is in autonomous mode
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: {
        meetingAutonomyMode: true,
        meetingAutoSchedule: true,
      },
    });

    const autonomyMode = (settings?.meetingAutonomyMode as AutonomyMode) ||
      (settings?.meetingAutoSchedule ? 'autonomous' : DEFAULT_AUTONOMY_MODE);

    if (autonomyMode !== 'autonomous') {
      console.log(`${LOG_PREFIX} User ${userId} not in autonomous mode (${autonomyMode}), skipping auto-schedule`);
      return null;
    }

    // 2. Check confidence threshold
    const confidence = meetingData.metadata?.confidence as number | undefined;
    if (confidence !== undefined && confidence < AUTONOMOUS_CONFIDENCE_THRESHOLD) {
      console.log(`${LOG_PREFIX} Confidence ${confidence} below threshold ${AUTONOMOUS_CONFIDENCE_THRESHOLD}`);
      return {
        scheduled: false,
        reason: `Confidence ${confidence.toFixed(2)} below autonomous threshold ${AUTONOMOUS_CONFIDENCE_THRESHOLD}`,
      };
    }

    // 3. Create the meeting with auto-approved status
    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId: meetingData.leadId || null,
        dealId: meetingData.dealId || null,
        title: meetingData.title,
        description: meetingData.description || null,
        meetingType: meetingData.meetingType || 'video',
        platform: meetingData.platform || 'google_meet',
        startDateTime: meetingData.startDateTime,
        endDateTime: meetingData.endDateTime,
        durationMinutes: meetingData.durationMinutes || 30,
        timezone: meetingData.timezone || 'UTC',
        agenda: meetingData.agenda ? JSON.stringify(meetingData.agenda) : null,
        attendees: JSON.stringify(meetingData.attendees || []),
        location: meetingData.location || null,
        reminders: JSON.stringify(meetingData.reminders || [
          { minutesBefore: 60, type: 'email' },
          { minutesBefore: 15, type: 'notification' },
        ]),
        createdBy: meetingData.createdBy,
        approvalStatus: 'approved',
        status: 'scheduled',
        metadata: meetingData.metadata ? JSON.stringify(meetingData.metadata) : null,
      },
    });

    // 4. Send notification about auto-scheduled meeting
    try {
      await sendNotification({
        userId,
        type: 'meeting_auto_scheduled',
        title: 'Meeting Auto-Scheduled',
        message: `"${meetingData.title}" has been automatically scheduled for ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(meetingData.startDateTime)}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          autonomyMode: 'autonomous',
          startDateTime: meetingData.startDateTime.toISOString(),
        },
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to send auto-schedule notification:`, error);
    }

    console.log(`${LOG_PREFIX} Meeting auto-scheduled: ${meeting.id}`);

    return {
      scheduled: true,
      meetingId: meeting.id,
      reason: `Autonomous mode: meeting auto-scheduled with ${confidence !== undefined ? `confidence ${confidence.toFixed(2)}` : 'user settings'}`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error auto-scheduling meeting:`, error);
    return {
      scheduled: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. GET PENDING APPROVALS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get all pending meeting approvals for a user.
 *
 * @param userId - The user whose pending approvals to fetch
 * @returns Array of pending approval items
 */
export async function getPendingApprovals(userId: string): Promise<PendingApproval[]> {
  console.log(`${LOG_PREFIX} Getting pending approvals for user ${userId}`);

  try {
    const pendingMeetings = await db.meeting.findMany({
      where: {
        userId,
        approvalStatus: 'pending',
        status: 'pending_approval',
      },
      include: {
        lead: {
          select: { businessName: true, ownerName: true },
        },
      },
      orderBy: { startDateTime: 'asc' },
    });

    return pendingMeetings.map((meeting) => {
      // Parse metadata for approval details
      let approvalRequestData: Record<string, unknown> = {};
      if (meeting.metadata) {
        try {
          const metadata = JSON.parse(meeting.metadata) as Record<string, unknown>;
          approvalRequestData = (metadata.approvalRequest as Record<string, unknown>) || {};
        } catch {
          // Use defaults
        }
      }

      // Parse attendees for client info
      let clientName: string | undefined;
      let clientEmail: string | undefined;
      try {
        const attendees = JSON.parse(meeting.attendees) as Array<{ email: string; name?: string }>;
        const client = attendees[0];
        if (client) {
          clientName = client.name;
          clientEmail = client.email;
        }
      } catch {
        // No attendees
      }

      return {
        meetingId: meeting.id,
        title: meeting.title,
        startDateTime: meeting.startDateTime,
        endDateTime: meeting.endDateTime,
        timezone: meeting.timezone,
        durationMinutes: meeting.durationMinutes,
        platform: meeting.platform,
        leadId: meeting.leadId || undefined,
        leadName: meeting.lead?.businessName || undefined,
        clientName,
        clientEmail,
        requestedAt: new Date(approvalRequestData.requestedAt as string || meeting.createdAt),
        requestedBy: (approvalRequestData.requestedBy as string) || 'user',
        reason: (approvalRequestData.reason as string) || 'Meeting requires approval',
        approvalStatus: meeting.approvalStatus,
      };
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting pending approvals:`, error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Build complete meeting data from intent data and user settings.
 */
function buildMeetingData(
  userId: string,
  intentData: IntentData,
  settings: {
    meetingPlatform?: string;
    meetingDurationDefault?: number;
    meetingTimezone?: string;
  } | null,
  createdBy: 'user' | 'ai_suggestion' | 'ai_auto'
): MeetingScheduleData {
  const now = new Date();
  const durationMinutes = intentData.suggestedDurationMinutes ||
    settings?.meetingDurationDefault || 30;
  const platform = intentData.platform || settings?.meetingPlatform || 'google_meet';
  const timezone = intentData.timezone || settings?.meetingTimezone || 'UTC';

  // If no suggested time, default to next business day at 10 AM
  let startDateTime = intentData.suggestedStartDateTime;
  if (!startDateTime) {
    startDateTime = new Date(now);
    startDateTime.setDate(startDateTime.getDate() + 1);
    startDateTime.setHours(10, 0, 0, 0);
    // Skip weekends
    while (startDateTime.getDay() === 0 || startDateTime.getDay() === 6) {
      startDateTime.setDate(startDateTime.getDate() + 1);
    }
  }

  const endDateTime = intentData.suggestedEndDateTime ||
    new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

  const attendees: Array<{ email: string; name?: string; status?: string }> = [];
  if (intentData.clientEmail) {
    attendees.push({
      email: intentData.clientEmail,
      name: intentData.clientName,
      status: 'pending',
    });
  }

  return {
    userId,
    leadId: intentData.leadId,
    title: intentData.meetingTitle,
    meetingType: intentData.meetingType || 'video',
    platform,
    startDateTime,
    endDateTime,
    durationMinutes,
    timezone,
    agenda: intentData.agenda ? [{ title: intentData.agenda }] : undefined,
    attendees,
    createdBy,
    metadata: {
      sourceType: intentData.sourceType,
      sourceId: intentData.sourceId,
      confidence: intentData.confidence,
      detectedIntent: intentData.detectedIntent,
      originalText: intentData.originalText,
      leadName: intentData.leadName,
    },
  };
}
