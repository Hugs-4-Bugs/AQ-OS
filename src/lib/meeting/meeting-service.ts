// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Orchestration Service
// Core service for autonomous meeting scheduling, CRM sync,
// intent detection, and multi-platform conferencing integration.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { sendEmail } from '@/lib/email';
import { sendNotification } from '@/lib/notification-engine';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Attendee record stored as JSON in Meeting.attendees */
export interface MeetingAttendee {
  email: string;
  name?: string;
  status?: 'pending' | 'accepted' | 'declined' | 'tentative';
}

/** Agenda item stored as JSON in Meeting.agenda */
export interface AgendaItem {
  title: string;
  durationMinutes?: number;
  description?: string;
}

/** Reminder config stored as JSON in Meeting.reminders */
export interface MeetingReminder {
  minutesBefore: number;
  type: 'email' | 'notification' | 'both';
  sent?: boolean;
}

/** Follow-up action stored as JSON in Meeting.followUpActions */
export interface FollowUpAction {
  id: string;
  title: string;
  assignee?: string;
  dueDate?: string;
  completed: boolean;
  notes?: string;
}

/** Google Calendar API response for conference data */
export interface GoogleConferenceData {
  createRequest?: {
    requestId: string;
    conferenceSolutionKey: {
      type: string;
    };
    status: {
      statusCode: string;
    };
  };
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
  }>;
  conferenceId?: string;
  conferenceSolution?: {
    key: {
      type: string;
    };
    name: string;
    iconUri: string;
  };
}

/** Parameters for creating a Google Calendar event */
export interface CreateCalendarEventParams {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  conferenceData?: GoogleConferenceData;
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
  location?: string;
}

/** Parameters for creating a platform event */
export interface CreatePlatformEventParams {
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime: Date;
  durationMinutes: number;
  timezone: string;
  attendees: MeetingAttendee[];
  location?: string;
  descriptionHtml?: string;
}

/** Result from a platform event creation */
export interface PlatformEventResult {
  meetingUrl: string;
  conferenceData: GoogleConferenceData | null;
  eventId: string;
}

/** Parameters for creating a meeting */
export interface CreateMeetingParams {
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
  agenda?: AgendaItem[];
  attendees?: MeetingAttendee[];
  location?: string;
  reminders?: MeetingReminder[];
  approvalMode?: 'auto' | 'manual';
  createdBy?: 'user' | 'ai_suggestion' | 'ai_auto';
  metadata?: Record<string, unknown>;
}

/** Parameters for updating a meeting */
export interface UpdateMeetingParams {
  title?: string;
  description?: string;
  meetingType?: string;
  platform?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  durationMinutes?: number;
  timezone?: string;
  agenda?: AgendaItem[];
  attendees?: MeetingAttendee[];
  location?: string;
  reminders?: MeetingReminder[];
  status?: string;
  metadata?: Record<string, unknown>;
}

/** Filter options for listing meetings */
export interface MeetingFilters {
  status?: string;
  leadId?: string;
  dealId?: string;
  meetingType?: string;
  platform?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/** Time slot for availability */
export interface TimeSlot {
  start: Date;
  end: Date;
  isAvailable: boolean;
}

/** Suggested meeting time with scoring */
export interface SuggestedMeetingTime {
  start: Date;
  end: Date;
  score: number;
  reason: string;
  conflicts?: string[];
}

/** Meeting intent detection result */
export interface MeetingIntentResult {
  hasIntent: boolean;
  intentType: string;
  confidence: number;
  suggestedDuration: number;
  extractedDetails?: {
    date?: string;
    time?: string;
    platform?: string;
    topic?: string;
  };
}

/** Parameters for logging meeting intent */
export interface LogMeetingIntentParams {
  userId: string;
  leadId?: string;
  sourceType: string;
  sourceId?: string;
  detectedIntent: string;
  confidence: number;
  originalText: string;
  suggestedAction?: Record<string, unknown>;
}

/** Meeting analytics / stats */
export interface MeetingStats {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  avgDurationMinutes: number;
  conversionRate: number;
  completionRate: number;
  thisWeekTotal: number;
  thisMonthTotal: number;
}

// ═══════════════════════════════════════════════════════════════════
// LOGGING PREFIX
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MeetingService]';

// ═══════════════════════════════════════════════════════════════════
// PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════════

const PIPELINE_STAGES = {
  INTERESTED: 'interested',
  MEETING_SCHEDULED: 'meeting_scheduled',
  MEETING_COMPLETED: 'meeting_completed',
  PROPOSAL_PENDING: 'proposal_pending',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;

// ═══════════════════════════════════════════════════════════════════
// 7. EXTENSIBLE PLATFORM ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════

/**
 * Abstract adapter interface for meeting platform integrations.
 * Each platform (Google Meet, Zoom, Teams, Calendly) implements this.
 */
export interface MeetingPlatformAdapter {
  /** Create a new meeting event on the platform */
  createEvent(params: CreatePlatformEventParams): Promise<PlatformEventResult>;
  /** Update an existing event */
  updateEvent(eventId: string, params: Partial<CreatePlatformEventParams>): Promise<void>;
  /** Delete/cancel an existing event */
  deleteEvent(eventId: string): Promise<void>;
  /** Generate a join URL for an event */
  generateJoinUrl(eventId: string): Promise<string>;
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE MEET ADAPTER
// ═══════════════════════════════════════════════════════════════════

/**
 * Google Meet adapter implementing MeetingPlatformAdapter.
 * Uses Google Calendar API v3 with conferenceData for Meet link generation.
 */
export class GoogleMeetAdapter implements MeetingPlatformAdapter {
  private GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

  /**
   * Get a valid access token for the Google Calendar API.
   */
  private async getAccessToken(userId: string): Promise<string> {
    const { accessToken } = await getValidCalendarAccessToken(userId);
    return accessToken;
  }

  /**
   * Create a Google Calendar event with Google Meet conference data.
   */
  async createEvent(params: CreatePlatformEventParams): Promise<PlatformEventResult> {
    const accessToken = await this.getAccessToken(params.attendees[0]?.email ? '' : '');
    // We need userId to get token — will be handled by createGoogleMeetEvent
    throw new Error('Use createGoogleMeetEvent directly with userId for token resolution');
  }

  /**
   * Update a Google Calendar event.
   */
  async updateEvent(eventId: string, params: Partial<CreatePlatformEventParams>): Promise<void> {
    throw new Error('Use updateGoogleCalendarEvent directly with userId for token resolution');
  }

  /**
   * Delete a Google Calendar event.
   */
  async deleteEvent(eventId: string): Promise<void> {
    throw new Error('Use deleteGoogleCalendarEvent directly with userId for token resolution');
  }

  /**
   * Generate a Google Meet join URL for an event.
   */
  async generateJoinUrl(eventId: string): Promise<string> {
    throw new Error('Use getGoogleCalendarEvent directly with userId for token resolution');
  }
}

// ═══════════════════════════════════════════════════════════════════
// PLATFORM FACTORY
// ═══════════════════════════════════════════════════════════════════

/**
 * Factory function that returns the correct platform adapter.
 * Currently supports Google Meet. Extensible to Zoom, Teams, Calendly.
 *
 * @param platform - Platform identifier (google_meet, zoom, teams, calendly)
 * @throws {Error} When platform is not supported
 */
export function getPlatformAdapter(platform: string): MeetingPlatformAdapter {
  const adapters: Record<string, () => MeetingPlatformAdapter> = {
    google_meet: () => new GoogleMeetAdapter(),
    // Future adapters:
    // zoom: () => new ZoomAdapter(),
    // teams: () => new TeamsAdapter(),
    // calendly: () => new CalendlyAdapter(),
  };

  const factory = adapters[platform];
  if (!factory) {
    console.warn(`${LOG_PREFIX} Unsupported platform "${platform}", falling back to Google Meet`);
    return new GoogleMeetAdapter();
  }

  return factory();
}

// ═══════════════════════════════════════════════════════════════════
// 1. GOOGLE MEET INTEGRATION
// ═══════════════════════════════════════════════════════════════════

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

/**
 * Create a Google Calendar event WITH Google Meet conference data.
 * Uses conferenceDataVersion=1 to enable automatic Meet link generation.
 *
 * @param userId - The user whose Google Calendar to use
 * @param params - Event parameters including title, time, attendees
 * @returns The created Google Calendar event with Meet URL
 */
export async function createGoogleMeetEvent(
  userId: string,
  params: {
    summary: string;
    description?: string;
    startDateTime: Date;
    endDateTime: Date;
    timezone: string;
    attendees?: Array<{ email: string; name?: string }>;
    location?: string;
    reminders?: Array<{ method: string; minutes: number }>;
  }
): Promise<{
  eventId: string;
  meetLink: string;
  conferenceData: GoogleConferenceData | null;
  htmlLink: string;
}> {
  console.log(`${LOG_PREFIX} Creating Google Meet event for user ${userId}: "${params.summary}"`);

  try {
    const { accessToken, calendarToken } = await getValidCalendarAccessToken(userId);

    const requestId = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const body: Record<string, unknown> = {
      summary: params.summary,
      start: {
        dateTime: params.startDateTime.toISOString(),
        timeZone: params.timezone || 'UTC',
      },
      end: {
        dateTime: params.endDateTime.toISOString(),
        timeZone: params.timezone || 'UTC',
      },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: {
            type: 'eventNamedHangout',
          },
        },
      },
    };

    if (params.description) {
      body.description = params.description;
    }

    if (params.attendees && params.attendees.length > 0) {
      body.attendees = params.attendees.map((a) => ({
        email: a.email,
        displayName: a.name || undefined,
      }));
    }

    if (params.location) {
      body.location = params.location;
    }

    if (params.reminders && params.reminders.length > 0) {
      body.reminders = {
        useDefault: false,
        overrides: params.reminders,
      };
    }

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Google Calendar event creation failed:`, errorBody);
      throw new Error(`Failed to create Google Calendar event: ${res.status} ${errorBody}`);
    }

    const event = (await res.json()) as Record<string, unknown>;

    // Extract Meet link from conferenceData
    const conferenceData = event.conferenceData as GoogleConferenceData | null;
    let meetLink = '';
    if (conferenceData?.entryPoints) {
      const hangoutLink = conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === 'video'
      );
      meetLink = hangoutLink?.uri || '';
    }

    console.log(
      `${LOG_PREFIX} Google Meet event created successfully. Event ID: ${event.id}, Meet link: ${meetLink || 'pending'}`
    );

    return {
      eventId: event.id as string,
      meetLink,
      conferenceData,
      htmlLink: (event.htmlLink as string) || '',
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating Google Meet event:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to create Google Meet event');
  }
}

/**
 * Update an existing Google Calendar event.
 *
 * @param userId - The user whose Google Calendar to use
 * @param calendarEventId - The Google Calendar event ID to update
 * @param params - Fields to update
 */
export async function updateGoogleCalendarEvent(
  userId: string,
  calendarEventId: string,
  params: {
    summary?: string;
    description?: string;
    startDateTime?: Date;
    endDateTime?: Date;
    timezone?: string;
    attendees?: Array<{ email: string; name?: string; responseStatus?: string }>;
    location?: string;
    reminders?: Array<{ method: string; minutes: number }>;
  }
): Promise<void> {
  console.log(`${LOG_PREFIX} Updating Google Calendar event ${calendarEventId} for user ${userId}`);

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const body: Record<string, unknown> = {};

    if (params.summary !== undefined) body.summary = params.summary;
    if (params.description !== undefined) body.description = params.description;
    if (params.startDateTime) {
      body.start = {
        dateTime: params.startDateTime.toISOString(),
        timeZone: params.timezone || 'UTC',
      };
    }
    if (params.endDateTime) {
      body.end = {
        dateTime: params.endDateTime.toISOString(),
        timeZone: params.timezone || 'UTC',
      };
    }
    if (params.attendees) {
      body.attendees = params.attendees.map((a) => ({
        email: a.email,
        displayName: a.name || undefined,
        responseStatus: a.responseStatus || undefined,
      }));
    }
    if (params.location !== undefined) body.location = params.location;
    if (params.reminders) {
      body.reminders = {
        useDefault: false,
        overrides: params.reminders,
      };
    }

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(calendarEventId)}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Google Calendar event update failed:`, errorBody);
      throw new Error(`Failed to update Google Calendar event: ${res.status} ${errorBody}`);
    }

    console.log(`${LOG_PREFIX} Google Calendar event ${calendarEventId} updated successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating Google Calendar event:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to update Google Calendar event');
  }
}

/**
 * Cancel/delete a Google Calendar event.
 *
 * @param userId - The user whose Google Calendar to use
 * @param calendarEventId - The Google Calendar event ID to delete
 */
export async function deleteGoogleCalendarEvent(
  userId: string,
  calendarEventId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} Deleting Google Calendar event ${calendarEventId} for user ${userId}`);

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(calendarEventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok && res.status !== 410) {
      // 410 means the event was already gone
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Google Calendar event deletion failed:`, errorBody);
      throw new Error(`Failed to delete Google Calendar event: ${res.status} ${errorBody}`);
    }

    console.log(`${LOG_PREFIX} Google Calendar event ${calendarEventId} deleted successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error deleting Google Calendar event:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to delete Google Calendar event');
  }
}

