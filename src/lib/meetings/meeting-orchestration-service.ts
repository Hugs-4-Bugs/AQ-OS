// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Orchestration Service
// Main entry point for the autonomous meeting orchestration pipeline
//
// Pipeline: Lead reply → Intent detection → Calendar lookup →
//   Slot recommendation → Meeting proposal → Approval flow →
//   Meeting creation → CRM update → Notification → Reminder
//
// Phase 3: Connect the broken pipeline — orchestrateMeetingFromReply
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { findAvailableSlots, type AvailableSlot } from './calendar-intelligence';
import {
  getUserAutonomyMode,
  setUserAutonomyMode,
  type AutonomyMode,
} from './autonomy-engine';
import { sendNotification } from '@/lib/notification-engine';
import { getMeetingAdapter, type MeetingPlatform, MeetingAttendee } from './platform-adapter';
import type { ClassifyReplyResult } from '@/lib/reply-intelligence-service';
import {
  sendMeetingConfirmationToClient,
  sendMeetingConfirmationToUser,
} from './meeting-email';
import { scheduleReminders, cancelReminders } from './meeting-reminders';
import { syncMeetingToLead, syncMeetingToDeal, onMeetingCancelled as crmOnMeetingCancelled } from './crm-sync';

// ===== TYPES =====

/** Autonomy mode for meeting orchestration */
export type { AutonomyMode };

/** Orchestration pipeline step */
export type OrchestrationStep =
  | 'intent_detected'
  | 'calendar_looked_up'
  | 'slots_recommended'
  | 'proposal_created'
  | 'approval_requested'
  | 'meeting_created'
  | 'crm_updated'
  | 'notification_sent'
  | 'reminder_scheduled';

/** Orchestration pipeline status */
export type OrchestrationStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

/** Intent detection result */
export interface IntentResult {
  hasMeetingIntent: boolean;
  intentType: 'meeting_request' | 'schedule_call' | 'discuss' | 'connect' | 'interested' | 'none';
  confidence: number;
  originalText?: string;
  leadId?: string;
  sourceType?: 'email' | 'chat' | 'whatsapp' | 'telegram' | 'manual';
  sourceId?: string;
}

/** Time slot recommendation */
export interface SlotRecommendation {
  startTime: Date;
  endTime: Date;
  timezone: string;
  score: number; // 0-1, higher = better
  reason: string; // AI explanation of why this slot
  hasConflict: boolean;
  conflictWith?: string;
}

/** Meeting proposal */
export interface MeetingProposal {
  leadId: string;
  leadName?: string;
  leadEmail?: string;
  suggestedTitle: string;
  suggestedDuration: number; // minutes
  suggestedPlatform: MeetingPlatform;
  recommendedSlots: SlotRecommendation[];
  proposedAgenda?: string;
  autonomyMode: AutonomyMode;
  requiresApproval: boolean;
}

/** Orchestration context — tracks the full pipeline state */
export interface OrchestrationContext {
  id: string;
  userId: string;
  leadId?: string;
  status: OrchestrationStatus;
  currentStep: OrchestrationStep;
  autonomyMode: AutonomyMode;
  intentResult?: IntentResult;
  slotRecommendations?: SlotRecommendation[];
  proposal?: MeetingProposal;
  meetingId?: string;
  calendarEventId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Orchestration result */
export interface OrchestrationResult {
  success: boolean;
  context: OrchestrationContext;
  meetingId?: string;
  error?: string;
}

/** Reply analysis passed from the reply intelligence pipeline */
export interface ReplyAnalysis {
  meetingRecommended: boolean;
  intent: string;
  sentiment: string;
  confidence: number;
  urgency: string;
  suggestedReply?: string;
  buyingSignals?: Record<string, boolean>;
  fromEmail?: string;
  emailContent?: string;
  classification?: ClassifyReplyResult;
}

// ===== LOG PREFIX =====

const LOG_PREFIX = '[MeetingOrchestration]';

// ═══════════════════════════════════════════════════════════════════
// CORE: orchestrateMeetingFromReply
// ═══════════════════════════════════════════════════════════════════

/**
 * Orchestrate a meeting from a classified reply.
 * Called after processGmailReply/processNewReplies classifies a reply
 * and determines a meeting is recommended.
 *
 * Pipeline:
 *   (a) Check if replyAnalysis.meetingRecommended === true
 *   (b) Call findAvailableSlots() from calendar-intelligence.ts to get 3 options
 *   (c) Call getUserAutonomyMode() to determine action based on user's autonomy mode
 *   (d) In 'manual' mode: create a notification with slot options for user to pick
 *   (e) In 'assisted' mode: pre-select the best slot, present for one-click confirm
 *   (f) In 'autonomous' mode: automatically create the calendar event + Meeting record,
 *       send confirmation emails, update CRM
 *   (g) Return the orchestration result with chosen mode and next steps
 */
export async function orchestrateMeetingFromReply(
  userId: string,
  leadId: string,
  replyAnalysis: ReplyAnalysis,
): Promise<OrchestrationResult> {
  const contextId = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const context: OrchestrationContext = {
    id: contextId,
    userId,
    leadId,
    status: 'pending',
    currentStep: 'intent_detected',
    autonomyMode: 'assisted', // default, will be updated
    createdAt: now,
    updatedAt: now,
  };

  console.log(`${LOG_PREFIX} orchestrateMeetingFromReply called for user ${userId}, lead ${leadId}`);

  try {
    // (a) Check if meeting is recommended
    if (!replyAnalysis.meetingRecommended) {
      console.log(`${LOG_PREFIX} Meeting not recommended, skipping orchestration`);
      return {
        success: true,
        context: { ...context, status: 'completed', currentStep: 'intent_detected' },
      };
    }

    context.status = 'in_progress';
    context.intentResult = {
      hasMeetingIntent: true,
      intentType: replyAnalysis.intent === 'meeting_request' ? 'meeting_request' : 'schedule_call',
      confidence: replyAnalysis.confidence,
      originalText: replyAnalysis.emailContent,
      leadId,
      sourceType: 'email',
    };

    // (c) Get user's autonomy mode from settings
    const autonomyMode = await getUserAutonomyMode(userId);
    context.autonomyMode = autonomyMode;
    console.log(`${LOG_PREFIX} User autonomy mode: ${autonomyMode}`);

    // (b) Find available slots — get 3 options
    context.currentStep = 'calendar_looked_up';

    // Get user settings for default duration
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: {
        meetingDurationDefault: true,
        meetingPlatform: true,
        meetingTimezone: true,
      },
    });

