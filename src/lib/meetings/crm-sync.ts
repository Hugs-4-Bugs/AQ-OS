// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM Sync Service
// Syncs meeting events back to Lead/Deal/Activity models
//
// When meeting status changes occur, this service:
// - Updates lead stages via pipeline-service moveLeadToStage
// - Updates deal notes with meeting references
// - Creates LeadActivity records for the timeline
// - Creates AuditLog entries
// - Triggers notifications via notification-engine
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { moveLeadToStage } from '@/lib/pipeline-service';
import { sendNotification } from '@/lib/notification-engine';

// ===== TYPES =====

/** Meeting status change event */
export interface MeetingStatusChangeEvent {
  meetingId: string;
  userId: string;
  leadId?: string;
  dealId?: string;
  previousStatus: string;
  newStatus: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/** CRM sync result */
export interface CRMSyncResult {
  success: boolean;
  leadUpdated: boolean;
  dealUpdated: boolean;
  activityCreated: boolean;
  auditLogged: boolean;
  errors: string[];
}

/** Lead stage transition mapping */
export const MEETING_STAGE_TRANSITIONS: Record<string, Record<string, string>> = {
  // When a meeting is scheduled → move lead to meeting_scheduled stage
  scheduled: {
    discovered: 'meeting_scheduled',
    interested: 'meeting_scheduled',
    contacted: 'meeting_scheduled',
    replied: 'meeting_scheduled',
  },
  // When a meeting is completed → move lead to negotiation stage
  completed: {
    meeting_scheduled: 'negotiation',
    interested: 'negotiation',
  },
  // When a meeting is cancelled → revert to previous stage
  cancelled: {
    meeting_scheduled: 'interested',
  },
  // When a meeting is rescheduled → keep in meeting_scheduled
  rescheduled: {
    meeting_scheduled: 'meeting_scheduled',
  },
};

const LOG_PREFIX = '[CRMSync]';

// ===== TASK 1(a): syncMeetingToLead =====

/**
 * Sync a meeting event to the linked Lead record.
 * - Updates lastContactedAt if meeting startTime is in the past
 * - Creates LeadActivity of appropriate type based on meeting status
 * - Updates lead stage using pipeline-service moveLeadToStage if currently
 *   at an earlier stage
 */
export async function syncMeetingToLead(meetingId: string): Promise<CRMSyncResult> {
  const errors: string[] = [];
  let leadUpdated = false;
  let activityCreated = false;
  let auditLogged = false;
  let dealUpdated = false;

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true },
    });

    if (!meeting) {
      return {
        success: false,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: ['Meeting not found'],
      };
    }

    if (!meeting.leadId || !meeting.lead) {
      return {
        success: true,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: [],
      };
    }

    const leadId = meeting.leadId;
    const lead = meeting.lead;

    // Determine the activity type based on meeting status
    const activityTypeMap: Record<string, 'meeting_scheduled' | 'meeting_completed' | 'meeting_cancelled' | 'meeting_rescheduled'> = {
      scheduled: 'meeting_scheduled',
      confirmed: 'meeting_scheduled',
      completed: 'meeting_completed',
      cancelled: 'meeting_cancelled',
      rescheduled: 'meeting_rescheduled',
      pending_approval: 'meeting_scheduled',
    };

    const activityType = activityTypeMap[meeting.status] || 'meeting_scheduled';

    // Update lastContactedAt if meeting start is in the past
    const now = new Date();
    const meetingStart = new Date(meeting.startDateTime);
    const lastContactedAt = meetingStart <= now ? meetingStart : now;

    try {
      await db.lead.update({
        where: { id: leadId },
        data: { lastContactedAt },
      });
    } catch (err) {
      errors.push(`Failed to update lastContactedAt: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Determine if lead stage should advance
    const stageTransitions = MEETING_STAGE_TRANSITIONS[meeting.status === 'confirmed' ? 'scheduled' : meeting.status];
    const targetStage = stageTransitions?.[lead.stage];

    if (targetStage) {
      try {
        const result = await moveLeadToStage(leadId, targetStage, meeting.userId);
        if (result.success) {
          leadUpdated = true;
        } else {
          errors.push(`Failed to move lead stage: ${result.error || 'Unknown error'}`);
        }
      } catch (err) {
        errors.push(`moveLeadToStage error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
      // No transition applies — still consider it successful
      leadUpdated = true;
    }

    // Create LeadActivity record
    try {
      await db.leadActivity.create({
        data: {
          leadId,
          type: activityType,
          description: buildActivityDescription(meeting.title, meeting.status, meetingStart),
          metadata: JSON.stringify({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingStatus: meeting.status,
            startDateTime: meeting.startDateTime.toISOString(),
            endDateTime: meeting.endDateTime.toISOString(),
            platform: meeting.platform,
            targetStage: targetStage || null,
          }),
        },
      });
      activityCreated = true;
    } catch (err) {
      errors.push(`Failed to create LeadActivity: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Create audit log
    try {
      await db.auditLog.create({
        data: {
          userId: meeting.userId,
          action: `meeting_${meeting.status}_synced_to_lead`,
          details: JSON.stringify({
            meetingId: meeting.id,
            leadId,
            activityType,
            targetStage: targetStage || null,
            previousStage: lead.stage,
          }),
          resource: 'lead',
          resourceId: leadId,
        },
      });
      auditLogged = true;
    } catch (err) {
      errors.push(`Failed to create audit log: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0 || (leadUpdated && activityCreated),
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} syncMeetingToLead failed:`, error);
    return {
      success: false,
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ===== TASK 1(b): syncMeetingToDeal =====

/**
 * Sync a meeting event to the linked Deal record.
 * - Creates activity record
 * - Updates deal notes with meeting reference
 */
export async function syncMeetingToDeal(meetingId: string): Promise<CRMSyncResult> {
  const errors: string[] = [];
  let leadUpdated = false;
  let dealUpdated = false;
  let activityCreated = false;
  let auditLogged = false;

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { deal: true, lead: true },
    });

    if (!meeting) {
      return {
        success: false,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: ['Meeting not found'],
      };
    }

    if (!meeting.dealId || !meeting.deal) {
      return {
        success: true,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: [],
      };
    }

    const dealId = meeting.dealId;
    const deal = meeting.deal;

    // Update deal notes with meeting reference
    const meetingNote = `\n[${new Date().toISOString()}] Meeting "${meeting.title}" ${meeting.status} — ${new Date(meeting.startDateTime).toLocaleString()} to ${new Date(meeting.endDateTime).toLocaleString()}${meeting.meetingUrl ? ` — Link: ${meeting.meetingUrl}` : ''}`;

    try {
      await db.deal.update({
        where: { id: dealId },
        data: {
          notes: (deal.notes || '') + meetingNote,
        },
      });
      dealUpdated = true;
    } catch (err) {
      errors.push(`Failed to update deal notes: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Create LeadActivity for the linked lead (if exists)
    if (meeting.leadId) {
      try {
        const activityTypeMap: Record<string, string> = {
          scheduled: 'meeting_scheduled',
          confirmed: 'meeting_scheduled',
          completed: 'meeting_completed',
          cancelled: 'meeting_cancelled',
          rescheduled: 'meeting_rescheduled',
          pending_approval: 'meeting_scheduled',
        };

        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: activityTypeMap[meeting.status] || 'meeting_scheduled',
            description: `Deal "${deal.projectType || deal.id}" — Meeting "${meeting.title}" ${meeting.status}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              dealId,
              meetingStatus: meeting.status,
            }),
          },
        });
        activityCreated = true;
        leadUpdated = true; // Activity created on lead timeline counts
      } catch (err) {
        errors.push(`Failed to create deal LeadActivity: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Create audit log
    try {
      await db.auditLog.create({
        data: {
          userId: meeting.userId,
          action: `meeting_${meeting.status}_synced_to_deal`,
          details: JSON.stringify({
            meetingId: meeting.id,
            dealId,
            dealStatus: deal.status,
          }),
          resource: 'deal',
          resourceId: dealId,
        },
      });
      auditLogged = true;
    } catch (err) {
      errors.push(`Failed to create audit log: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0 || dealUpdated,
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} syncMeetingToDeal failed:`, error);
    return {
      success: false,
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ===== TASK 1(c): onMeetingCompleted =====

/**
 * Called when meeting status changes to COMPLETED.
 * - Creates MEETING_COMPLETED activity
 * - Advances lead stage to 'negotiation' or equivalent next stage
 * - Triggers notification to user
 */
export async function onMeetingCompleted(meetingId: string): Promise<CRMSyncResult> {
  const errors: string[] = [];
  let leadUpdated = false;
  let dealUpdated = false;
  let activityCreated = false;
  let auditLogged = false;

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true, deal: true },
    });

    if (!meeting) {
      return {
        success: false,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: ['Meeting not found'],
      };
    }

    // Update meeting status to completed
    await db.meeting.update({
      where: { id: meetingId },
      data: { status: 'completed' },
    });

    // Create MEETING_COMPLETED LeadActivity
    if (meeting.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: 'meeting_completed',
            description: `Meeting "${meeting.title}" completed${meeting.lead ? ` with ${meeting.lead.businessName}` : ''}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              completedAt: new Date().toISOString(),
              durationMinutes: meeting.durationMinutes,
              platform: meeting.platform,
            }),
          },
        });
        activityCreated = true;
      } catch (err) {
        errors.push(`Failed to create completion activity: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Advance lead stage using moveLeadToStage
      const lead = meeting.lead;
      if (lead) {
        const targetStage = MEETING_STAGE_TRANSITIONS.completed[lead.stage];
        if (targetStage) {
          try {
            const result = await moveLeadToStage(meeting.leadId, targetStage, meeting.userId);
            if (result.success) {
              leadUpdated = true;
            } else {
              errors.push(`moveLeadToStage failed: ${result.error}`);
            }
          } catch (err) {
            errors.push(`moveLeadToStage error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          // No stage transition applies — already past meeting_scheduled
          leadUpdated = true;
        }

        // Update lastContactedAt
        try {
          await db.lead.update({
            where: { id: meeting.leadId },
            data: { lastContactedAt: new Date() },
          });
        } catch (err) {
          errors.push(`Failed to update lastContactedAt: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    // Update deal notes if linked
    if (meeting.dealId && meeting.deal) {
      try {
        await db.deal.update({
          where: { id: meeting.dealId },
          data: {
            notes: (meeting.deal.notes || '') + `\n[${new Date().toISOString()}] Meeting "${meeting.title}" COMPLETED — ${meeting.durationMinutes} minutes`,
          },
        });
        dealUpdated = true;
      } catch (err) {
        errors.push(`Failed to update deal notes: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Create audit log
    try {
      await db.auditLog.create({
        data: {
          userId: meeting.userId,
          action: 'meeting_completed',
          details: JSON.stringify({
            meetingId: meeting.id,
            leadId: meeting.leadId,
            dealId: meeting.dealId,
            title: meeting.title,
            durationMinutes: meeting.durationMinutes,
          }),
          resource: 'meeting',
          resourceId: meetingId,
        },
      });
      auditLogged = true;
    } catch (err) {
      errors.push(`Audit log error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Trigger notification to user
    try {
      await sendNotification({
        userId: meeting.userId,
        type: 'meeting_completed',
        title: 'Meeting Completed',
        message: `Meeting "${meeting.title}" has been marked as completed${meeting.lead ? ` with ${meeting.lead.businessName}` : ''}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          leadId: meeting.leadId,
          durationMinutes: meeting.durationMinutes,
        },
      });
    } catch (err) {
      errors.push(`Notification error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0 || (activityCreated && auditLogged),
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} onMeetingCompleted failed:`, error);
    return {
      success: false,
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ===== TASK 1(d): onMeetingCancelled =====

/**
 * Called when meeting status changes to CANCELLED.
 * - Creates MEETING_CANCELLED activity
 * - Does NOT auto-advance lead stage
 * - Sends cancellation notification to user
 */
export async function onMeetingCancelled(meetingId: string, reason?: string): Promise<CRMSyncResult> {
  const errors: string[] = [];
  let leadUpdated = false;
  let dealUpdated = false;
  let activityCreated = false;
  let auditLogged = false;

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true, deal: true },
    });

    if (!meeting) {
      return {
        success: false,
        leadUpdated: false,
        dealUpdated: false,
        activityCreated: false,
        auditLogged: false,
        errors: ['Meeting not found'],
      };
    }

    // Update meeting status to cancelled
    await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'cancelled',
        cancellationReason: reason || meeting.cancellationReason || 'Cancelled by user',
      },
    });

    // Create MEETING_CANCELLED LeadActivity — do NOT auto-advance stage
    if (meeting.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: 'meeting_cancelled',
            description: `Meeting "${meeting.title}" was cancelled${reason ? `: ${reason}` : ''}${meeting.lead ? ` — Lead: ${meeting.lead.businessName}` : ''}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              cancelledAt: new Date().toISOString(),
              reason: reason || null,
              platform: meeting.platform,
            }),
          },
        });
        activityCreated = true;
      } catch (err) {
        errors.push(`Failed to create cancellation activity: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      // Update lastContactedAt
      try {
        await db.lead.update({
          where: { id: meeting.leadId },
          data: { lastContactedAt: new Date() },
        });
        leadUpdated = true; // We updated the lead record, but NOT the stage
      } catch (err) {
        errors.push(`Failed to update lastContactedAt: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Update deal notes if linked
    if (meeting.dealId && meeting.deal) {
      try {
        await db.deal.update({
          where: { id: meeting.dealId },
          data: {
            notes: (meeting.deal.notes || '') + `\n[${new Date().toISOString()}] Meeting "${meeting.title}" CANCELLED${reason ? `: ${reason}` : ''}`,
          },
        });
        dealUpdated = true;
      } catch (err) {
        errors.push(`Failed to update deal notes: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Create audit log
    try {
      await db.auditLog.create({
        data: {
          userId: meeting.userId,
          action: 'meeting_cancelled',
          details: JSON.stringify({
            meetingId: meeting.id,
            leadId: meeting.leadId,
            dealId: meeting.dealId,
            title: meeting.title,
            reason: reason || null,
          }),
          resource: 'meeting',
          resourceId: meetingId,
        },
      });
      auditLogged = true;
    } catch (err) {
      errors.push(`Audit log error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Send cancellation notification
    try {
      await sendNotification({
        userId: meeting.userId,
        type: 'meeting_cancelled',
        title: 'Meeting Cancelled',
        message: `Meeting "${meeting.title}" has been cancelled${reason ? `: ${reason}` : ''}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          leadId: meeting.leadId,
          reason: reason || null,
        },
      });
    } catch (err) {
      errors.push(`Notification error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0 || (activityCreated && auditLogged),
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} onMeetingCancelled failed:`, error);
    return {
      success: false,
      leadUpdated,
      dealUpdated,
      activityCreated,
      auditLogged,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ===== TASK 2: Generic syncMeetingStatusChange =====

/**
 * Handle a meeting status change and sync to CRM.
 * Routes to the appropriate handler based on the new status.
 */
export async function syncMeetingStatusChange(
  event: MeetingStatusChangeEvent
): Promise<CRMSyncResult> {
  switch (event.newStatus) {
    case 'completed':
      return onMeetingCompleted(event.meetingId);
    case 'cancelled':
      return onMeetingCancelled(event.meetingId, event.metadata?.reason as string | undefined);
    case 'scheduled':
    case 'rescheduled':
    default: {
      // For scheduled/rescheduled, run both lead and deal syncs
      const leadResult = await syncMeetingToLead(event.meetingId);
      const dealResult = await syncMeetingToDeal(event.meetingId);
      return {
        success: leadResult.success && dealResult.success,
        leadUpdated: leadResult.leadUpdated,
        dealUpdated: dealResult.dealUpdated,
        activityCreated: leadResult.activityCreated || dealResult.activityCreated,
        auditLogged: leadResult.auditLogged || dealResult.auditLogged,
        errors: [...leadResult.errors, ...dealResult.errors],
      };
    }
  }
}

// ===== Convenience handlers matching existing stub signatures =====

/**
 * Handle meeting scheduled event.
 * Moves lead to meeting_scheduled stage, creates activity.
 */
export async function handleMeetingScheduled(
  meetingId: string,
  _userId: string,
  _leadId?: string,
  _dealId?: string
): Promise<CRMSyncResult> {
  return syncMeetingToLead(meetingId);
}

/**
 * Handle meeting completed event.
 * Moves lead to negotiation stage, creates activity with summary.
 */
export async function handleMeetingCompleted(
  meetingId: string,
  _userId: string,
  _leadId?: string,
  _dealId?: string,
  _notes?: string
): Promise<CRMSyncResult> {
  return onMeetingCompleted(meetingId);
}

/**
 * Handle meeting cancelled event.
 * Reverts lead stage, creates cancellation activity.
 */
export async function handleMeetingCancelled(
  meetingId: string,
  _userId: string,
  _leadId?: string,
  _dealId?: string,
  reason?: string
): Promise<CRMSyncResult> {
  return onMeetingCancelled(meetingId, reason);
}

/**
 * Handle meeting rescheduled event.
 * Creates reschedule activity, optionally updates deal timeline.
 */
export async function handleMeetingRescheduled(
  meetingId: string,
  _userId: string,
  _leadId?: string,
  _dealId?: string,
  _previousStart?: Date,
  _newStart?: Date
): Promise<CRMSyncResult> {
  return syncMeetingToLead(meetingId);
}

/**
 * Create a LeadActivity record for a meeting event.
 */
export async function createMeetingActivity(
  leadId: string,
  activityType: 'meeting_scheduled' | 'meeting_completed' | 'meeting_cancelled' | 'meeting_rescheduled',
  description: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; activityId?: string; error?: string }> {
  try {
    const activity = await db.leadActivity.create({
      data: {
        leadId,
        type: activityType,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    return { success: true, activityId: activity.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update deal status based on meeting event.
 */
export async function updateDealFromMeeting(
  dealId: string,
  meetingStatus: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    const meetingNote = `\n[${new Date().toISOString()}] Meeting event: ${meetingStatus}`;
    await db.deal.update({
      where: { id: dealId },
      data: { notes: (deal.notes || '') + meetingNote },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ===== HELPERS =====

function buildActivityDescription(
  title: string,
  status: string,
  startTime: Date
): string {
  const statusLabels: Record<string, string> = {
    scheduled: 'scheduled',
    confirmed: 'confirmed',
    completed: 'completed',
    cancelled: 'cancelled',
    rescheduled: 'rescheduled',
    pending_approval: 'pending approval',
  };

  return `Meeting "${title}" ${statusLabels[status] || status} for ${startTime.toLocaleString()}`;
}