/**
 * Get a single Google Calendar event by ID.
 *
 * @param userId - The user whose Google Calendar to use
 * @param calendarEventId - The Google Calendar event ID
 * @returns The Google Calendar event object
 */
export async function getGoogleCalendarEvent(
  userId: string,
  calendarEventId: string
): Promise<Record<string, unknown>> {
  console.log(`${LOG_PREFIX} Fetching Google Calendar event ${calendarEventId} for user ${userId}`);

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(calendarEventId)}?conferenceDataVersion=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Google Calendar event fetch failed:`, errorBody);
      throw new Error(`Failed to fetch Google Calendar event: ${res.status} ${errorBody}`);
    }

    const event = (await res.json()) as Record<string, unknown>;
    console.log(`${LOG_PREFIX} Google Calendar event ${calendarEventId} fetched successfully`);
    return event;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching Google Calendar event:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to fetch Google Calendar event');
  }
}

/**
 * Check calendar availability using Google Calendar freebusy query.
 * Returns busy slots within the requested time window.
 *
 * @param userId - The user whose calendar to check
 * @param timeMin - Start of the query window (ISO string or Date)
 * @param timeMax - End of the query window (ISO string or Date)
 * @param durationMinutes - Minimum slot duration to check (default 30)
 * @returns Array of busy time windows { start, end }
 */
export async function checkAvailability(
  userId: string,
  timeMin: Date | string,
  timeMax: Date | string,
  durationMinutes: number = 30
): Promise<Array<{ start: Date; end: Date }>> {
  console.log(
    `${LOG_PREFIX} Checking availability for user ${userId} in window ${String(timeMin)} to ${String(timeMax)}`
  );

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const tMin = typeof timeMin === 'string' ? timeMin : timeMin.toISOString();
    const tMax = typeof timeMax === 'string' ? timeMax : timeMax.toISOString();

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/freeBusy`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: tMin,
          timeMax: tMax,
          items: [{ id: 'primary' }],
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Freebusy query failed:`, errorBody);
      throw new Error(`Failed to check availability: ${res.status} ${errorBody}`);
    }

    const data = (await res.json()) as {
      kind: string;
      calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
    };

    const busySlots = (data.calendars?.primary?.busy || []).map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));

    console.log(
      `${LOG_PREFIX} Availability check complete. Found ${busySlots.length} busy slots.`
    );

    return busySlots;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking availability:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to check calendar availability');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. MEETING CRUD (DATABASE)
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new meeting record in the database AND create the Google Calendar event.
 * Sends notification and creates LeadActivity if linked to a lead.
 *
 * @param params - Meeting creation parameters
 * @returns The created meeting record
 */
export async function createMeeting(params: CreateMeetingParams) {
  console.log(`${LOG_PREFIX} Creating meeting: "${params.title}" for user ${params.userId}`);

  try {
    // 1. Get user settings for default platform
    const settings = await db.userSettings.findUnique({
      where: { userId: params.userId },
    });

    const platform = params.platform || settings?.meetingPlatform || 'google_meet';
    const timezone = params.timezone || settings?.meetingTimezone || 'UTC';
    const durationMinutes = params.durationMinutes || settings?.meetingDurationDefault || 30;

    // 2. Create Google Calendar event if using google_meet
    let calendarEventId: string | null = null;
    let meetingUrl: string | null = null;
    let conferenceDataStr: string | null = null;

    if (platform === 'google_meet') {
      try {
        const calendarResult = await createGoogleMeetEvent(params.userId, {
          summary: params.title,
          description: params.description,
          startDateTime: params.startDateTime,
          endDateTime: params.endDateTime,
          timezone,
          attendees: params.attendees,
          location: params.location,
          reminders: params.reminders?.map((r) => ({
            method: r.type === 'email' ? 'email' : 'popup',
            minutes: r.minutesBefore,
          })),
        });

        calendarEventId = calendarResult.eventId;
        meetingUrl = calendarResult.meetLink || null;
        conferenceDataStr = calendarResult.conferenceData
          ? JSON.stringify(calendarResult.conferenceData)
          : null;
      } catch (error) {
        console.warn(
          `${LOG_PREFIX} Failed to create Google Calendar event, creating meeting without it:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        // Continue creating the meeting without the calendar link
      }
    }

    // 3. Determine initial status
    const approvalMode = params.approvalMode || (settings?.meetingAutoSchedule ? 'auto' : 'manual');
    const status = approvalMode === 'auto' ? 'scheduled' : 'pending_approval';
    const approvalStatus = approvalMode === 'auto' ? 'approved' : 'pending';

    // 4. Create the meeting record
    const meeting = await db.meeting.create({
      data: {
        userId: params.userId,
        leadId: params.leadId || null,
        dealId: params.dealId || null,
        title: params.title,
        description: params.description || null,
        meetingType: params.meetingType || 'video',
        platform,
        meetingUrl,
        calendarEventId,
        status,
        startDateTime: params.startDateTime,
        endDateTime: params.endDateTime,
        durationMinutes,
        timezone,
        agenda: params.agenda ? JSON.stringify(params.agenda) : null,
        attendees: JSON.stringify(params.attendees || []),
        location: params.location || null,
        conferenceData: conferenceDataStr,
        reminders: JSON.stringify(params.reminders || [
          { minutesBefore: 60, type: 'email' },
          { minutesBefore: 15, type: 'notification' },
        ]),
        createdBy: params.createdBy || 'user',
        approvalStatus,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    console.log(`${LOG_PREFIX} Meeting created successfully. ID: ${meeting.id}, Status: ${meeting.status}`);

    // 5. Create LeadActivity if linked to a lead
    if (params.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: params.leadId,
            type: 'meeting_scheduled',
            description: `Meeting "${params.title}" scheduled for ${formatDateTime(params.startDateTime, timezone)}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              meetingType: params.meetingType || 'video',
              platform,
            }),
          },
        });
      } catch (activityError) {
        console.warn(`${LOG_PREFIX} Failed to create lead activity:`, activityError);
      }
    }

    // 6. Sync CRM (update lead/deal stage)
    if (params.leadId) {
      try {
        await syncMeetingWithCRM(meeting.id);
      } catch (crmError) {
        console.warn(`${LOG_PREFIX} CRM sync failed during meeting creation:`, crmError);
      }
    }

    // 7. Send notification
    try {
      await sendNotification({
        userId: params.userId,
        type: 'meeting_scheduled' as string,
        title: 'Meeting Scheduled',
        message: `"${params.title}" has been scheduled for ${formatDateTime(params.startDateTime, timezone)}`,
        actionUrl: `/meetings/${meeting.id}`,
        metadata: {
          meetingId: meeting.id,
          meetingTitle: params.title,
          startDateTime: params.startDateTime.toISOString(),
          leadId: params.leadId || null,
        },
      });
    } catch (notifError) {
      console.warn(`${LOG_PREFIX} Failed to send meeting notification:`, notifError);
    }

    // 8. Audit log
    await createAuditLog(params.userId, 'meeting_created', {
      meetingId: meeting.id,
      title: params.title,
      platform,
      leadId: params.leadId,
      dealId: params.dealId,
    }, 'meeting', meeting.id);

    return meeting;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating meeting:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to create meeting');
  }
}

/**
 * Update an existing meeting and sync changes to Google Calendar.
 *
 * @param meetingId - The meeting ID to update
 * @param params - Fields to update
 * @param userId - The user performing the update (for authorization)
 * @returns The updated meeting record
 */
export async function updateMeeting(meetingId: string, params: UpdateMeetingParams, userId: string) {
  console.log(`${LOG_PREFIX} Updating meeting ${meetingId}`);

  try {
    // 1. Fetch existing meeting
    const existing = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!existing) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (existing.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }

    // 2. Build update data
    const updateData: Record<string, unknown> = {};
    if (params.title !== undefined) updateData.title = params.title;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.meetingType !== undefined) updateData.meetingType = params.meetingType;
    if (params.platform !== undefined) updateData.platform = params.platform;
    if (params.startDateTime !== undefined) updateData.startDateTime = params.startDateTime;
    if (params.endDateTime !== undefined) updateData.endDateTime = params.endDateTime;
    if (params.durationMinutes !== undefined) updateData.durationMinutes = params.durationMinutes;
    if (params.timezone !== undefined) updateData.timezone = params.timezone;
    if (params.agenda !== undefined) updateData.agenda = JSON.stringify(params.agenda);
    if (params.attendees !== undefined) updateData.attendees = JSON.stringify(params.attendees);
    if (params.location !== undefined) updateData.location = params.location;
    if (params.reminders !== undefined) updateData.reminders = JSON.stringify(params.reminders);
    if (params.status !== undefined) updateData.status = params.status;
    if (params.metadata !== undefined) updateData.metadata = JSON.stringify(params.metadata);

    // 3. Sync to Google Calendar
    if (existing.calendarEventId && existing.platform === 'google_meet') {
      try {
        await updateGoogleCalendarEvent(userId, existing.calendarEventId, {
          summary: params.title,
          description: params.description,
          startDateTime: params.startDateTime,
          endDateTime: params.endDateTime,
          timezone: params.timezone || existing.timezone,
          attendees: params.attendees,
          location: params.location,
          reminders: params.reminders?.map((r) => ({
            method: r.type === 'email' ? 'email' : 'popup',
            minutes: r.minutesBefore,
          })),
        });
      } catch (calendarError) {
        console.warn(
          `${LOG_PREFIX} Failed to sync meeting update to Google Calendar:`,
          calendarError
        );
      }
    }

    // 4. Update database record
    const updated = await db.meeting.update({
      where: { id: meetingId },
      data: updateData,
    });

    console.log(`${LOG_PREFIX} Meeting ${meetingId} updated successfully`);

    // 5. Audit log
    await createAuditLog(userId, 'meeting_updated', {
      meetingId: updated.id,
      changes: Object.keys(updateData),
    }, 'meeting', updated.id);

    return updated;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to update meeting');
  }
}

/**
 * Cancel a meeting, delete Google Calendar event, and update lead status.
 *
 * @param meetingId - The meeting ID to cancel
 * @param userId - The user performing the cancellation
 * @param reason - Optional cancellation reason
 */
export async function cancelMeeting(
  meetingId: string,
  userId: string,
  reason?: string
) {
  console.log(`${LOG_PREFIX} Cancelling meeting ${meetingId}`);

  try {
    // 1. Fetch meeting
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }
    if (meeting.status === 'cancelled') {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} is already cancelled`);
      return meeting;
    }

    // 2. Delete Google Calendar event
    if (meeting.calendarEventId && meeting.platform === 'google_meet') {
      try {
        await deleteGoogleCalendarEvent(userId, meeting.calendarEventId);
      } catch (calendarError) {
        console.warn(
          `${LOG_PREFIX} Failed to delete Google Calendar event:`,
          calendarError
        );
      }
    }

    // 3. Update meeting status
    const cancelled = await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'cancelled',
        cancellationReason: reason || null,
      },
    });

    // 4. Log lead activity if linked to lead
    if (meeting.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: 'meeting_cancelled',
            description: `Meeting "${meeting.title}" was cancelled${reason ? `: ${reason}` : ''}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              reason,
            }),
          },
        });
      } catch (activityError) {
        console.warn(`${LOG_PREFIX} Failed to create lead cancellation activity:`, activityError);
      }
    }

    // 5. Send cancellation notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_cancelled' as string,
        title: 'Meeting Cancelled',
        message: `"${meeting.title}" has been cancelled${reason ? `: ${reason}` : ''}`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: { meetingId, title: meeting.title, reason },
      });
    } catch (notifError) {
      console.warn(`${LOG_PREFIX} Failed to send cancellation notification:`, notifError);
    }

    // 6. Send cancellation email to attendees
    if (meeting.attendees) {
      try {
        const attendees: MeetingAttendee[] = JSON.parse(meeting.attendees);
        await sendMeetingCancellation(meeting, reason);
        // Log only for external attendees
        for (const attendee of attendees) {
          if (attendee.email) {
            await sendMeetingCancellation({ ...meeting, attendees: meeting.attendees } as typeof meeting, reason, attendee.email);
          }
        }
      } catch (emailError) {
        console.warn(`${LOG_PREFIX} Failed to send cancellation emails:`, emailError);
      }
    }

    // 7. Audit log
    await createAuditLog(userId, 'meeting_cancelled', {
      meetingId: cancelled.id,
      title: meeting.title,
      reason,
      leadId: meeting.leadId,
    }, 'meeting', cancelled.id);

    console.log(`${LOG_PREFIX} Meeting ${meetingId} cancelled successfully`);
    return cancelled;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error cancelling meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to cancel meeting');
  }
}

/**
 * Mark a meeting as completed, update lead pipeline stage, and log activity.
 *
 * @param meetingId - The meeting ID to complete
 * @param userId - The user performing the action
 * @param notes - Optional post-meeting notes
 * @param followUpActions - Optional follow-up action items
 */
export async function completeMeeting(
  meetingId: string,
  userId: string,
  notes?: string,
  followUpActions?: FollowUpAction[]
) {
  console.log(`${LOG_PREFIX} Completing meeting ${meetingId}`);

  try {
    // 1. Fetch meeting
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true, deal: true },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }
    if (meeting.status === 'completed') {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} is already completed`);
      return meeting;
    }

    // 2. Update meeting status
    const completed = await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'completed',
        notes: notes || null,
        followUpActions: followUpActions
          ? JSON.stringify(followUpActions)
          : meeting.followUpActions,
      },
    });

    // 3. Update lead pipeline stage to 'meeting_completed'
    if (meeting.leadId) {
      try {
        await db.lead.update({
          where: { id: meeting.leadId },
          data: { stage: PIPELINE_STAGES.MEETING_COMPLETED },
        });

        // Create lead activity
        await db.leadActivity.create({
          data: {
            leadId: meeting.leadId,
            type: 'meeting_completed',
            description: `Meeting "${meeting.title}" completed. ${notes ? `Notes: ${notes.substring(0, 100)}` : ''}`,
            metadata: JSON.stringify({
              meetingId: meeting.id,
              durationMinutes: meeting.durationMinutes,
              followUpActions: followUpActions?.length || 0,
            }),
          },
        });

        // Update deal status if linked
        if (meeting.dealId) {
          await db.deal.update({
            where: { id: meeting.dealId },
            data: { status: PIPELINE_STAGES.MEETING_COMPLETED },
          });
        }
      } catch (crmError) {
        console.warn(`${LOG_PREFIX} Failed to update CRM pipeline:`, crmError);
      }
    }

    // 4. Send notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_completed' as string,
        title: 'Meeting Completed',
        message: `"${meeting.title}" has been marked as completed`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: {
          meetingId: completed.id,
          title: meeting.title,
          leadId: meeting.leadId,
          followUpActions: followUpActions?.length || 0,
        },
      });
    } catch (notifError) {
      console.warn(`${LOG_PREFIX} Failed to send completion notification:`, notifError);
    }

    // 5. Audit log
    await createAuditLog(userId, 'meeting_completed', {
      meetingId: completed.id,
      title: meeting.title,
      leadId: meeting.leadId,
      dealId: meeting.dealId,
      durationMinutes: meeting.durationMinutes,
      followUpCount: followUpActions?.length || 0,
    }, 'meeting', completed.id);

    console.log(`${LOG_PREFIX} Meeting ${meetingId} completed successfully`);
    return completed;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error completing meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to complete meeting');
  }
}