    const durationMinutes = settings?.meetingDurationDefault || 30;
    const platform = (settings?.meetingPlatform as MeetingPlatform) || 'google_meet';

    const availableSlots = await findAvailableSlots(userId, durationMinutes);
    const topSlots = availableSlots.slice(0, 3); // Get top 3 options

    context.currentStep = 'slots_recommended';

    // Convert AvailableSlot to SlotRecommendation
    const slotRecommendations: SlotRecommendation[] = topSlots.map((slot: AvailableSlot) => ({
      startTime: slot.start,
      endTime: slot.end,
      timezone: slot.timezone,
      score: slot.score,
      reason: slot.reason,
      hasConflict: false, // findAvailableSlots already filters out conflicts
    }));

    context.slotRecommendations = slotRecommendations;

    // Get lead info for the proposal
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { businessName: true, ownerName: true, email: true },
    });

    const leadName = lead?.businessName || lead?.ownerName || 'Unknown Lead';
    const leadEmail = lead?.email || replyAnalysis.fromEmail || undefined;

    // Build the meeting proposal
    const proposal: MeetingProposal = {
      leadId,
      leadName,
      leadEmail,
      suggestedTitle: `Meeting with ${leadName}`,
      suggestedDuration: durationMinutes,
      suggestedPlatform: platform,
      recommendedSlots: slotRecommendations,
      proposedAgenda: replyAnalysis.suggestedReply?.substring(0, 500) || undefined,
      autonomyMode,
      requiresApproval: autonomyMode !== 'autonomous',
    };

    context.proposal = proposal;
    context.currentStep = 'proposal_created';

    // Route based on autonomy mode
    switch (autonomyMode) {
      case 'manual':
        return await handleManualMode(userId, leadId, context, proposal);
      case 'assisted':
        return await handleAssistedMode(userId, leadId, context, proposal);
      case 'autonomous':
        return await handleAutonomousMode(userId, leadId, context, proposal);
      default:
        return await handleAssistedMode(userId, leadId, context, proposal);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} orchestrateMeetingFromReply failed:`, error);
    return {
      success: false,
      context: {
        ...context,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MANUAL MODE: Create notification with all slot options
// User must pick a slot and confirm
// ═══════════════════════════════════════════════════════════════════

async function handleManualMode(
  userId: string,
  leadId: string,
  context: OrchestrationContext,
  proposal: MeetingProposal,
): Promise<OrchestrationResult> {
  console.log(`${LOG_PREFIX} Manual mode: creating notification with slot options`);

  try {
    // Create a pending-approval meeting record
    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId,
        title: proposal.suggestedTitle,
        description: `Meeting requested by lead. Awaiting slot selection from user.`,
        meetingType: 'video',
        platform: proposal.suggestedPlatform,
        durationMinutes: proposal.suggestedDuration,
        timezone: proposal.recommendedSlots[0]?.timezone || 'UTC',
        startDateTime: proposal.recommendedSlots[0]?.startTime || new Date(),
        endDateTime: proposal.recommendedSlots[0]?.endTime || new Date(Date.now() + proposal.suggestedDuration * 60 * 1000),
        status: 'pending_approval',
        approvalStatus: 'pending',
        createdBy: 'ai_suggestion',
        agenda: proposal.proposedAgenda ? JSON.stringify([{ title: proposal.proposedAgenda }]) : null,
        attendees: JSON.stringify(
          proposal.leadEmail
            ? [{ email: proposal.leadEmail, name: proposal.leadName, status: 'pending' }]
            : []
        ),
        metadata: JSON.stringify({
          orchestrationContextId: context.id,
          autonomyMode: 'manual',
          recommendedSlots: proposal.recommendedSlots.map(s => ({
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            timezone: s.timezone,
            score: s.score,
            reason: s.reason,
          })),
          leadName: proposal.leadName,
          leadEmail: proposal.leadEmail,
          source: 'reply_intelligence',
        }),
      },
    });

    // Send notification with slot options
    const slotOptionsText = proposal.recommendedSlots
      .map((slot, i) => `  ${i + 1}. ${slot.startTime.toLocaleDateString()} ${slot.startTime.toLocaleTimeString()} - ${slot.reason}`)
      .join('\n');

    await sendNotification({
      userId,
      type: 'meeting_scheduled',
      title: 'Meeting Request — Pick a Time Slot',
      message: `${proposal.leadName} wants to meet. Choose from ${proposal.recommendedSlots.length} available slots:\n${slotOptionsText}`,
      actionUrl: `/meetings/${meeting.id}`,
      metadata: {
        meetingId: meeting.id,
        leadId,
        autonomyMode: 'manual',
        slotCount: proposal.recommendedSlots.length,
        orchestrationContextId: context.id,
      },
    });

    return {
      success: true,
      meetingId: meeting.id,
      context: {
        ...context,
        status: 'awaiting_approval',
        currentStep: 'approval_requested',
        meetingId: meeting.id,
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Manual mode failed:`, error);
    return {
      success: false,
      context: {
        ...context,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ASSISTED MODE: Pre-select best slot, one-click confirm
// ═══════════════════════════════════════════════════════════════════

async function handleAssistedMode(
  userId: string,
  leadId: string,
  context: OrchestrationContext,
  proposal: MeetingProposal,
): Promise<OrchestrationResult> {
  console.log(`${LOG_PREFIX} Assisted mode: pre-selecting best slot for one-click confirm`);

  try {
    // Pre-select the best slot (first one, already sorted by score)
    const bestSlot = proposal.recommendedSlots[0];

    if (!bestSlot) {
      return await handleManualMode(userId, leadId, context, proposal);
    }

    // Create a meeting with the best slot, pending approval
    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId,
        title: proposal.suggestedTitle,
        description: `Meeting requested by lead. Best slot pre-selected for one-click confirm.`,
        meetingType: 'video',
        platform: proposal.suggestedPlatform,
        durationMinutes: proposal.suggestedDuration,
        timezone: bestSlot.timezone,
        startDateTime: bestSlot.startTime,
        endDateTime: bestSlot.endTime,
        status: 'pending_approval',
        approvalStatus: 'pending',
        createdBy: 'ai_suggestion',
        agenda: proposal.proposedAgenda ? JSON.stringify([{ title: proposal.proposedAgenda }]) : null,
        attendees: JSON.stringify(
          proposal.leadEmail
            ? [{ email: proposal.leadEmail, name: proposal.leadName, status: 'pending' }]
            : []
        ),
        metadata: JSON.stringify({
          orchestrationContextId: context.id,
          autonomyMode: 'assisted',
          selectedSlot: {
            startTime: bestSlot.startTime.toISOString(),
            endTime: bestSlot.endTime.toISOString(),
            timezone: bestSlot.timezone,
            score: bestSlot.score,
            reason: bestSlot.reason,
          },
          alternativeSlots: proposal.recommendedSlots.slice(1).map(s => ({
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            timezone: s.timezone,
            score: s.score,
            reason: s.reason,
          })),
          leadName: proposal.leadName,
          leadEmail: proposal.leadEmail,
          source: 'reply_intelligence',
        }),
      },
    });

    // Send notification with pre-selected slot for one-click confirm
    await sendNotification({
      userId,
      type: 'meeting_scheduled',
      title: 'Meeting Suggested — One-Click Confirm',
      message: `Best slot for ${proposal.leadName}: ${bestSlot.startTime.toLocaleDateString()} ${bestSlot.startTime.toLocaleTimeString()} (${bestSlot.reason}). Click to confirm or choose another time.`,
      actionUrl: `/meetings/${meeting.id}`,
      metadata: {
        meetingId: meeting.id,
        leadId,
        autonomyMode: 'assisted',
        selectedSlot: {
          startTime: bestSlot.startTime.toISOString(),
          endTime: bestSlot.endTime.toISOString(),
        },
        orchestrationContextId: context.id,
      },
    });

    return {
      success: true,
      meetingId: meeting.id,
      context: {
        ...context,
        status: 'awaiting_approval',
        currentStep: 'approval_requested',
        meetingId: meeting.id,
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Assisted mode failed:`, error);
    return {
      success: false,
      context: {
        ...context,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTONOMOUS MODE: Auto-create meeting, send confirmation, update CRM
// ═══════════════════════════════════════════════════════════════════

async function handleAutonomousMode(
  userId: string,
  leadId: string,
  context: OrchestrationContext,
  proposal: MeetingProposal,
): Promise<OrchestrationResult> {
  console.log(`${LOG_PREFIX} Autonomous mode: auto-creating meeting`);

  try {
    // Pick the best slot
    const bestSlot = proposal.recommendedSlots[0];

    if (!bestSlot) {
      // No slots available — fall back to manual with notification
      console.warn(`${LOG_PREFIX} No available slots found, falling back to manual notification`);
      return await handleManualMode(userId, leadId, context, proposal);
    }

    // Create calendar event via platform adapter
    let calendarEventId: string | undefined;
    let meetingUrl: string | undefined;
    try {
      const userSettings = await db.userSettings.findUnique({
        where: { userId },
        select: { meetingPlatform: true },
      });
      const provider = (userSettings?.meetingPlatform as string) || 'google_meet';
      const adapter = getMeetingAdapter(provider);
      const adapterResult = await adapter.createMeeting({
        title: proposal.suggestedTitle,
        description: `Meeting auto-scheduled by AcquisitionOS AI (autonomous mode). ${proposal.proposedAgenda || ''}`,
        startTime: bestSlot.startTime,
        endTime: bestSlot.endTime,
        timezone: bestSlot.timezone,
        attendees: proposal.leadEmail
          ? [{ email: proposal.leadEmail, name: proposal.leadName }]
          : undefined,
        platform: proposal.suggestedPlatform as MeetingPlatform,
        userId,
        leadId,
      });
      if (adapterResult.success) {
        calendarEventId = adapterResult.calendarEventId;
        meetingUrl = adapterResult.meetingLink;
      } else {
        console.warn(`${LOG_PREFIX} Adapter createMeeting failed (non-blocking): ${adapterResult.error}`);
      }
    } catch (adapterError) {
      console.error(`${LOG_PREFIX} Adapter call failed (non-blocking):`, adapterError);
    }

    // Auto-create the meeting with approved status
    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId,
        title: proposal.suggestedTitle,
        description: `Meeting auto-scheduled by AcquisitionOS AI (autonomous mode). ${proposal.proposedAgenda || ''}`,
        meetingType: 'video',
        platform: proposal.suggestedPlatform,
        durationMinutes: proposal.suggestedDuration,
        timezone: bestSlot.timezone,
        startDateTime: bestSlot.startTime,
        endDateTime: bestSlot.endTime,
        status: 'scheduled',
        approvalStatus: 'approved',
        createdBy: 'ai_auto',
        calendarEventId: calendarEventId || null,
        meetingUrl: meetingUrl || null,
        agenda: proposal.proposedAgenda ? JSON.stringify([{ title: proposal.proposedAgenda }]) : null,
        attendees: JSON.stringify(
          proposal.leadEmail
            ? [{ email: proposal.leadEmail, name: proposal.leadName, status: 'pending' }]
            : []
        ),
        metadata: JSON.stringify({
          orchestrationContextId: context.id,
          autonomyMode: 'autonomous',
          selectedSlot: {
            startTime: bestSlot.startTime.toISOString(),
            endTime: bestSlot.endTime.toISOString(),
            timezone: bestSlot.timezone,
            score: bestSlot.score,
            reason: bestSlot.reason,
          },
          leadName: proposal.leadName,
          leadEmail: proposal.leadEmail,
          source: 'reply_intelligence',
          autoScheduledAt: new Date().toISOString(),
        }),
      },
    });

    // CRM sync: Update lead stage + activity, deal notes
    try {
      await syncMeetingToLead(meeting.id);
      console.log(`${LOG_PREFIX} CRM lead sync completed for meeting ${meeting.id}`);
    } catch (crmError) {
      console.error(`${LOG_PREFIX} CRM lead sync failed (non-blocking):`, crmError);
    }
    try {
      await syncMeetingToDeal(meeting.id);
      console.log(`${LOG_PREFIX} CRM deal sync completed for meeting ${meeting.id}`);
    } catch (crmError) {
      console.error(`${LOG_PREFIX} CRM deal sync failed (non-blocking):`, crmError);
    }

    // Send notification about the auto-scheduled meeting
    try {
      await sendNotification({
        userId,
        type: 'meeting_scheduled',
        title: 'Meeting Auto-Scheduled',
        message: `Meeting with ${proposal.leadName} auto-scheduled for ${bestSlot.startTime.toLocaleDateString()} ${bestSlot.startTime.toLocaleTimeString()} (autonomous mode)`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          leadId,
          autonomyMode: 'autonomous',
          autoScheduled: true,
          slot: {
            startTime: bestSlot.startTime.toISOString(),
            endTime: bestSlot.endTime.toISOString(),
          },
          orchestrationContextId: context.id,
        },
      });
    } catch (notifError) {
      console.error(`${LOG_PREFIX} Notification failed (non-blocking):`, notifError);
    }

    // Phase 4: Send confirmation emails to client + user
    try {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { ownerName: true, email: true },
      });
      await sendMeetingConfirmationToClient(meeting, lead);
      console.log(`${LOG_PREFIX} Confirmation email sent to client for meeting ${meeting.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} Client confirmation email failed (non-blocking):`, emailError);
    }
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, company: true },
      });
      await sendMeetingConfirmationToUser(meeting, user);
      console.log(`${LOG_PREFIX} Confirmation email sent to user for meeting ${meeting.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} User confirmation email failed (non-blocking):`, emailError);
    }

    // Phase 4: Schedule reminders for the meeting
    try {
      await scheduleReminders(meeting.id, userId, bestSlot.startTime);
      console.log(`${LOG_PREFIX} Reminders scheduled for meeting ${meeting.id}`);
    } catch (reminderError) {
      console.error(`${LOG_PREFIX} Reminder scheduling failed (non-blocking):`, reminderError);
    }

    return {
      success: true,
      meetingId: meeting.id,
      context: {
        ...context,
        status: 'completed',
        currentStep: 'meeting_created',
        meetingId: meeting.id,
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Autonomous mode failed:`, error);
    return {
      success: false,
      context: {
        ...context,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY STUBS — kept for API compatibility
// Full implementations exist in /src/lib/meeting/
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a lead reply through the meeting orchestration pipeline.
 * Detects meeting intent and triggers the appropriate flow.
 * Delegates to orchestrateMeetingFromReply for the actual pipeline.
 */
export async function processLeadReply(
  userId: string,
  leadId: string,
  replyText: string,
  sourceType: 'email' | 'chat' | 'whatsapp' | 'telegram' | 'manual',
  sourceId?: string
): Promise<OrchestrationResult> {
  // Determine if meeting is recommended based on the reply text
  const meetingPhrases = [
    'schedule a meeting', 'set up a call', "let's meet", 'book a call',
    'zoom call', 'quick chat', 'when are you free', 'schedule a call',
    'meeting request', 'can we meet', 'discuss this',
  ];

  const textLower = replyText.toLowerCase();
  const meetingRecommended = meetingPhrases.some(phrase => textLower.includes(phrase));

  return orchestrateMeetingFromReply(userId, leadId, {
    meetingRecommended,
    intent: meetingRecommended ? 'meeting_request' : 'none',
    sentiment: 'neutral',
    confidence: meetingRecommended ? 0.85 : 0.3,
    urgency: meetingRecommended ? 'high' : 'low',
    emailContent: replyText,
    sourceType,
    sourceId,
  });
}

/**
 * Process a detected meeting intent (already classified by reply intelligence).
 * Skips intent detection and goes directly to calendar lookup.
 */
export async function processMeetingIntent(
  userId: string,
  intent: IntentResult
): Promise<OrchestrationResult> {
  if (!intent.hasMeetingIntent) {
    return {
      success: true,
      context: {
        id: `orch_${Date.now()}`,
        userId,
        leadId: intent.leadId,
        status: 'completed',
        currentStep: 'intent_detected',
        autonomyMode: 'assisted',
        intentResult: intent,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }

  return orchestrateMeetingFromReply(
    userId,
    intent.leadId || '',
    {
      meetingRecommended: true,
      intent: intent.intentType,
      sentiment: 'positive',
      confidence: intent.confidence,
      urgency: 'high',
      originalText: intent.originalText,
    }
  );
}

/**
 * Approve a pending meeting proposal.
 * Called by the user in manual/assisted modes.
 */
export async function approveMeetingProposal(
  contextId: string,
  userId: string,
  selectedSlotIndex: number
): Promise<OrchestrationResult> {
  try {
    // Find the meeting by orchestration context ID in metadata
    const meeting = await db.meeting.findFirst({
      where: {
        userId,
        approvalStatus: 'pending',
        status: 'pending_approval',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!meeting) {
      return {
        success: false,
        context: {
          id: contextId,
          userId,
          status: 'failed',
          currentStep: 'approval_requested',
          autonomyMode: 'assisted',
          error: 'No pending meeting found',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        error: 'No pending meeting found',
      };
    }

    // Parse metadata for alternative slots
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(meeting.metadata || '{}');
    } catch { /* ignore */ }

    // If a different slot was selected, update the meeting time
    if (selectedSlotIndex > 0) {
      const altSlots = (metadata.alternativeSlots || []) as Array<{
        startTime: string;
        endTime: string;
        timezone: string;
      }>;

      if (altSlots[selectedSlotIndex - 1]) {
        const selectedSlot = altSlots[selectedSlotIndex - 1];
        await db.meeting.update({
          where: { id: meeting.id },
          data: {
            startDateTime: new Date(selectedSlot.startTime),
            endDateTime: new Date(selectedSlot.endTime),
            timezone: selectedSlot.timezone,
          },
        });
      }
    }

    // Approve the meeting
    const updated = await db.meeting.update({
      where: { id: meeting.id },
      data: {
        approvalStatus: 'approved',
        status: 'scheduled',
      },
    });

    // Create calendar event via platform adapter on approval
    try {
      const userSettings = await db.userSettings.findUnique({
        where: { userId },
        select: { meetingPlatform: true },
      });
      const provider = (userSettings?.meetingPlatform as string) || 'google_meet';
      const adapter = getMeetingAdapter(provider);
      const adapterResult = await adapter.createMeeting({
        title: updated.title,
        description: updated.description || undefined,
        startTime: updated.startDateTime,
        endTime: updated.endDateTime,
        timezone: updated.timezone,
        attendees: updated.attendees ? JSON.parse(updated.attendees) : undefined,
        platform: updated.platform as MeetingPlatform,
        userId,
        leadId: updated.leadId || undefined,
      });
      if (adapterResult.success && (adapterResult.calendarEventId || adapterResult.meetingLink)) {
        await db.meeting.update({
          where: { id: updated.id },
          data: {
            calendarEventId: adapterResult.calendarEventId || updated.calendarEventId,
            meetingUrl: adapterResult.meetingLink || updated.meetingUrl,
          },
        });
      } else if (!adapterResult.success) {
        console.warn(`${LOG_PREFIX} Adapter createMeeting on approval failed (non-blocking): ${adapterResult.error}`);
      }
    } catch (adapterError) {
      console.error(`${LOG_PREFIX} Adapter call on approval failed (non-blocking):`, adapterError);
    }

    // CRM sync: Update lead + deal on approval
    if (meeting.leadId) {
      try {
        await syncMeetingToLead(updated.id);
        console.log(`${LOG_PREFIX} CRM lead sync on approval completed for meeting ${updated.id}`);
      } catch (crmError) {
        console.error(`${LOG_PREFIX} CRM lead sync on approval failed (non-blocking):`, crmError);
      }
    }
    if (meeting.dealId) {
      try {
        await syncMeetingToDeal(updated.id);
        console.log(`${LOG_PREFIX} CRM deal sync on approval completed for meeting ${updated.id}`);
      } catch (crmError) {
        console.error(`${LOG_PREFIX} CRM deal sync on approval failed (non-blocking):`, crmError);
      }
    }

    // Phase 4: Send confirmation emails to client + user after approval
    try {
      const lead = meeting.leadId
        ? await db.lead.findUnique({ where: { id: meeting.leadId }, select: { ownerName: true, email: true } })
        : null;
      await sendMeetingConfirmationToClient(updated, lead);
      console.log(`${LOG_PREFIX} Confirmation email sent to client for approved meeting ${updated.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} Client confirmation email on approval failed (non-blocking):`, emailError);
    }
    try {
      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, company: true } });
      await sendMeetingConfirmationToUser(updated, user);
      console.log(`${LOG_PREFIX} Confirmation email sent to user for approved meeting ${updated.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} User confirmation email on approval failed (non-blocking):`, emailError);
    }

    // Phase 4: Schedule reminders for the approved meeting
    try {
      await scheduleReminders(updated.id, userId, updated.startDateTime);
      console.log(`${LOG_PREFIX} Reminders scheduled for approved meeting ${updated.id}`);
    } catch (reminderError) {
      console.error(`${LOG_PREFIX} Reminder scheduling on approval failed (non-blocking):`, reminderError);
    }

    return {
      success: true,
      meetingId: updated.id,
      context: {
        id: contextId,
        userId,
        leadId: meeting.leadId || undefined,
        status: 'completed',
        currentStep: 'meeting_created',
        autonomyMode: (metadata.autonomyMode as AutonomyMode) || 'assisted',
        meetingId: updated.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      context: {
        id: contextId,
        userId,
        status: 'failed',
        currentStep: 'approval_requested',
        autonomyMode: 'assisted',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reject a pending meeting proposal.
 */
export async function rejectMeetingProposal(
  contextId: string,
  userId: string,
  reason?: string
): Promise<OrchestrationResult> {
  try {
    const meeting = await db.meeting.findFirst({
      where: {
        userId,
        approvalStatus: 'pending',
        status: 'pending_approval',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!meeting) {
      return {
        success: false,
        context: {
          id: contextId,
          userId,
          status: 'failed',
          currentStep: 'approval_requested',
          autonomyMode: 'assisted',
          error: 'No pending meeting found',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        error: 'No pending meeting found',
      };
    }

    await db.meeting.update({
      where: { id: meeting.id },
      data: {
        approvalStatus: 'rejected',
        status: 'cancelled',
        cancellationReason: reason || 'Rejected by user',
      },
    });

    return {
      success: true,
      context: {
        id: contextId,
        userId,
        leadId: meeting.leadId || undefined,
        status: 'completed',
        currentStep: 'approval_requested',
        autonomyMode: 'assisted',
        meetingId: meeting.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      context: {
        id: contextId,
        userId,
        status: 'failed',
        currentStep: 'approval_requested',
        autonomyMode: 'assisted',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a meeting manually (bypasses orchestration pipeline).
 * Used when the user directly schedules a meeting.
 */
export async function createMeetingManual(
  userId: string,
  params: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    platform: MeetingPlatform;
    leadId?: string;
    dealId?: string;
    attendees?: MeetingAttendee[];
  }
): Promise<OrchestrationResult> {
  try {
    // Create calendar event via platform adapter
    let calendarEventId: string | undefined;
    let meetingUrl: string | undefined;
    try {
      const userSettings = await db.userSettings.findUnique({
        where: { userId },
        select: { meetingPlatform: true },
      });
      const provider = (userSettings?.meetingPlatform as string) || params.platform;
      const adapter = getMeetingAdapter(provider);
      const adapterResult = await adapter.createMeeting({
        title: params.title,
        description: params.description || undefined,
        startTime: params.startTime,
        endTime: params.endTime,
        timezone: params.timezone,
        attendees: params.attendees,
        platform: params.platform,
        userId,
        leadId: params.leadId,
        dealId: params.dealId,
      });
      if (adapterResult.success) {
        calendarEventId = adapterResult.calendarEventId;
        meetingUrl = adapterResult.meetingLink;
      } else {
        console.warn(`${LOG_PREFIX} Adapter createMeeting on manual create failed (non-blocking): ${adapterResult.error}`);
      }
    } catch (adapterError) {
      console.error(`${LOG_PREFIX} Adapter call on manual create failed (non-blocking):`, adapterError);
    }

    const meeting = await db.meeting.create({
      data: {
        userId,
        leadId: params.leadId || null,
        dealId: params.dealId || null,
        title: params.title,
        description: params.description || null,
        meetingType: 'video',
        platform: params.platform,
        startDateTime: params.startTime,
        endDateTime: params.endTime,
        durationMinutes: Math.round((params.endTime.getTime() - params.startTime.getTime()) / 60000),
        timezone: params.timezone,
        status: 'scheduled',
        approvalStatus: 'approved',
        createdBy: 'user',
        calendarEventId: calendarEventId || null,
        meetingUrl: meetingUrl || null,
        attendees: JSON.stringify(params.attendees || []),
      },
    });

    // CRM sync: Update lead + deal on manual meeting creation
    try {
      await syncMeetingToLead(meeting.id);
      console.log(`${LOG_PREFIX} CRM lead sync on manual create completed for meeting ${meeting.id}`);
    } catch (crmError) {
      console.error(`${LOG_PREFIX} CRM lead sync on manual create failed (non-blocking):`, crmError);
    }
    if (params.dealId) {
      try {
        await syncMeetingToDeal(meeting.id);
        console.log(`${LOG_PREFIX} CRM deal sync on manual create completed for meeting ${meeting.id}`);
      } catch (crmError) {
        console.error(`${LOG_PREFIX} CRM deal sync on manual create failed (non-blocking):`, crmError);
      }
    }

    // Phase 4: Send confirmation emails to client + user for manual meeting
    try {
      const lead = params.leadId
        ? await db.lead.findUnique({ where: { id: params.leadId }, select: { ownerName: true, email: true } })
        : null;
      await sendMeetingConfirmationToClient(meeting, lead);
      console.log(`${LOG_PREFIX} Confirmation email sent to client for manual meeting ${meeting.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} Client confirmation email for manual meeting failed (non-blocking):`, emailError);
    }
    try {
      const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, company: true } });
      await sendMeetingConfirmationToUser(meeting, user);
      console.log(`${LOG_PREFIX} Confirmation email sent to user for manual meeting ${meeting.id}`);
    } catch (emailError) {
      console.error(`${LOG_PREFIX} User confirmation email for manual meeting failed (non-blocking):`, emailError);
    }

    // Phase 4: Schedule reminders for the manual meeting
    try {
      await scheduleReminders(meeting.id, userId, meeting.startDateTime);
      console.log(`${LOG_PREFIX} Reminders scheduled for manual meeting ${meeting.id}`);
    } catch (reminderError) {
      console.error(`${LOG_PREFIX} Reminder scheduling for manual meeting failed (non-blocking):`, reminderError);
    }

    return {
      success: true,
      meetingId: meeting.id,
      context: {
        id: `orch_manual_${Date.now()}`,
        userId,
        leadId: params.leadId,
        status: 'completed',
        currentStep: 'meeting_created',
        autonomyMode: 'manual',
        meetingId: meeting.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      context: {
        id: `orch_manual_${Date.now()}`,
        userId,
        status: 'failed',
        currentStep: 'proposal_created',
        autonomyMode: 'manual',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the current orchestration context for a meeting pipeline run.
 */
export async function getOrchestrationContext(
  contextId: string
): Promise<OrchestrationContext | null> {
  // Search by orchestration context ID in meeting metadata
  try {
    const meeting = await db.meeting.findFirst({
      where: {
        metadata: { contains: contextId },
      },
    });

    if (!meeting) return null;

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(meeting.metadata || '{}');
    } catch { /* ignore */ }

    return {
      id: contextId,
      userId: meeting.userId,
      leadId: meeting.leadId || undefined,
      status: meeting.status === 'scheduled' ? 'completed' :
              meeting.status === 'pending_approval' ? 'awaiting_approval' :
              meeting.status === 'cancelled' ? 'rejected' : 'completed',
      currentStep: meeting.status === 'scheduled' ? 'meeting_created' :
                   meeting.status === 'pending_approval' ? 'approval_requested' : 'intent_detected',
      autonomyMode: (metadata.autonomyMode as AutonomyMode) || 'assisted',
      meetingId: meeting.id,
      calendarEventId: meeting.calendarEventId || undefined,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Cancel a meeting and trigger downstream effects (CRM update, notifications).
 */
export async function cancelMeeting(
  meetingId: string,
  userId: string,
  reason?: string
): Promise<OrchestrationResult> {
  try {
    const meeting = await db.meeting.findFirst({
      where: { id: meetingId, userId },
    });

    if (!meeting) {
      return {
        success: false,
        context: {
          id: `orch_cancel_${Date.now()}`,
          userId,
          status: 'failed',
          currentStep: 'meeting_created',
          autonomyMode: 'assisted',
          error: 'Meeting not found',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        error: 'Meeting not found',
      };
    }

    await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'cancelled',
        cancellationReason: reason || 'Cancelled by user',
      },
    });

    // CRM sync: Handle cancellation via crm-sync service
    try {
      await crmOnMeetingCancelled(meetingId, reason);
      console.log(`${LOG_PREFIX} CRM cancellation sync completed for meeting ${meetingId}`);
    } catch (crmError) {
      console.error(`${LOG_PREFIX} CRM cancellation sync failed (non-blocking):`, crmError);
    }

    return {
      success: true,
      meetingId,
      context: {
        id: `orch_cancel_${Date.now()}`,
        userId,
        leadId: meeting.leadId || undefined,
        status: 'completed',
        currentStep: 'meeting_created',
        autonomyMode: 'assisted',
        meetingId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      context: {
        id: `orch_cancel_${Date.now()}`,
        userId,
        status: 'failed',
        currentStep: 'meeting_created',
        autonomyMode: 'assisted',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reschedule a meeting and trigger downstream effects.
 */
export async function rescheduleMeeting(
  meetingId: string,
  userId: string,
  newStartTime: Date,
  newEndTime: Date,
  timezone?: string
): Promise<OrchestrationResult> {
  try {
    const meeting = await db.meeting.findFirst({
      where: { id: meetingId, userId },
    });

    if (!meeting) {
      return {
        success: false,
        context: {
          id: `orch_resched_${Date.now()}`,
          userId,
          status: 'failed',
          currentStep: 'meeting_created',
          autonomyMode: 'assisted',
          error: 'Meeting not found',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        error: 'Meeting not found',
      };
    }

    await db.meeting.update({
      where: { id: meetingId },
      data: {
        startDateTime: newStartTime,
        endDateTime: newEndTime,
        timezone: timezone || meeting.timezone,
        status: 'rescheduled',
        rescheduledFrom: meetingId,
      },
    });

    // Create LeadActivity if leadId exists
    if (meeting.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: 'meeting_rescheduled',
            description: `Meeting "${meeting.title}" rescheduled to ${newStartTime.toLocaleString()}`,
            metadata: JSON.stringify({ meetingId, newStartTime, newEndTime }),
          },
        });
      } catch (crmError) {
        console.error(`${LOG_PREFIX} LeadActivity on reschedule failed (non-blocking):`, crmError);
      }
    }

    return {
      success: true,
      meetingId,
      context: {
        id: `orch_resched_${Date.now()}`,
        userId,
        leadId: meeting.leadId || undefined,
        status: 'completed',
        currentStep: 'meeting_created',
        autonomyMode: 'assisted',
        meetingId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    return {
      success: false,
      context: {
        id: `orch_resched_${Date.now()}`,
        userId,
        status: 'failed',
        currentStep: 'meeting_created',
        autonomyMode: 'assisted',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