/**
 * Get a single meeting with all details.
 *
 * @param meetingId - The meeting ID
 * @returns The meeting record or null if not found
 */
export async function getMeeting(meetingId: string) {
  console.log(`${LOG_PREFIX} Fetching meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
            phone: true,
            stage: true,
          },
        },
        deal: {
          select: {
            id: true,
            status: true,
            proposedPrice: true,
          },
        },
      },
    });

    return meeting;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to fetch meeting');
  }
}

/**
 * List meetings for a user with optional filtering.
 *
 * @param userId - The user whose meetings to list
 * @param filters - Optional filter criteria
 * @returns Array of meeting records
 */
export async function listMeetings(userId: string, filters?: MeetingFilters) {
  console.log(`${LOG_PREFIX} Listing meetings for user ${userId}`, filters ? `with filters: ${JSON.stringify(filters)}` : '');

  try {
    const where: Record<string, unknown> = { userId };

    if (filters?.status) where.status = filters.status;
    if (filters?.leadId) where.leadId = filters.leadId;
    if (filters?.dealId) where.dealId = filters.dealId;
    if (filters?.meetingType) where.meetingType = filters.meetingType;
    if (filters?.platform) where.platform = filters.platform;

    if (filters?.dateFrom || filters?.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
      if (filters.dateTo) dateFilter.lte = filters.dateTo;
      where.startDateTime = dateFilter;
    }

    const meetings = await db.meeting.findMany({
      where,
      orderBy: [{ startDateTime: 'desc' }, { createdAt: 'desc' }],
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
            stage: true,
          },
        },
        deal: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    const total = await db.meeting.count({ where });

    console.log(`${LOG_PREFIX} Found ${meetings.length} meetings (total: ${total})`);
    return { meetings, total };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error listing meetings:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to list meetings');
  }
}

/**
 * Reschedule a meeting with Google Calendar sync.
 * Creates a new meeting and marks the old one as rescheduled.
 *
 * @param meetingId - The meeting ID to reschedule
 * @param newStart - New start date/time
 * @param newEnd - New end date/time
 * @param userId - The user performing the reschedule
 */
export async function rescheduleMeeting(
  meetingId: string,
  newStart: Date,
  newEnd: Date,
  userId: string
) {
  console.log(`${LOG_PREFIX} Rescheduling meeting ${meetingId} to ${newStart.toISOString()}`);

  try {
    // 1. Fetch existing meeting
    const existing = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true },
    });

    if (!existing) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (existing.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }

    // 2. Cancel old Google Calendar event
    if (existing.calendarEventId && existing.platform === 'google_meet') {
      try {
        await deleteGoogleCalendarEvent(userId, existing.calendarEventId);
      } catch (calendarError) {
        console.warn(
          `${LOG_PREFIX} Failed to delete old calendar event during reschedule:`,
          calendarError
        );
      }
    }

    // 3. Mark existing meeting as rescheduled
    await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'rescheduled',
        metadata: JSON.stringify({
          ...(existing.metadata ? JSON.parse(existing.metadata) : {}),
          rescheduledTo: newStart.toISOString(),
          rescheduledAt: new Date().toISOString(),
        }),
      },
    });

    // 4. Create new meeting
    const attendees: MeetingAttendee[] = existing.attendees
      ? JSON.parse(existing.attendees)
      : [];
    const agenda: AgendaItem[] = existing.agenda ? JSON.parse(existing.agenda) : [];
    const reminders: MeetingReminder[] = existing.reminders
      ? JSON.parse(existing.reminders)
      : [{ minutesBefore: 60, type: 'email' as const }, { minutesBefore: 15, type: 'notification' as const }];

    const newMeeting = await createMeeting({
      userId: existing.userId,
      leadId: existing.leadId || undefined,
      dealId: existing.dealId || undefined,
      title: existing.title,
      description: existing.description || undefined,
      meetingType: existing.meetingType as 'video' | 'phone' | 'in-person',
      platform: existing.platform,
      startDateTime: newStart,
      endDateTime: newEnd,
      durationMinutes: Math.round(
        (newEnd.getTime() - newStart.getTime()) / 60000
      ),
      timezone: existing.timezone,
      agenda,
      attendees,
      location: existing.location || undefined,
      reminders,
      createdBy: 'user',
    });

    // 5. Link new meeting to old one
    await db.meeting.update({
      where: { id: newMeeting.id },
      data: { rescheduledFrom: meetingId },
    });

    // 6. Create lead activity
    if (existing.leadId) {
      try {
        await db.leadActivity.create({
          data: {
            leadId: existing.leadId,
            type: 'meeting_rescheduled',
            description: `Meeting "${existing.title}" rescheduled from ${formatDateTime(existing.startDateTime, existing.timezone)} to ${formatDateTime(newStart, existing.timezone)}`,
            metadata: JSON.stringify({
              originalMeetingId: meetingId,
              newMeetingId: newMeeting.id,
            }),
          },
        });
      } catch (activityError) {
        console.warn(`${LOG_PREFIX} Failed to create reschedule activity:`, activityError);
      }
    }

    // 7. Audit log
    await createAuditLog(userId, 'meeting_rescheduled', {
      originalMeetingId: meetingId,
      newMeetingId: newMeeting.id,
      newStart: newStart.toISOString(),
      newEnd: newEnd.toISOString(),
      title: existing.title,
    }, 'meeting', newMeeting.id);

    console.log(`${LOG_PREFIX} Meeting ${meetingId} rescheduled to new meeting ${newMeeting.id}`);
    return newMeeting;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error rescheduling meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to reschedule meeting');
  }
}

// ═══════════════════════════════════════════════════════════════════
// APPROVE / REJECT PENDING MEETINGS
// ═══════════════════════════════════════════════════════

/**
 * Approve a pending meeting (changes status from pending_approval to scheduled).
 * Optionally applies modifications (time changes, title changes, etc.).
 */
export async function approvePendingMeeting(
  userId: string,
  meetingId: string,
  modifications?: Partial<UpdateMeetingParams>
) {
  console.log(`${LOG_PREFIX} Approving pending meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }
    if (meeting.approvalStatus === 'approved') {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} is already approved`);
      return meeting;
    }
    if (meeting.status !== 'pending_approval') {
      throw new Error(`Meeting is not pending approval (current status: ${meeting.status})`);
    }

    // Apply modifications if provided
    if (modifications) {
      const updateData: Record<string, unknown> = {};
      if (modifications.title) updateData.title = modifications.title;
      if (modifications.startDateTime) updateData.startDateTime = modifications.startDateTime;
      if (modifications.endDateTime) updateData.endDateTime = modifications.endDateTime;
      if (modifications.description !== undefined) updateData.description = modifications.description;
      if (modifications.attendees) updateData.attendees = JSON.stringify(modifications.attendees);

      if (Object.keys(updateData).length > 0) {
        await db.meeting.update({ where: { id: meetingId }, data: updateData });
      }
    }

    // Approve the meeting
    const approved = await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'scheduled',
        approvalStatus: 'approved',
      },
    });

    // Create Google Calendar event if it hasn't been created yet
    if (!approved.calendarEventId && approved.platform === 'google_meet') {
      try {
        const attendees: MeetingAttendee[] = approved.attendees ? JSON.parse(approved.attendees) : [];
        const calendarResult = await createGoogleMeetEvent(userId, {
          summary: approved.title,
          description: approved.description || undefined,
          startDateTime: new Date(approved.startDateTime),
          endDateTime: new Date(approved.endDateTime),
          timezone: approved.timezone,
          attendees: attendees.map((a) => ({ email: a.email, name: a.name })),
        });

        await db.meeting.update({
          where: { id: meetingId },
          data: {
            calendarEventId: calendarResult.eventId,
            meetingUrl: calendarResult.meetLink || null,
            conferenceData: calendarResult.conferenceData ? JSON.stringify(calendarResult.conferenceData) : null,
          },
        });
      } catch (calendarError) {
        console.warn(`${LOG_PREFIX} Failed to create Google Calendar event on approval:`, calendarError);
      }
    }

    // Send notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_approved' as string,
        title: 'Meeting Approved',
        message: `"${approved.title}" has been approved and scheduled`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: { meetingId, title: approved.title },
      });
    } catch (notifError) {
      console.warn(`${LOG_PREFIX} Failed to send approval notification:`, notifError);
    }

    // Audit log
    await createAuditLog(userId, 'meeting_approved', {
      meetingId,
      title: approved.title,
      modifications: modifications ? Object.keys(modifications) : [],
    }, 'meeting', meetingId);

    console.log(`${LOG_PREFIX} Meeting ${meetingId} approved successfully`);
    return approved;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error approving meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to approve meeting');
  }
}

/**
 * Reject a pending meeting (changes status from pending_approval to cancelled).
 */
export async function rejectPendingMeeting(
  userId: string,
  meetingId: string,
  reason?: string
) {
  console.log(`${LOG_PREFIX} Rejecting pending meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    if (meeting.userId !== userId) {
      throw new Error('Unauthorized: you do not own this meeting');
    }
    if (meeting.approvalStatus === 'rejected') {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} is already rejected`);
      return meeting;
    }
    if (meeting.status !== 'pending_approval') {
      throw new Error(`Meeting is not pending approval (current status: ${meeting.status})`);
    }

    const rejected = await db.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'cancelled',
        approvalStatus: 'rejected',
        cancellationReason: reason || 'Rejected by user',
      },
    });

    // Send notification
    try {
      await sendNotification({
        userId,
        type: 'meeting_rejected' as string,
        title: 'Meeting Rejected',
        message: `"${rejected.title}" has been rejected${reason ? `: ${reason}` : ''}`,
        actionUrl: `/meetings/${meetingId}`,
        metadata: { meetingId, title: rejected.title, reason },
      });
    } catch (notifError) {
      console.warn(`${LOG_PREFIX} Failed to send rejection notification:`, notifError);
    }

    // Audit log
    await createAuditLog(userId, 'meeting_rejected', {
      meetingId,
      title: rejected.title,
      reason,
    }, 'meeting', meetingId);

    console.log(`${LOG_PREFIX} Meeting ${meetingId} rejected successfully`);
    return rejected;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error rejecting meeting ${meetingId}:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to reject meeting');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. AVAILABILITY / SMART SCHEDULING
// ═══════════════════════════════════════════════════════════════════

/**
 * Get available time slots for a user on a given date.
 * Considers working hours, existing meetings, and buffer time.
 *
 * @param userId - The user to check availability for
 * @param date - The date to check (Date object or ISO string)
 * @returns Array of time slots with availability status
 */
export async function getUserAvailability(userId: string, date: Date | string): Promise<TimeSlot[]> {
  console.log(`${LOG_PREFIX} Getting availability for user ${userId} on ${String(date)}`);

  try {
    // 1. Get user settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const workingStart = settings?.meetingWorkingHoursStart || '09:00';
    const workingEnd = settings?.meetingWorkingHoursEnd || '18:00';
    const workingDays = settings?.meetingWorkingDays
      ? JSON.parse(settings.meetingWorkingDays)
      : [1, 2, 3, 4, 5]; // Mon-Fri default
    const bufferMinutes = settings?.meetingBufferMinutes || 15;
    const timezone = settings?.meetingTimezone || 'UTC';

    // 2. Parse the target date in the user's timezone
    const targetDate = typeof date === 'string' ? new Date(date) : date;

    // Get day of week (0 = Sunday, 1 = Monday, ...)
    const dayOfWeek = targetDate.getDay();

    // Check if it's a working day
    const isWorkingDay = workingDays.includes(dayOfWeek);
    if (!isWorkingDay) {
      console.log(`${LOG_PREFIX} ${targetDate.toDateString()} is not a working day`);
      return [];
    }

    // 3. Create time range for working hours on the target date
    const [startHour, startMin] = workingStart.split(':').map(Number);
    const [endHour, endMin] = workingEnd.split(':').map(Number);

    const dayStart = new Date(targetDate);
    dayStart.setHours(startHour, startMin, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(endHour, endMin, 0, 0);

    // Convert to ISO for the API query
    const timeMin = dayStart.toISOString();
    const timeMax = dayEnd.toISOString();

    // 4. Get busy slots from Google Calendar
    let busySlots: Array<{ start: Date; end: Date }> = [];
    try {
      busySlots = await checkAvailability(userId, timeMin, timeMax);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to fetch Google Calendar busy slots, assuming all clear:`, error);
    }

    // Also get busy slots from our own database meetings
    const dbMeetings = await db.meeting.findMany({
      where: {
        userId,
        status: { in: ['scheduled', 'confirmed'] },
        startDateTime: { gte: dayStart, lt: dayEnd },
      },
      select: { startDateTime: true, endDateTime: true },
    });

    for (const dbMeeting of dbMeetings) {
      busySlots.push({
        start: dbMeeting.startDateTime,
        end: dbMeeting.endDateTime,
      });
    }

    // 5. Generate time slots (30-minute increments)
    const SLOT_INCREMENT_MINUTES = 30;
    const slots: TimeSlot[] = [];
    const current = new Date(dayStart);

    while (current < dayEnd) {
      const slotEnd = new Date(current.getTime() + SLOT_INCREMENT_MINUTES * 60000);

      if (slotEnd > dayEnd) break;

      // Check if this slot overlaps with any busy slot (including buffer)
      const slotStartWithBuffer = new Date(current.getTime() - bufferMinutes * 60000);
      const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferMinutes * 60000);

      const isBusy = busySlots.some((busy) => {
        return slotStartWithBuffer < busy.end && slotEndWithBuffer > busy.start;
      });

      slots.push({
        start: new Date(current),
        end: new Date(slotEnd),
        isAvailable: !isBusy,
      });

      current.setTime(slotEnd.getTime());
    }

    console.log(
      `${LOG_PREFIX} Generated ${slots.length} time slots, ${slots.filter((s) => s.isAvailable).length} available`
    );
    return slots;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting user availability:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to get user availability');
  }
}

/**
 * Suggest optimal meeting times based on user preferences and existing commitments.
 * Applies smart scheduling heuristics: morning preference, avoid back-to-back,
 * optimal day patterns.
 *
 * @param userId - The user to suggest times for
 * @param durationMinutes - Desired meeting duration (default from user settings)
 * @param dateRange - Optional date range { start, end } (default: next 5 business days)
 * @returns Top 5 suggested meeting times, sorted by score
 */
export async function suggestMeetingTimes(
  userId: string,
  durationMinutes?: number,
  dateRange?: { start: Date; end: Date }
): Promise<SuggestedMeetingTime[]> {
  console.log(`${LOG_PREFIX} Suggesting meeting times for user ${userId}`);

  try {
    // 1. Get user settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const meetingDuration = durationMinutes || settings?.meetingDurationDefault || 30;
    const bufferMinutes = settings?.meetingBufferMinutes || 15;

    // 2. Determine date range (default: next 5 business days)
    const workingDays = settings?.meetingWorkingDays
      ? JSON.parse(settings.meetingWorkingDays)
      : [1, 2, 3, 4, 5];

    const rangeStart = dateRange?.start || new Date();
    const rangeEnd = dateRange?.end || (() => {
      const end = new Date(rangeStart);
      end.setDate(end.getDate() + 10); // 10 days to get ~5 working days
      return end;
    })();

    // 3. Collect all available slots across the date range
    const allSuggestions: SuggestedMeetingTime[] = [];
    const currentDate = new Date(rangeStart);

    while (currentDate <= rangeEnd) {
      const dayOfWeek = currentDate.getDay();
      if (workingDays.includes(dayOfWeek)) {
        try {
          const slots = await getUserAvailability(userId, new Date(currentDate));

          // Find contiguous available blocks that fit the meeting duration
          let blockStart: Date | null = null;
          let blockEnd: Date | null = null;

          for (const slot of slots) {
            if (slot.isAvailable) {
              if (!blockStart) {
                blockStart = slot.start;
                blockEnd = slot.end;
              } else {
                blockEnd = slot.end;
              }
            } else {
              if (blockStart && blockEnd) {
                // Check if this block fits the meeting
                const blockDuration = (blockEnd.getTime() - blockStart.getTime()) / 60000;
                if (blockDuration >= meetingDuration + bufferMinutes) {
                  // Generate suggestions within this block
                  const suggestions = generateSuggestionsFromBlock(
                    blockStart,
                    blockEnd,
                    meetingDuration,
                    bufferMinutes,
                    currentDate,
                    settings?.meetingWorkingHoursStart || '09:00'
                  );
                  allSuggestions.push(...suggestions);
                }
              }
              blockStart = null;
              blockEnd = null;
            }
          }

          // Handle block extending to end of day
          if (blockStart && blockEnd) {
            const blockDuration = (blockEnd.getTime() - blockStart.getTime()) / 60000;
            if (blockDuration >= meetingDuration + bufferMinutes) {
              const suggestions = generateSuggestionsFromBlock(
                blockStart,
                blockEnd,
                meetingDuration,
                bufferMinutes,
                currentDate,
                settings?.meetingWorkingHoursStart || '09:00'
              );
              allSuggestions.push(...suggestions);
            }
          }
        } catch (error) {
          console.warn(
            `${LOG_PREFIX} Failed to get availability for ${currentDate.toISOString()}`,
            error
          );
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    // 4. Sort by score (descending) and return top 5
    allSuggestions.sort((a, b) => b.score - a.score);
    const topSuggestions = allSuggestions.slice(0, 5);

    console.log(
      `${LOG_PREFIX} Generated ${allSuggestions.length} suggestions, returning top ${topSuggestions.length}`
    );
    return topSuggestions;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error suggesting meeting times:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to suggest meeting times');
  }
}

/**
 * Generate suggestions from an available time block.
 * Applies smart scheduling heuristics.
 */
function generateSuggestionsFromBlock(
  blockStart: Date,
  blockEnd: Date,
  durationMinutes: number,
  bufferMinutes: number,
  date: Date,
  workingHoursStart: string
): SuggestedMeetingTime[] {
  const suggestions: SuggestedMeetingTime[] = [];
  const [startHour] = workingHoursStart.split(':').map(Number);

  const SLOT_STEP_MINUTES = 30;
  const blockDurationMs = blockEnd.getTime() - blockStart.getTime();
  const meetingDurationMs = durationMinutes * 60000;

  const currentTime = new Date(blockStart);

  while (currentTime.getTime() + meetingDurationMs <= blockEnd.getTime()) {
    const meetingEnd = new Date(currentTime.getTime() + meetingDurationMs);
    let score = 100;
    const conflicts: string[] = [];

    const hour = currentTime.getHours();

    // Morning preference: 9-11 AM gets highest score
    if (hour >= 9 && hour < 11) {
      score += 20;
    } else if (hour >= 11 && hour < 13) {
      // Late morning / lunch — slight penalty
      score -= 5;
    } else if (hour >= 14 && hour < 16) {
      // Early afternoon — decent
      score += 5;
    } else if (hour >= 16 && hour < 18) {
      // Late afternoon — slight penalty
      score -= 10;
    } else if (hour < 9) {
      // Early morning — penalty
      score -= 15;
    } else {
      score -= 20;
    }

    // Avoid first slot of the day (warm-up time)
    if (hour === startHour && currentTime.getMinutes() === 0) {
      score -= 10;
      conflicts.push('First slot of the day');
    }

    // Avoid last slot of the day (wrap-up time)
    const timeToEnd = blockEnd.getTime() - meetingEnd.getTime();
    if (timeToEnd <= 0) {
      continue; // Skip if not enough room
    }

    // Buffer after meeting
    if (timeToEnd < bufferMinutes * 60000) {
      score -= 15;
      conflicts.push('Insufficient buffer after meeting');
    }

    // Buffer before meeting
    const timeFromStart = currentTime.getTime() - blockStart.getTime();
    if (timeFromStart < bufferMinutes * 60000) {
      score -= 10;
      conflicts.push('Insufficient buffer before meeting');
    }

    // Weekday preference: Tue-Thu best
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 2 || dayOfWeek === 3) {
      score += 10; // Tuesday, Wednesday
    } else if (dayOfWeek === 4) {
      score += 5; // Thursday
    } else if (dayOfWeek === 1) {
      score += 0; // Monday neutral
    } else {
      score -= 15; // Friday
    }

    let reason = 'Good time slot';
    if (score >= 110) reason = 'Optimal: morning time on a preferred weekday';
    else if (score >= 100) reason = 'Good: available with comfortable buffer';
    else if (score >= 80) reason = 'Acceptable: available but may have scheduling constraints';
    else reason = 'Possible: limited options in this window';

    suggestions.push({
      start: new Date(currentTime),
      end: meetingEnd,
      score: Math.max(0, score),
      reason,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    });

    currentTime.setTime(currentTime.getTime() + SLOT_STEP_MINUTES * 60000);
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════
// 4. MEETING INTENT DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Patterns for detecting meeting intent from text.
 * Each pattern has a regex, intent type, confidence score, and suggested duration.
 */
const MEETING_INTENT_PATTERNS: Array<{
  pattern: RegExp;
  intentType: string;
  confidence: number;
  suggestedDuration: number;
  extractedField?: 'date' | 'time' | 'platform' | 'topic';
}> = [
  // Direct scheduling requests
  { pattern: /\b(schedule|set up|book|arrange)\s+(a\s+)?(call|meeting|catch.?up|chat|conversation)\b/i, intentType: 'schedule_call', confidence: 0.95, suggestedDuration: 30 },
  { pattern: /\b(let'?s?\s+(schedule|set up|book|have|do))\s+(a\s+)?(call|meeting|chat|catch.?up)\b/i, intentType: 'schedule_call', confidence: 0.92, suggestedDuration: 30 },
  { pattern: /\bcan\s+we\s+(schedule|set up|book|have)\s+(a\s+)?(call|meeting|chat|discussion)\b/i, intentType: 'schedule_call', confidence: 0.93, suggestedDuration: 30 },
  { pattern: /\bwould\s+(you|it)\s+be\s+(possible|great|good)\s+to\s+(call|meet|chat|discuss)\b/i, intentType: 'schedule_call', confidence: 0.88, suggestedDuration: 30 },
  { pattern: /\bI'?d\s+like\s+to\s+(schedule|book|set up)\s+(a\s+)?(call|meeting|demo|discovery)\b/i, intentType: 'schedule_call', confidence: 0.96, suggestedDuration: 30 },
  { pattern: /\bwould\s+love\s+to\s+(connect|chat|discuss|talk|speak)\b/i, intentType: 'connect', confidence: 0.85, suggestedDuration: 30 },
  { pattern: /\b(let'?s?\s+)(connect|chat|discuss|talk|speak|catch.?up)\b/i, intentType: 'discuss', confidence: 0.90, suggestedDuration: 30 },
  { pattern: /\bcan\s+we\s+(talk|discuss|speak|connect|chat)\b/i, intentType: 'discuss', confidence: 0.88, suggestedDuration: 30 },
  { pattern: /\b(we\s+should|let'?s)\s+(discuss|talk\s+about|go\s+over|review)\b/i, intentType: 'discuss', confidence: 0.82, suggestedDuration: 45 },

  // Availability expressions
  { pattern: /\b(available|free)\s+(tomorrow|next\s+week|this\s+week|today|on\s+\w+)\b/i, intentType: 'available', confidence: 0.80, suggestedDuration: 30, extractedField: 'date' },
  { pattern: /\bwhat\s+(time|times?)\s+(works?|are\s+you)\s+(best|good|available|free)\b/i, intentType: 'available', confidence: 0.85, suggestedDuration: 30, extractedField: 'time' },
  { pattern: /\bi'?m\s+(available|free)\s+(on|at|around|between)\b/i, intentType: 'available', confidence: 0.80, suggestedDuration: 30, extractedField: 'date' },

  // Interest / buying signals
  { pattern: /\b(interested|i'?m\s+interested)\s+(in|to\s+(learn|know|hear|see|explore|discuss|understand))\b/i, intentType: 'interested', confidence: 0.75, suggestedDuration: 30, extractedField: 'topic' },
  { pattern: /\b(i\s+want|we\s+need|i\s+need)\s+(to\s+)?(more\s+info|details|information|to\s+know|to\s+learn|to\s+explore|to\s+discuss)\b/i, intentType: 'interested', confidence: 0.78, suggestedDuration: 30, extractedField: 'topic' },
  { pattern: /\b(tell\s+me\s+more|send\s+me\s+info|share\s+details|i\s+have\s+questions)\b/i, intentType: 'interested', confidence: 0.72, suggestedDuration: 30, extractedField: 'topic' },

  // Platform-specific
  { pattern: /\b(Zoom|Google\s+Meet|Teams|Teams\s+call|video\s+call)\b/i, intentType: 'schedule_call', confidence: 0.85, suggestedDuration: 30, extractedField: 'platform' },

  // Demo / presentation requests
  { pattern: /\b(book|schedule|set\s+up)\s+(a\s+)?(demo|presentation|walkthrough|overview)\b/i, intentType: 'schedule_call', confidence: 0.94, suggestedDuration: 45 },
  { pattern: /\b(would\s+like|love)\s+(a\s+)?(demo|walkthrough|presentation|overview)\b/i, intentType: 'schedule_call', confidence: 0.92, suggestedDuration: 45 },
];

/**
 * Analyze text for meeting-related intent.
 * Checks for scheduling phrases, availability expressions, interest signals, and more.
 *
 * @param text - The text to analyze (e.g., email body, chat message)
 * @returns Intent detection result with type, confidence, and suggested duration
 */
export function detectMeetingIntent(text: string): MeetingIntentResult {
  console.log(`${LOG_PREFIX} Detecting meeting intent in text (length: ${text.length})`);

  const normalizedText = text.trim().toLowerCase();

  // Default: no intent detected
  let bestMatch: MeetingIntentResult = {
    hasIntent: false,
    intentType: 'none',
    confidence: 0,
    suggestedDuration: 30,
  };

  for (const patternDef of MEETING_INTENT_PATTERNS) {
    const match = normalizedText.match(patternDef.pattern);
    if (match) {
      const extractedDetails: Record<string, string> = {};

      // Extract contextual details based on pattern type
      if (patternDef.extractedField === 'date') {
        const dateMatch = text.match(/\b(tomorrow|next\s+week|this\s+week|today|on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
        if (dateMatch) {
          extractedDetails.date = dateMatch[1];
        }
      } else if (patternDef.extractedField === 'time') {
        const timeMatch = text.match(/\b(at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?|between\s+\d{1,2}(:\d{2})?\s*(?:am|pm)?\s*and\s+\d{1,2}(:\d{2})?\s*(?:am|pm)?)\b/i);
        if (timeMatch) {
          extractedDetails.time = timeMatch[1];
        }
      } else if (patternDef.extractedField === 'platform') {
        const platformMatch = text.match(/\b(Zoom|Google\s+Meet|Teams)\b/i);
        if (platformMatch) {
          extractedDetails.platform = platformMatch[1].toLowerCase().replace(/\s+/g, '_');
        }
      } else if (patternDef.extractedField === 'topic') {
        const topicMatch = text.match(/\b(interested\s+in|learn\s+about|know\s+more\s+about|discuss|explore)\s+([^.!?\n]+)/i);
        if (topicMatch) {
          extractedDetails.topic = topicMatch[2].trim().substring(0, 100);
        }
      }

      // Adjust confidence based on multiple signals
      let adjustedConfidence = patternDef.confidence;
      const positiveSignals = normalizedText.match(/\b(interested|excited|looking\s+forward|eager|keen|definitely|absolutely|sure|yes)\b/g);
      if (positiveSignals && positiveSignals.length > 1) {
        adjustedConfidence = Math.min(0.99, adjustedConfidence + 0.05);
      }

      const negativeSignals = normalizedText.match(/\b(not\s+interested|pass|no\s+thanks|busy|unavailable|later|not\s+now)\b/g);
      if (negativeSignals && negativeSignals.length > 0) {
        adjustedConfidence = Math.max(0.1, adjustedConfidence - 0.3);
      }

      if (adjustedConfidence > bestMatch.confidence) {
        bestMatch = {
          hasIntent: adjustedConfidence >= 0.6,
          intentType: patternDef.intentType,
          confidence: Math.round(adjustedConfidence * 100) / 100,
          suggestedDuration: patternDef.suggestedDuration,
          extractedDetails: Object.keys(extractedDetails).length > 0
            ? extractedDetails as MeetingIntentResult['extractedDetails']
            : undefined,
        };
      }
    }
  }

  console.log(
    `${LOG_PREFIX} Intent detection result: hasIntent=${bestMatch.hasIntent}, type=${bestMatch.intentType}, confidence=${bestMatch.confidence}`
  );
  return bestMatch;
}

/**
 * Log a meeting intent detection to the database.
 *
 * @param params - Intent logging parameters
 * @returns The created MeetingIntentLog record
 */
export async function logMeetingIntent(params: LogMeetingIntentParams) {
  console.log(
    `${LOG_PREFIX} Logging meeting intent: ${params.detectedIntent} (confidence: ${params.confidence})`
  );

  try {
    const intentLog = await db.meetingIntentLog.create({
      data: {
        userId: params.userId,
        leadId: params.leadId || null,
        sourceType: params.sourceType,
        sourceId: params.sourceId || null,
        detectedIntent: params.detectedIntent,
        confidence: params.confidence,
        originalText: params.originalText,
        suggestedAction: params.suggestedAction
          ? JSON.stringify(params.suggestedAction)
          : null,
        status: 'detected',
      },
    });

    console.log(`${LOG_PREFIX} Meeting intent logged. ID: ${intentLog.id}`);
    return intentLog;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error logging meeting intent:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to log meeting intent');
  }
}

/**
 * Get unactioned (detected but not yet acted on) meeting intents for a user.
 *
 * @param userId - The user to fetch intents for
 * @param limit - Maximum number of intents to return (default 20)
 * @returns Array of unactioned MeetingIntentLog records
 */
export async function getPendingIntents(userId: string, limit: number = 20) {
  console.log(`${LOG_PREFIX} Getting pending intents for user ${userId}`);

  try {
    const intents = await db.meetingIntentLog.findMany({
      where: {
        userId,
        status: 'detected',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            email: true,
            stage: true,
          },
        },
      },
    });

    console.log(`${LOG_PREFIX} Found ${intents.length} pending intents`);
    return intents;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting pending intents:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to get pending intents');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. CRM SYNC
// ═══════════════════════════════════════════════════════════════════

/**
 * Sync meeting status with CRM (Lead and Deal stages).
 *
 * Pipeline stages:
 *   - When meeting scheduled:  lead.stage = 'meeting_scheduled', deal.status = 'meeting_scheduled'
 *   - When meeting completed:  lead.stage = 'proposal_pending',  deal.status = 'proposal_pending'
 *   - When meeting cancelled:  log activity, keep lead in current stage
 *
 * @param meetingId - The meeting ID to sync
 */
export async function syncMeetingWithCRM(meetingId: string) {
  console.log(`${LOG_PREFIX} Syncing meeting ${meetingId} with CRM`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { lead: true, deal: true },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    if (!meeting.leadId) {
      console.log(`${LOG_PREFIX} Meeting ${meetingId} has no linked lead, skipping CRM sync`);
      return;
    }

    // Sync based on meeting status
    switch (meeting.status) {
      case 'scheduled':
      case 'confirmed':
      case 'pending_approval':
        // Only update if lead is in an earlier stage
        if (meeting.lead && shouldAdvanceStage(meeting.lead.stage, PIPELINE_STAGES.MEETING_SCHEDULED)) {
          await db.lead.update({
            where: { id: meeting.leadId },
            data: { stage: PIPELINE_STAGES.MEETING_SCHEDULED },
          });

          if (meeting.dealId) {
            await db.deal.update({
              where: { id: meeting.dealId },
              data: { status: PIPELINE_STAGES.MEETING_SCHEDULED },
            });
          }
        }
        break;

      case 'completed':
        if (meeting.lead && shouldAdvanceStage(meeting.lead.stage, PIPELINE_STAGES.PROPOSAL_PENDING)) {
          await db.lead.update({
            where: { id: meeting.leadId },
            data: { stage: PIPELINE_STAGES.PROPOSAL_PENDING },
          });

          if (meeting.dealId) {
            await db.deal.update({
              where: { id: meeting.dealId },
              data: { status: PIPELINE_STAGES.PROPOSAL_PENDING },
            });
          }
        }
        break;

      case 'cancelled':
      case 'rescheduled':
        // Log activity but don't change stage
        try {
          await db.leadActivity.create({
            data: {
              leadId: meeting.leadId,
              type: meeting.status === 'cancelled' ? 'meeting_cancelled' : 'meeting_rescheduled',
              description: `Meeting "${meeting.title}" was ${meeting.status}`,
              metadata: JSON.stringify({ meetingId: meeting.id, status: meeting.status }),
            },
          });
        } catch (activityError) {
          console.warn(`${LOG_PREFIX} Failed to create CRM activity log:`, activityError);
        }
        break;

      default:
        console.log(`${LOG_PREFIX} No CRM sync needed for meeting status: ${meeting.status}`);
    }

    console.log(`${LOG_PREFIX} CRM sync completed for meeting ${meetingId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error syncing meeting with CRM:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to sync meeting with CRM');
  }
}

/**
 * Check if a lead stage should advance to the target stage.
 * Prevents moving backwards in the pipeline.
 */
function shouldAdvanceStage(currentStage: string, targetStage: string): boolean {
  const stageOrder = [
    PIPELINE_STAGES.INTERESTED,
    PIPELINE_STAGES.MEETING_SCHEDULED,
    PIPELINE_STAGES.MEETING_COMPLETED,
    PIPELINE_STAGES.PROPOSAL_PENDING,
    PIPELINE_STAGES.NEGOTIATION,
    PIPELINE_STAGES.WON,
    PIPELINE_STAGES.LOST,
  ];

  const currentIndex = stageOrder.indexOf(currentStage);
  const targetIndex = stageOrder.indexOf(targetStage);

  // Advance if target is strictly ahead, or if current stage is "discovered" (not in list)
  if (currentIndex === -1) return true;
  return targetIndex > currentIndex;
}

/**
 * Get meeting analytics/statistics for a user.
 *
 * @param userId - The user to get stats for
 * @returns Meeting statistics including totals, rates, and trends
 */
export async function getMeetingStats(userId: string): Promise<MeetingStats> {
  console.log(`${LOG_PREFIX} Getting meeting stats for user ${userId}`);

  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch all meetings for the user
    const meetings = await db.meeting.findMany({
      where: { userId },
      select: {
        status: true,
        durationMinutes: true,
        startDateTime: true,
        createdAt: true,
      },
    });

    const total = meetings.length;
    const scheduled = meetings.filter((m) => m.status === 'scheduled' || m.status === 'confirmed').length;
    const completed = meetings.filter((m) => m.status === 'completed').length;
    const cancelled = meetings.filter((m) => m.status === 'cancelled').length;
    const rescheduled = meetings.filter((m) => m.status === 'rescheduled').length;

    const thisWeekTotal = meetings.filter(
      (m) => new Date(m.startDateTime) >= weekStart
    ).length;

    const thisMonthTotal = meetings.filter(
      (m) => new Date(m.startDateTime) >= monthStart
    ).length;

    // Average duration of completed meetings
    const completedMeetings = meetings.filter((m) => m.status === 'completed');
    const avgDurationMinutes =
      completedMeetings.length > 0
        ? Math.round(
            completedMeetings.reduce((sum, m) => sum + m.durationMinutes, 0) /
              completedMeetings.length
          )
        : 0;

    // Conversion rate: completed / (completed + cancelled + rescheduled)
    const finalMeetings = completed + cancelled + rescheduled;
    const conversionRate =
      finalMeetings > 0 ? Math.round((completed / finalMeetings) * 100) / 100 : 0;

    // Completion rate: completed / total
    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) / 100 : 0;

    const stats: MeetingStats = {
      total,
      scheduled,
      completed,
      cancelled,
      rescheduled,
      avgDurationMinutes,
      conversionRate,
      completionRate,
      thisWeekTotal,
      thisMonthTotal,
    };

    console.log(`${LOG_PREFIX} Meeting stats: total=${total}, completed=${completed}, conversion=${conversionRate}`);
    return stats;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting meeting stats:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to get meeting stats');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. MEETING EMAIL AUTOMATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a simple .ics (iCalendar) file content for a meeting.
 */
function generateIcsContent(
  title: string,
  startDateTime: Date,
  endDateTime: Date,
  location?: string,
  description?: string,
  meetingUrl?: string
): string {
  const dtStart = formatIcsDate(startDateTime);
  const dtEnd = formatIcsDate(endDateTime);
  const now = formatIcsDate(new Date());
  const uid = `meeting-${Date.now()}@acquisitionos.com`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AcquisitionOS//Meeting//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  if (meetingUrl) {
    lines.push(`DESCRIPTION:${escapeIcsText(description || `Join: ${meetingUrl}`)}`);
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcsText(text: string): string {
  return text.replace(/[\\;,\n]/g, (match) => {
    if (match === '\n') return '\\n';
    return `\\${match}`;
  });
}

/** HTML email template constants */
const EMAIL_BRAND = {
  color: '#0d9488',
  colorDark: '#0f766e',
  bg: '#f0fdfa',
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
};

/**
 * Build a styled HTML email body for meeting communications.
 */
function buildMeetingEmailHtml(
  title: string,
  bodyContent: string,
  cta?: { label: string; url: string }
): string {
  const ctaHtml = cta
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${cta.url}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:${EMAIL_BRAND.color}; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px;">
            ${cta.label}
          </a>
        </td>
      </tr>
    </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:${EMAIL_BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${EMAIL_BRAND.textPrimary};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_BRAND.bg};padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,${EMAIL_BRAND.color} 0%,${EMAIL_BRAND.colorDark} 100%);padding:24px 40px;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">AcquisitionOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:${EMAIL_BRAND.colorDark};">${title}</h2>
              ${bodyContent}
              ${ctaHtml}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin-top:16px;">
          <tr>
            <td style="padding:16px 24px;text-align:center;font-size:12px;color:${EMAIL_BRAND.textSecondary};">
              &copy; ${new Date().getFullYear()} AcquisitionOS. This is an automated message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a meeting confirmation email to attendees.
 * Includes meeting details, Meet link, agenda, and .ics calendar attachment.
 *
 * @param meeting - The meeting record
 * @param attendees - Array of attendee email addresses
 */
export async function sendMeetingConfirmation(
  meeting: {
    id: string;
    title: string;
    description?: string | null;
    startDateTime: Date;
    endDateTime: Date;
    durationMinutes: number;
    timezone: string;
    meetingUrl?: string | null;
    platform?: string;
    location?: string | null;
    agenda?: string | null;
    attendees?: string;
  },
  attendees: MeetingAttendee[]
) {
  console.log(`${LOG_PREFIX} Sending meeting confirmation for "${meeting.title}" to ${attendees.length} attendees`);

  try {
    const parsedAgenda: AgendaItem[] = meeting.agenda ? JSON.parse(meeting.agenda) : [];
    const agendaHtml = parsedAgenda.length > 0
      ? `
      <h3 style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:${EMAIL_BRAND.textPrimary};">Agenda</h3>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">
        ${parsedAgenda.map((item) => `<li>${escapeHtml(item.title)}${item.description ? ` — ${escapeHtml(item.description)}` : ''}</li>`).join('')}
      </ul>`
      : '';

    const meetLinkHtml = meeting.meetingUrl
      ? `
      <h3 style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:${EMAIL_BRAND.textPrimary};">Join Link</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
        <tr>
          <td style="background-color:#f0fdfa;border:1px solid ${EMAIL_BRAND.color};border-radius:8px;padding:12px 16px;">
            <a href="${meeting.meetingUrl}" target="_blank" rel="noopener noreferrer"
               style="color:${EMAIL_BRAND.color};font-weight:600;font-size:14px;word-break:break-all;">
              ${meeting.meetingUrl}
            </a>
          </td>
        </tr>
      </table>`
      : '';

    const detailsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">
            <strong>Date:</strong> ${formatDate(meeting.startDateTime, meeting.timezone)}<br/>
            <strong>Time:</strong> ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)} (${meeting.timezone})<br/>
            <strong>Duration:</strong> ${meeting.durationMinutes} minutes<br/>
            ${meeting.location ? `<strong>Location:</strong> ${escapeHtml(meeting.location)}<br/>` : ''}
            <strong>Platform:</strong> ${meeting.platform || 'Google Meet'}
          </td>
        </tr>
      </table>
      ${meeting.description ? `<p style="margin:12px 0;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">${escapeHtml(meeting.description)}</p>` : ''}
      ${agendaHtml}
      ${meetLinkHtml}`;

    const html = buildMeetingEmailHtml(
      `Meeting Confirmed: ${meeting.title}`,
      `<p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:${EMAIL_BRAND.textPrimary};">
        Your meeting has been confirmed. Here are the details:
      </p>${detailsHtml}`,
      meeting.meetingUrl ? { label: 'Join Meeting', url: meeting.meetingUrl } : undefined
    );

    const text = `Meeting Confirmed: ${meeting.title}\n\n` +
      `Date: ${formatDate(meeting.startDateTime, meeting.timezone)}\n` +
      `Time: ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)} (${meeting.timezone})\n` +
      `Duration: ${meeting.durationMinutes} minutes\n` +
      (meeting.location ? `Location: ${meeting.location}\n` : '') +
      (meeting.meetingUrl ? `Join Link: ${meeting.meetingUrl}\n` : '') +
      `\n— AcquisitionOS`;

    // Generate .ics file
    const icsContent = generateIcsContent(
      meeting.title,
      meeting.startDateTime,
      meeting.endDateTime,
      meeting.location || undefined,
      meeting.description || undefined,
      meeting.meetingUrl || undefined
    );

    // Send to all attendees
    const results = [];
    for (const attendee of attendees) {
      if (!attendee.email) continue;

      const result = await sendEmail({
        to: attendee.email,
        subject: `Meeting Confirmed: ${meeting.title}`,
        html,
        text,
        attachments: [
          {
            filename: 'meeting.ics',
            content: icsContent,
            contentType: 'text/calendar; charset=utf-8',
          },
        ],
      });
      results.push(result);
    }

    console.log(`${LOG_PREFIX} Confirmation emails sent to ${attendees.length} attendees`);
    return results;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending meeting confirmation:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to send meeting confirmation');
  }
}

/**
 * Send a reminder email before a meeting.
 *
 * @param meeting - The meeting record (must include attendees JSON)
 * @param minutesBefore - How many minutes before the meeting to send (default: 60)
 */
export async function sendMeetingReminder(
  meeting: {
    id: string;
    title: string;
    startDateTime: Date;
    endDateTime: Date;
    durationMinutes: number;
    timezone: string;
    meetingUrl?: string | null;
    platform?: string;
    location?: string | null;
    attendees?: string;
  },
  minutesBefore: number = 60
) {
  console.log(`${LOG_PREFIX} Sending meeting reminder for "${meeting.title}" (${minutesBefore}min before)`);

  try {
    const attendees: MeetingAttendee[] = meeting.attendees
      ? JSON.parse(meeting.attendees)
      : [];

    if (attendees.length === 0) {
      console.log(`${LOG_PREFIX} No attendees found, skipping reminder`);
      return;
    }

    const html = buildMeetingEmailHtml(
      `Meeting Reminder: ${meeting.title}`,
      `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${EMAIL_BRAND.textPrimary};">
        Your meeting starts in <strong>${minutesBefore} minutes</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">
            <strong>Title:</strong> ${escapeHtml(meeting.title)}<br/>
            <strong>Time:</strong> ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)}<br/>
            <strong>Duration:</strong> ${meeting.durationMinutes} minutes
          </td>
        </tr>
      </table>`,
      meeting.meetingUrl ? { label: 'Join Now', url: meeting.meetingUrl } : undefined
    );

    const text = `Meeting Reminder: ${meeting.title}\n\n` +
      `Your meeting starts in ${minutesBefore} minutes.\n\n` +
      `Time: ${formatTime(meeting.startDateTime, meeting.timezone)} – ${formatTime(meeting.endDateTime, meeting.timezone)}\n` +
      `Duration: ${meeting.durationMinutes} minutes\n` +
      (meeting.meetingUrl ? `Join Link: ${meeting.meetingUrl}\n` : '') +
      `\n— AcquisitionOS`;

    for (const attendee of attendees) {
      if (!attendee.email) continue;

      await sendEmail({
        to: attendee.email,
        subject: `Reminder: ${meeting.title} starts in ${minutesBefore} minutes`,
        html,
        text,
      });
    }

    console.log(`${LOG_PREFIX} Reminder emails sent to ${attendees.length} attendees`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending meeting reminder:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to send meeting reminder');
  }
}

/**
 * Send a cancellation notice for a meeting.
 *
 * @param meeting - The meeting record
 * @param reason - Optional cancellation reason
 * @param recipientEmail - Optional specific recipient (if not provided, sends to all attendees)
 */
export async function sendMeetingCancellation(
  meeting: {
    id: string;
    title: string;
    startDateTime: Date;
    endDateTime: Date;
    durationMinutes: number;
    timezone: string;
    attendees?: string;
    meetingUrl?: string | null;
  },
  reason?: string,
  recipientEmail?: string
) {
  console.log(`${LOG_PREFIX} Sending meeting cancellation for "${meeting.title}"`);

  try {
    const attendees: MeetingAttendee[] = meeting.attendees
      ? JSON.parse(meeting.attendees)
      : [];

    const targetEmails = recipientEmail
      ? [recipientEmail]
      : attendees.filter((a) => a.email).map((a) => a.email!);

    if (targetEmails.length === 0) {
      console.log(`${LOG_PREFIX} No recipients found, skipping cancellation email`);
      return;
    }

    const html = buildMeetingEmailHtml(
      `Meeting Cancelled: ${meeting.title}`,
      `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${EMAIL_BRAND.textPrimary};">
        Your meeting has been cancelled.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;font-size:14px;line-height:22px;color:#991b1b;">
            <strong>Cancelled Meeting:</strong> ${escapeHtml(meeting.title)}<br/>
            <strong>Was Scheduled:</strong> ${formatDateTime(meeting.startDateTime, meeting.timezone)}<br/>
            ${reason ? `<strong>Reason:</strong> ${escapeHtml(reason)}` : ''}
          </td>
        </tr>
      </table>`
    );

    const text = `Meeting Cancelled: ${meeting.title}\n\n` +
      `Your meeting has been cancelled.\n\n` +
      `Was Scheduled: ${formatDateTime(meeting.startDateTime, meeting.timezone)}\n` +
      (reason ? `Reason: ${reason}\n` : '') +
      `\n— AcquisitionOS`;

    for (const email of targetEmails) {
      await sendEmail({
        to: email,
        subject: `Cancelled: ${meeting.title}`,
        html,
        text,
      });
    }

    console.log(`${LOG_PREFIX} Cancellation emails sent to ${targetEmails.length} recipients`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending meeting cancellation:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to send meeting cancellation');
  }
}

/**
 * Send a post-meeting follow-up email with notes and action items.
 *
 * @param meeting - The meeting record
 * @param notes - Post-meeting notes
 */
export async function sendFollowUpEmail(
  meeting: {
    id: string;
    title: string;
    startDateTime: Date;
    endDateTime: Date;
    durationMinutes: number;
    timezone: string;
    attendees?: string;
    followUpActions?: string | null;
    notes?: string | null;
  },
  notes?: string
) {
  console.log(`${LOG_PREFIX} Sending follow-up email for "${meeting.title}"`);

  try {
    const attendees: MeetingAttendee[] = meeting.attendees
      ? JSON.parse(meeting.attendees)
      : [];

    const followUpActions: FollowUpAction[] = meeting.followUpActions
      ? JSON.parse(meeting.followUpActions)
      : [];

    const notesText = notes || meeting.notes || '';

    const notesHtml = notesText
      ? `
      <h3 style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:${EMAIL_BRAND.textPrimary};">Meeting Notes</h3>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};white-space:pre-wrap;">${escapeHtml(notesText)}</p>`
      : '';

    const actionsHtml = followUpActions.length > 0
      ? `
      <h3 style="margin:16px 0 8px 0;font-size:14px;font-weight:600;color:${EMAIL_BRAND.textPrimary};">Action Items</h3>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">
        ${followUpActions.map((action) => `<li>${escapeHtml(action.title)}${action.assignee ? ` (${escapeHtml(action.assignee)})` : ''}</li>`).join('')}
      </ul>`
      : '';

    const html = buildMeetingEmailHtml(
      `Follow-Up: ${meeting.title}`,
      `<p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:${EMAIL_BRAND.textPrimary};">
        Thank you for taking the time to meet with us. Here's a summary:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.textPrimary};">
            <strong>Meeting:</strong> ${escapeHtml(meeting.title)}<br/>
            <strong>Date:</strong> ${formatDateTime(meeting.startDateTime, meeting.timezone)}<br/>
            <strong>Duration:</strong> ${meeting.durationMinutes} minutes
          </td>
        </tr>
      </table>
      ${notesHtml}
      ${actionsHtml}`
    );

    const text = `Follow-Up: ${meeting.title}\n\n` +
      `Thank you for meeting with us!\n\n` +
      `Meeting: ${meeting.title}\n` +
      `Date: ${formatDateTime(meeting.startDateTime, meeting.timezone)}\n` +
      `Duration: ${meeting.durationMinutes} minutes\n\n` +
      (notesText ? `Notes:\n${notesText}\n\n` : '') +
      (followUpActions.length > 0
        ? `Action Items:\n${followUpActions.map((a) => `• ${a.title}${a.assignee ? ` (${a.assignee})` : ''}`).join('\n')}\n`
        : '') +
      `\n— AcquisitionOS`;

    for (const attendee of attendees) {
      if (!attendee.email) continue;

      await sendEmail({
        to: attendee.email,
        subject: `Follow-Up: ${meeting.title}`,
        html,
        text,
      });
    }

    console.log(`${LOG_PREFIX} Follow-up emails sent to ${attendees.length} attendees`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error sending follow-up email:`, error);
    throw error instanceof Error
      ? error
      : new Error('Failed to send follow-up email');
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a date for display with timezone.
 */
function formatDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

/**
 * Format time for display with timezone.
 */
function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Format date and time for display.
 */
function formatDateTime(date: Date, timezone: string): string {
  return `${formatDate(date, timezone)} at ${formatTime(date, timezone)}`;
}

/**
 * Escape HTML entities for safe rendering in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Create an audit log entry for meeting operations.
 */
async function createAuditLog(
  userId: string,
  action: string,
  details: Record<string, unknown>,
  resource: string,
  resourceId: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: JSON.stringify(details),
        resource,
        resourceId,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create audit log for ${action}:`, error);
  }
}
