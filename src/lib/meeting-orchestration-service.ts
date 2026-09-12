// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Orchestration Service
// Task 2-a + 2-b: Google Meet + Meeting Orchestration Engine
//
// Core service for:
//   - Meeting intent detection from text (AI chat integration)
//   - Google Calendar availability checking
//   - Smart meeting slot suggestions
//   - Google Meet meeting creation with Calendar integration
//   - Meeting update/cancellation with notification
//   - Meeting completion with follow-up generation
//   - User meeting queries with filters
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { sendEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/app-url';
import {
  sendMeetingConfirmationToClient,
  sendMeetingUpdateToClient,
  sendMeetingCancellationToClient,
  sendMeetingReminderToClient,
  sendMeetingNotificationToUser,
} from '@/lib/meeting/meeting-email';
import {
  validateStageTransition,
  updateDealAfterMeeting,
  type CRMAction,
} from '@/lib/meeting/crm-sync';
import { createMeetingReminders, cancelMeetingReminders, rescheduleMeetingReminders } from '@/lib/meeting/meeting-reminders';

// Generate a unique request ID for Google Meet conference creation
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ── Types ──────────────────────────────────────────────────────────

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface SuggestedSlot {
  start: Date;
  end: Date;
  reason: string;
  score: number; // 0-1, higher is better
}

export interface CreateMeetingParams {
  title: string;
  description?: string;
  meetingType?: string; // video, phone, in-person
  platform?: string; // google_meet, zoom, teams, custom
  startDateTime: string; // ISO 8601
  endDateTime: string; // ISO 8601
  durationMinutes?: number;
  timezone?: string;
  agenda?: string; // JSON string
  attendees?: Array<{ email: string; name?: string }>;
  location?: string;
  leadId?: string;
  dealId?: string;
  createdBy?: string; // user, ai_suggestion, ai_auto
  reminders?: Array<{ minutesBefore: number; type: string }>;
}

export interface UpdateMeetingParams {
  title?: string;
  description?: string;
  meetingType?: string;
  startDateTime?: string;
  endDateTime?: string;
  durationMinutes?: number;
  timezone?: string;
  agenda?: string;
  attendees?: Array<{ email: string; name?: string }>;
  location?: string;
  status?: string;
  notes?: string;
  followUpActions?: string[];
  recordingUrl?: string;
}

// ── Meeting Intent Detection ──────────────────────────────────────

const INTENT_PATTERNS: Array<{
  intent: string;
  patterns: RegExp[];
  suggestedAction: string;
  baseConfidence: number;
}> = [
  {
    intent: 'schedule_call',
    patterns: [
      /schedule\s+(a\s+)?call/i,
      /set\s+up\s+(a\s+)?call/i,
      /arrange\s+(a\s+)?call/i,
      /book\s+(a\s+)?call/i,
      /let'?s?\s+call/i,
      /hop\s+on\s+(a\s+)?call/i,
      /jump\s+on\s+(a\s+)?call/i,
      /quick\s+call/i,
      /phone\s+call/i,
    ],
    suggestedAction: 'Schedule a call with the lead',
    baseConfidence: 0.9,
  },
  {
    intent: 'book_meeting',
    patterns: [
      /book\s+(a\s+)?meeting/i,
      /schedule\s+(a\s+)?meeting/i,
      /set\s+up\s+(a\s+)?meeting/i,
      /arrange\s+(a\s+)?meeting/i,
      /request\s+(a\s+)?meeting/i,
      /organize\s+(a\s+)?meeting/i,
    ],
    suggestedAction: 'Book a meeting with the lead',
    baseConfidence: 0.92,
  },
  {
    intent: 'discuss',
    patterns: [
      /let'?s?\s+discuss/i,
      /we\s+should\s+discuss/i,
      /i'?d?\s+like\s+to\s+discuss/i,
      /can\s+we\s+discuss/i,
      /would\s+love\s+to\s+discuss/i,
      /need\s+to\s+discuss/i,
      /let'?s?\s+talk\s+about/i,
      /we\s+need\s+to\s+talk\s+about/i,
    ],
    suggestedAction: 'Set up a discussion meeting',
    baseConfidence: 0.78,
  },
  {
    intent: 'connect',
    patterns: [
      /let'?s?\s+connect/i,
      /can\s+we\s+connect/i,
      /would\s+love\s+to\s+connect/i,
      /i'?d?\s+like\s+to\s+connect/i,
      /let'?s?\s+get\s+(on\s+)?(a\s+)?call/i,
      /let'?s?\s+hop\s+on/i,
      /let'?s?\s+chat/i,
      /can\s+we\s+chat/i,
      /let'?s?\s+touch\s+base/i,
    ],
    suggestedAction: 'Schedule a connect call',
    baseConfidence: 0.82,
  },
  {
    intent: 'available',
    patterns: [
      /available\s+(tomorrow|today|next\s+week|this\s+week|on\s+monday|on\s+tuesday|on\s+wednesday|on\s+thursday|on\s+friday)/i,
      /free\s+(tomorrow|today|next\s+week|this\s+week)/i,
      /when\s+(are\s+)?you\s+(free|available)/i,
      /when\s+works\s+(for|best\s+for)\s+you/i,
      /what\s+time\s+works/i,
      /my\s+(calendar|schedule)\s+is\s+open/i,
      /i'?m?\s+available/i,
      /i'?m?\s+free/i,
    ],
    suggestedAction: 'Check availability and suggest meeting times',
    baseConfidence: 0.75,
  },
  {
    intent: 'interested',
    patterns: [
      /i'?m?\s+interested/i,
      /we'?re?\s+interested/i,
      /sounds\s+interesting/i,
      /that\s+sounds\s+great/i,
      /i'?d?\s+love\s+to\s+(learn|hear|know)\s+more/i,
      /tell\s+me\s+more/i,
      /i\s+want\s+to\s+know\s+more/i,
      /would\s+like\s+to\s+explore/i,
      /let'?s?\s+take\s+(this|it)\s+forward/i,
    ],
    suggestedAction: 'Follow up with a discovery meeting',
    baseConfidence: 0.68,
  },
];

/**
 * Detect meeting intent from text.
 * Used for AI chat integration and email parsing.
 */
export function detectMeetingIntent(text: string): {
  intent: string | null;
  confidence: number;
  suggestedAction?: string;
} {
  if (!text || text.trim().length === 0) {
    return { intent: null, confidence: 0 };
  }

  const normalizedText = text.trim();
  let bestMatch: { intent: string; confidence: number; suggestedAction: string } | null = null;

  for (const { intent, patterns, suggestedAction, baseConfidence } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        // Boost confidence based on text length / specificity
        const lengthBonus = Math.min(normalizedText.length / 200, 0.1);
        const confidence = Math.min(baseConfidence + lengthBonus, 1.0);

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { intent, confidence, suggestedAction };
        }
        break; // Only count first pattern match per intent
      }
    }
  }

  if (bestMatch) {
    return {
      intent: bestMatch.intent,
      confidence: Math.round(bestMatch.confidence * 100) / 100,
      suggestedAction: bestMatch.suggestedAction,
    };
  }

  return { intent: null, confidence: 0 };
}

// ── Availability Checking ─────────────────────────────────────────

/**
 * Check user's Google Calendar availability for a date range.
 * Fetches busy events from Google Calendar and subtracts from working hours.
 */
export async function checkAvailability(
  userId: string,
  dateRange: { start: Date; end: Date },
  durationMinutes: number
): Promise<TimeSlot[]> {
  // Get user settings for working hours
  const userSettings = await db.userSettings.findUnique({ where: { userId } });
  const workingHoursStart = userSettings?.meetingWorkingHoursStart || '09:00';
  const workingHoursEnd = userSettings?.meetingWorkingHoursEnd || '18:00';
  const workingDaysRaw = userSettings?.meetingWorkingDays || '[1,2,3,4,5]';
  const bufferMinutes = userSettings?.meetingBufferMinutes || 15;
  const timezone = userSettings?.meetingTimezone || 'UTC';

  let workingDays: number[];
  try {
    workingDays = JSON.parse(workingDaysRaw);
  } catch {
    workingDays = [1, 2, 3, 4, 5]; // Mon-Fri default
  }

  // Fetch busy events from Google Calendar
  const busySlots: Array<{ start: Date; end: Date }> = [];

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/freeBusy?alt=json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: dateRange.start.toISOString(),
          timeMax: dateRange.end.toISOString(),
          items: [{ id: 'primary' }],
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const calendars = data.calendars || {};
      const primary = calendars.primary || calendars['primary'];
      if (primary?.busy) {
        for (const busy of primary.busy) {
          busySlots.push({
            start: new Date(busy.start),
            end: new Date(busy.end),
          });
        }
      }
    } else {
      console.warn('[MeetingOrchestration] FreeBusy API failed, falling back to events list');
      // Fallback: use events list API
      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dateRange.start.toISOString())}&timeMax=${encodeURIComponent(dateRange.end.toISOString())}&singleEvents=true&maxResults=250`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        for (const event of eventsData.items || []) {
          if (event.start?.dateTime && event.end?.dateTime) {
            busySlots.push({
              start: new Date(event.start.dateTime),
              end: new Date(event.end.dateTime),
            });
          }
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (errorMsg.includes('No active Google Calendar')) {
      throw new Error('Google Calendar is not connected. Please connect your Google Calendar first.');
    }
    console.error('[MeetingOrchestration] Error fetching calendar availability:', error);
    // Return empty slots rather than failing completely
  }

  // Also fetch meetings from our DB that might not be synced to Google Calendar
  const dbMeetings = await db.meeting.findMany({
    where: {
      userId,
      status: { in: ['scheduled', 'confirmed', 'pending_approval'] },
      startDateTime: { gte: dateRange.start, lte: dateRange.end },
    },
    select: { startDateTime: true, endDateTime: true },
  });

  for (const meeting of dbMeetings) {
    busySlots.push({
      start: new Date(meeting.startDateTime),
      end: new Date(meeting.endDateTime),
    });
  }

  // Generate available time slots based on working hours
  const slots: TimeSlot[] = [];
  const [whStart, wmStart] = workingHoursStart.split(':').map(Number);
  const [whEnd, wmEnd] = workingHoursEnd.split(':').map(Number);

  const current = new Date(dateRange.start);
  const end = new Date(dateRange.end);

  while (current < end) {
    const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ...
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to ISO: 1=Mon, 7=Sun

    if (workingDays.includes(isoDay)) {
      // Create working hours for this day
      const dayStart = new Date(current);
      dayStart.setHours(whStart, wmStart, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(whEnd, wmEnd, 0, 0);

      // Generate slots at durationMinutes intervals
      let slotStart = new Date(dayStart);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

        if (slotEnd > dayEnd) break;

        // Check if slot conflicts with any busy period (with buffer)
        const isBusy = busySlots.some((busy) => {
          const bufferedBusyStart = new Date(busy.start.getTime() - bufferMinutes * 60 * 1000);
          const bufferedBusyEnd = new Date(busy.end.getTime() + bufferMinutes * 60 * 1000);
          return slotStart < bufferedBusyEnd && slotEnd > bufferedBusyStart;
        });

        slots.push({
          start: new Date(slotStart),
          end: new Date(slotEnd),
          available: !isBusy,
        });

        slotStart = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return slots;
}

// ── Smart Slot Suggestion ─────────────────────────────────────────

/**
 * AI-powered meeting slot suggestions.
 * Considers lead timezone, user preferences, lead activity patterns.
 */
export async function suggestMeetingSlots(
  userId: string,
  leadId?: string,
  durationMinutes?: number
): Promise<SuggestedSlot[]> {
  const userSettings = await db.userSettings.findUnique({ where: { userId } });
  const meetingDuration = durationMinutes || userSettings?.meetingDurationDefault || 30;
  const timezone = userSettings?.meetingTimezone || 'UTC';

  // Check availability for next 7 business days
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  // Start from tomorrow at minimum
  startDate.setDate(startDate.getDate() + 1);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 10); // Look ahead 10 days

  const allSlots = await checkAvailability(userId, { start: startDate, end: endDate }, meetingDuration);
  const availableSlots = allSlots.filter((s) => s.available);

  if (availableSlots.length === 0) {
    return [];
  }

  // Get lead info for better suggestions
  let leadCountry: string | null = null;
  let leadActivityPattern: Record<string, number> = {};

  if (leadId) {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { country: true },
    });
    leadCountry = lead?.country || null;

    // Analyze lead's past meeting patterns
    const pastMeetings = await db.meeting.findMany({
      where: { leadId, status: 'completed' },
      select: { startDateTime: true },
      take: 20,
    });

    for (const meeting of pastMeetings) {
      const hour = new Date(meeting.startDateTime).getHours();
      const timeSlot = `${hour}:00`;
      leadActivityPattern[timeSlot] = (leadActivityPattern[timeSlot] || 0) + 1;
    }
  }

  // Score each available slot
  const scoredSlots: SuggestedSlot[] = availableSlots.map((slot) => {
    let score = 0.5; // base score
    const reasons: string[] = [];

    // Prefer morning slots (9-12) — typically more productive
    const hour = slot.start.getHours();
    if (hour >= 9 && hour < 12) {
      score += 0.2;
      reasons.push('Morning slot — typically high productivity');
    } else if (hour >= 13 && hour < 16) {
      score += 0.1;
      reasons.push('Afternoon slot');
    } else if (hour >= 16) {
      score -= 0.05;
      reasons.push('Late afternoon');
    }

    // Prefer slots sooner rather than later (within reason)
    const daysFromNow = Math.floor((slot.start.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysFromNow <= 2) {
      score += 0.15;
      reasons.push('Sooner availability');
    } else if (daysFromNow <= 5) {
      score += 0.05;
      reasons.push('This week');
    }

    // Prefer Tuesday-Thursday (best meeting days per research)
    const dayOfWeek = slot.start.getDay();
    if (dayOfWeek >= 2 && dayOfWeek <= 4) {
      score += 0.1;
      reasons.push('Mid-week — optimal meeting day');
    }

    // Boost if lead has historically met at this time
    const timeSlot = `${hour}:00`;
    if (leadActivityPattern[timeSlot] && leadActivityPattern[timeSlot] > 0) {
      score += 0.15;
      reasons.push('Matches lead\'s preferred meeting time');
    }

    // If lead is in a different country, try to find overlap
    if (leadCountry && leadCountry !== userSettings?.meetingTimezone) {
      // Simple heuristic: if it's a reasonable hour (9-18 local), boost
      if (hour >= 9 && hour < 18) {
        score += 0.05;
        reasons.push('Good timezone overlap');
      }
    }

    return {
      start: slot.start,
      end: slot.end,
      reason: reasons.join('; ') || 'Available slot',
      score: Math.min(Math.round(score * 100) / 100, 1.0),
    };
  });

  // Sort by score descending and return top 5
  scoredSlots.sort((a, b) => b.score - a.score);
  return scoredSlots.slice(0, 5);
}

// ── Create Google Meet Meeting ────────────────────────────────────

/**
 * Create a Google Meet meeting:
 * 1. Create Google Calendar event with Meet conference data
 * 2. Save Meeting record in DB
 * 3. Create LeadActivity if leadId provided
 * 4. Update lead stage to "meeting_scheduled"
 * 5. Create audit log
 * 6. Send confirmation email to client
 * 7. Send in-app notification to user
 */
// ───────────────────────────────────────────────────────────────────
// FIX (2026-09-09): Real-time availability check against the user's
// connected Google Calendar. Used before scheduling so a meeting is
// only created when the requested time is actually free.
// ───────────────────────────────────────────────────────────────────
async function isTimeSlotAvailable(userId: string, start: Date, end: Date): Promise<boolean> {
  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    // Respect the user's buffer preference so back-to-back meetings
    // don't collide with the configured breathing room.
    let bufferMinutes = 15;
    try {
      const userSettings = await db.userSettings.findUnique({ where: { userId } });
      bufferMinutes = userSettings?.meetingBufferMinutes ?? 15;
    } catch {
      // default buffer
    }

    const bufferedStart = new Date(start.getTime() - bufferMinutes * 60 * 1000);
    const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60 * 1000);

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy?alt=json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: bufferedStart.toISOString(),
        timeMax: bufferedEnd.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) {
      // Transient Google API failure — fail open (don't block scheduling),
      // but log loudly so availability issues are traceable.
      console.warn(`[MeetingOrchestration] Availability pre-check freeBusy failed (${response.status}) — failing open`);
      return true;
    }

    const data = await response.json();
    const busyPeriods: Array<{ start: string; end: string }> = data.calendars?.primary?.busy || [];
    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start).getTime();
      const busyEnd = new Date(busy.end).getTime();
      // Overlap test (buffered window vs busy period)
      if (bufferedStart.getTime() < busyEnd && bufferedEnd.getTime() > busyStart) {
        return false;
      }
    }
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // No calendar connected — rethrow so the caller surfaces the
    // "connect your Google Calendar" error as before.
    if (msg.includes('No active Google Calendar')) {
      throw error;
    }
    // Other errors (network blips, token hiccups) — fail open.
    console.warn('[MeetingOrchestration] Availability pre-check error — failing open:', msg);
    return true;
  }
}

export async function createGoogleMeetMeeting(
  userId: string,
  params: CreateMeetingParams
): Promise<{
  id: string;
  title: string;
  meetingUrl: string | null;
  calendarEventId: string | null;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  platform: string;
  status: string;
  leadId: string | null;
  attendees: string;
  [key: string]: unknown;
}> {
  const {
    title,
    description,
    meetingType = 'video',
    platform = 'google_meet',
    startDateTime,
    endDateTime,
    durationMinutes = 30,
    timezone = 'UTC',
    agenda,
    attendees = [],
    location,
    leadId,
    dealId,
    createdBy = 'user',
    reminders,
  } = params;

  const startDate = new Date(startDateTime);
  const endDate = new Date(endDateTime);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date format. Use ISO 8601 format.');
  }
  if (startDate >= endDate) {
    throw new Error('End date must be after start date.');
  }
  if (startDate < new Date()) {
    throw new Error('Cannot schedule meetings in the past.');
  }

  // FIX (2026-09-09): Real-time availability check against the user's
  // Google Calendar before scheduling. If the requested time conflicts
  // with an existing event, refuse to schedule and surface a clear
  // 409 to the caller (mapped in POST /api/meetings).
  if (platform === 'google_meet') {
    const slotFree = await isTimeSlotAvailable(userId, startDate, endDate);
    if (!slotFree) {
      throw new Error(
        'TIME_SLOT_UNAVAILABLE: The requested time is not available in your Google Calendar — it conflicts with an existing event. Please pick a different time.'
      );
    }
  }

  let calendarEventId: string | null = null;
  let meetingUrl: string | null = null;
  let conferenceDataJson: string | null = null;

  // Use the platform adapter for meeting creation
  try {
    const { getMeetingAdapter } = await import('./meetings/platform-adapter');
    const adapter = getMeetingAdapter(platform);

    const result = await adapter.createMeeting({
      title,
      description,
      startTime: startDate,
      endTime: endDate,
      timezone,
      attendees,
      platform: platform.toUpperCase().replace(/-/g, '_') as import('./meetings/platform-adapter').MeetingPlatform,
      leadId: leadId || undefined,
      dealId: dealId || undefined,
      userId,
    });

    if (result.success) {
      calendarEventId = result.calendarEventId || null;
      meetingUrl = result.meetingLink || null;
      conferenceDataJson = result.conferenceData ? JSON.stringify(result.conferenceData) : null;
    } else {
      console.error('[MeetingOrchestration] Adapter failed to create meeting:', result.error);
      // Continue without calendar event — meeting will still be saved
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (errorMsg.includes('No active Google Calendar')) {
      throw new Error('Google Calendar is not connected. Please connect your Google Calendar to create Google Meet meetings.');
    }
    if (errorMsg.includes('Not implemented')) {
      throw new Error(`The selected meeting platform is not yet supported. Please use Google Meet for now. Error: ${errorMsg}`);
    }
    console.error('[MeetingOrchestration] Adapter meeting creation error:', error);
    // Continue — save meeting without calendar event
  }

  // Save Meeting record in DB
  const meeting = await db.meeting.create({
    data: {
      userId,
      leadId: leadId || null,
      dealId: dealId || null,
      title,
      description: description || null,
      meetingType,
      platform,
      meetingUrl,
      calendarEventId,
      status: 'scheduled',
      startDateTime: startDate,
      endDateTime: endDate,
      durationMinutes,
      timezone,
      agenda: agenda || null,
      attendees: JSON.stringify(attendees),
      location: location || null,
      conferenceData: conferenceDataJson,
      reminders: reminders ? JSON.stringify(reminders) : JSON.stringify([
        { minutesBefore: 10, type: 'popup' },
        { minutesBefore: 60, type: 'email' },
      ]),
      createdBy,
      approvalStatus: 'approved',
    },
  });

  // Create LeadActivity if leadId provided
  if (leadId) {
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'meeting_scheduled',
        description: `Meeting scheduled: "${title}" on ${startDate.toLocaleString()}`,
        metadata: JSON.stringify({
          meetingId: meeting.id,
          meetingUrl,
          startDateTime: startDateTime,
          endDateTime: endDateTime,
          timezone,
          platform,
        }),
      },
    });

    // Update lead stage to "meeting_scheduled" (with pipeline validation)
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (lead && lead.stage !== 'meeting_scheduled' && lead.stage !== 'meeting_completed' && lead.stage !== 'won') {
      const validation = validateStageTransition(lead.stage, 'meeting_scheduled');
      if (validation.valid) {
        await db.lead.update({
          where: { id: leadId },
          data: {
            stage: 'meeting_scheduled',
            lastContactedAt: new Date(),
          },
        });
      } else {
        console.warn(`[MeetingOrchestration] Invalid stage transition for lead ${leadId}: ${lead.stage} → meeting_scheduled: ${validation.reason}`);
      }
    }

    // Update deal status if linked
    if (dealId) {
      try {
        await updateDealAfterMeeting(meeting.id, 'meeting_scheduled' as CRMAction);
      } catch (dealError) {
        console.warn('[MeetingOrchestration] Failed to update deal after meeting creation:', dealError);
      }
    }
  }

  // Create audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'meeting_created',
      details: JSON.stringify({
        meetingId: meeting.id,
        title,
        platform,
        meetingUrl,
        startDateTime,
        endDateTime,
        leadId: leadId || null,
      }),
      resource: 'meeting',
      resourceId: meeting.id,
    },
  });

  // Send confirmation email to attendees (using professional meeting-email.ts templates)
  if (attendees.length > 0) {
    try {
      const user = await db.user.findUnique({ where: { id: userId } });
      const userName = user?.name || user?.email || 'AcquisitionOS User';
      const userCompany = user?.company || undefined;

      for (const attendee of attendees) {
        await sendMeetingConfirmationToClient({
          meetingId: meeting.id,
          clientEmail: attendee.email,
          clientName: attendee.name || 'Attendee',
          meetingTitle: title,
          meetingUrl: meetingUrl || undefined,
          startDateTime: startDate,
          endDateTime: endDate,
          timezone,
          durationMinutes,
          platform,
          location: location || undefined,
          agenda: agenda || undefined,
          hostName: userName,
          hostCompany: userCompany,
        });
      }
    } catch (emailError) {
      console.error('[MeetingOrchestration] Failed to send confirmation email:', emailError);
      // Don't fail the meeting creation
    }
  }

  // Send notification email to the meeting owner
  try {
    await sendMeetingNotificationToUser({
      userId,
      meetingId: meeting.id,
      meetingTitle: title,
      leadName: undefined,
      leadId: leadId || undefined,
      startDateTime: startDate,
      timezone,
      platform,
      meetingUrl: meetingUrl || undefined,
      calendarSynced: !!calendarEventId,
      crmLinked: !!leadId,
    });
  } catch (emailError) {
    console.error('[MeetingOrchestration] Failed to send user notification email:', emailError);
  }

  // Send in-app notification to user
  try {
    await db.notification.create({
      data: {
        userId,
        type: 'meeting_scheduled',
        title: 'Meeting Scheduled',
        message: `"${title}" has been scheduled for ${startDate.toLocaleString()}`,
        actionUrl: `/meetings/${meeting.id}`,
        deliveredVia: 'in_app',
        metadata: JSON.stringify({ meetingId: meeting.id, meetingUrl }),
      },
    });
  } catch (notifError) {
    console.error('[MeetingOrchestration] Failed to create notification:', notifError);
  }

  // Create meeting reminders
  try {
    await createMeetingReminders(meeting.id, userId, meeting.startDateTime);
  } catch (reminderError) {
    console.error('[MeetingOrchestration] Failed to create reminders:', reminderError);
  }

  return {
    id: meeting.id,
    title: meeting.title,
    meetingUrl: meeting.meetingUrl,
    calendarEventId: meeting.calendarEventId,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    timezone: meeting.timezone,
    platform: meeting.platform,
    status: meeting.status,
    leadId: meeting.leadId,
    attendees: meeting.attendees,
  };
}

// ── Update Meeting ────────────────────────────────────────────────

/**
 * Update a meeting:
 * - Update Google Calendar event
 * - Update Meeting record
 * - Send notification emails to attendees
 * - Create audit log
 */
export async function updateMeeting(
  userId: string,
  meetingId: string,
  params: UpdateMeetingParams
): Promise<{
  id: string;
  title: string;
  meetingUrl: string | null;
  startDateTime: Date;
  endDateTime: Date;
  status: string;
  [key: string]: unknown;
}> {
  // Fetch existing meeting
  const existing = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  });

  if (!existing) {
    throw new Error('Meeting not found or you do not have access.');
  }

  const { startDateTime, endDateTime, attendees, followUpActions, ...otherParams } = params;

  // Update Google Calendar event if we have a calendarEventId
  if (existing.calendarEventId) {
    try {
      const { accessToken } = await getValidCalendarAccessToken(userId);

      const eventUpdate: Record<string, unknown> = {};

      if (otherParams.title) eventUpdate.summary = otherParams.title;
      if (otherParams.description !== undefined) eventUpdate.description = otherParams.description;
      if (otherParams.location) eventUpdate.location = otherParams.location;

      if (startDateTime) {
        eventUpdate.start = {
          dateTime: startDateTime,
          timeZone: otherParams.timezone || existing.timezone,
        };
      }
      if (endDateTime) {
        eventUpdate.end = {
          dateTime: endDateTime,
          timeZone: otherParams.timezone || existing.timezone,
        };
      }

      if (attendees) {
        eventUpdate.attendees = attendees.map((a) => ({ email: a.email, displayName: a.name }));
      }

      // Only update if we have changes
      if (Object.keys(eventUpdate).length > 0) {
        const updateResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing.calendarEventId}?conferenceDataVersion=1`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventUpdate),
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('[MeetingOrchestration] Failed to update calendar event:', errorText);
        }
      }
    } catch (error) {
      console.error('[MeetingOrchestration] Calendar update error:', error);
      // Continue with DB update even if calendar update fails
    }
  }

  // Update DB record
  const updateData: Record<string, unknown> = {};
  if (otherParams.title) updateData.title = otherParams.title;
  if (otherParams.description !== undefined) updateData.description = otherParams.description;
  if (otherParams.meetingType) updateData.meetingType = otherParams.meetingType;
  if (startDateTime) updateData.startDateTime = new Date(startDateTime);
  if (endDateTime) updateData.endDateTime = new Date(endDateTime);
  if (otherParams.durationMinutes) updateData.durationMinutes = otherParams.durationMinutes;
  if (otherParams.timezone) updateData.timezone = otherParams.timezone;
  if (otherParams.agenda) updateData.agenda = otherParams.agenda;
  if (attendees) updateData.attendees = JSON.stringify(attendees);
  if (otherParams.location) updateData.location = otherParams.location;
  if (otherParams.status) updateData.status = otherParams.status;
  if (otherParams.notes !== undefined) updateData.notes = otherParams.notes;
  if (followUpActions) updateData.followUpActions = JSON.stringify(followUpActions);
  if (otherParams.recordingUrl) updateData.recordingUrl = otherParams.recordingUrl;

  const meeting = await db.meeting.update({
    where: { id: meetingId },
    data: updateData,
  });

  // Send update email to attendees (using professional meeting-email.ts templates)
  if (startDateTime || endDateTime || attendees || otherParams.title || otherParams.location) {
    try {
      const attendeesList = attendees || JSON.parse(existing.attendees || '[]') as Array<{ email: string; name?: string }>;
      const user = await db.user.findUnique({ where: { id: userId } });
      const userName = user?.name || user?.email || 'AcquisitionOS User';

      // Build changes list for the email
      const changes: string[] = [];
      if (startDateTime) changes.push('Start time changed');
      if (endDateTime) changes.push('End time changed');
      if (otherParams.title) changes.push('Title changed');
      if (otherParams.location) changes.push('Location changed');
      if (attendees) changes.push('Attendees updated');
      if (otherParams.agenda) changes.push('Agenda updated');

      for (const attendee of attendeesList) {
        await sendMeetingUpdateToClient({
          meetingId,
          clientEmail: attendee.email,
          clientName: attendee.name || 'Attendee',
          meetingTitle: meeting.title,
          meetingUrl: meeting.meetingUrl || undefined,
          startDateTime: new Date(meeting.startDateTime),
          endDateTime: new Date(meeting.endDateTime),
          timezone: meeting.timezone,
          durationMinutes: meeting.durationMinutes,
          platform: meeting.platform,
          location: meeting.location || undefined,
          hostName: userName,
          changes: changes.length > 0 ? changes : ['Meeting updated'],
        });
      }
    } catch (emailError) {
      console.error('[MeetingOrchestration] Failed to send update email:', emailError);
    }
  }

  // Create LeadActivity for the update
  if (existing.leadId) {
    try {
      await db.leadActivity.create({
        data: {
          leadId: existing.leadId,
          type: 'meeting_updated',
          description: `Meeting updated: "${meeting.title}" — ${Object.keys(updateData).join(', ')}`,
          metadata: JSON.stringify({ meetingId, changes: Object.keys(updateData) }),
        },
      });
    } catch (activityError) {
      console.error('[MeetingOrchestration] Failed to create lead activity for update:', activityError);
    }

    // Update deal status if linked
    if (existing.dealId) {
      try {
        await updateDealAfterMeeting(meetingId, 'meeting_rescheduled' as CRMAction);
      } catch (dealError) {
        console.warn('[MeetingOrchestration] Failed to update deal after meeting update:', dealError);
      }
    }
  }

  // Create audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'meeting_updated',
      details: JSON.stringify({ meetingId, changes: Object.keys(updateData) }),
      resource: 'meeting',
      resourceId: meetingId,
    },
  });

  return {
    id: meeting.id,
    title: meeting.title,
    meetingUrl: meeting.meetingUrl,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    status: meeting.status,
  };
}

// ── Cancel Meeting ────────────────────────────────────────────────

/**
 * Cancel a meeting:
 * - Delete/update Google Calendar event
 * - Mark meeting as cancelled
 * - Send cancellation emails
 * - Update lead stage if applicable
 * - Create audit log
 */
export async function cancelMeeting(
  userId: string,
  meetingId: string,
  reason?: string
): Promise<{
  id: string;
  title: string;
  status: string;
  cancellationReason: string | null;
  [key: string]: unknown;
}> {
  const existing = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  });

  if (!existing) {
    throw new Error('Meeting not found or you do not have access.');
  }

  if (existing.status === 'cancelled') {
    throw new Error('Meeting is already cancelled.');
  }

  // Cancel any existing reminders
  try {
    await cancelMeetingReminders(meetingId);
  } catch (e) {
    console.error('[MeetingOrchestration] Failed to cancel reminders:', e);
  }

  // Delete Google Calendar event
  if (existing.calendarEventId) {
    try {
      const { accessToken } = await getValidCalendarAccessToken(userId);

      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing.calendarEventId}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const errorText = await deleteResponse.text();
        console.error('[MeetingOrchestration] Failed to delete calendar event:', errorText);
      }
    } catch (error) {
      console.error('[MeetingOrchestration] Calendar deletion error:', error);
    }
  }

  // Update meeting status
  const meeting = await db.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'cancelled',
      cancellationReason: reason || null,
    },
  });

  // Send cancellation email to attendees (using professional meeting-email.ts templates)
  try {
    const attendeesList = JSON.parse(existing.attendees || '[]') as Array<{ email: string; name?: string }>;
    const user = await db.user.findUnique({ where: { id: userId } });
    const userName = user?.name || user?.email || 'AcquisitionOS User';
    const appUrl = getAppUrl();

    for (const attendee of attendeesList) {
      await sendMeetingCancellationToClient({
        meetingId,
        clientEmail: attendee.email,
        clientName: attendee.name || 'Attendee',
        meetingTitle: existing.title,
        originalStartDateTime: new Date(existing.startDateTime),
        originalTimezone: existing.timezone,
        hostName: userName,
        reason: reason || undefined,
        rescheduleUrl: `${appUrl}/meetings/${meetingId}`,
      });
    }
  } catch (emailError) {
    console.error('[MeetingOrchestration] Failed to send cancellation email:', emailError);
  }

  // Update lead stage back if applicable (with pipeline validation)
  if (existing.leadId) {
    const lead = await db.lead.findUnique({ where: { id: existing.leadId } });
    if (lead) {
      const validation = validateStageTransition(lead.stage, 'interested');
      if (validation.valid) {
        await db.lead.update({
          where: { id: existing.leadId },
          data: { stage: 'interested' },
        });
      } else {
        console.warn(`[MeetingOrchestration] Invalid stage transition for lead ${existing.leadId}: ${lead.stage} → interested: ${validation.reason}`);
      }
    }

    // Create lead activity
    await db.leadActivity.create({
      data: {
        leadId: existing.leadId,
        type: 'meeting_cancelled',
        description: `Meeting cancelled: "${existing.title}"${reason ? ` — ${reason}` : ''}`,
        metadata: JSON.stringify({ meetingId, reason }),
      },
    });

    // Update deal status if linked
    if (existing.dealId) {
      try {
        await updateDealAfterMeeting(meetingId, 'meeting_cancelled' as CRMAction);
      } catch (dealError) {
        console.warn('[MeetingOrchestration] Failed to update deal after meeting cancellation:', dealError);
      }
    }
  }

  // Create audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'meeting_cancelled',
      details: JSON.stringify({ meetingId, title: existing.title, reason }),
      resource: 'meeting',
      resourceId: meetingId,
    },
  });

  // Send in-app notification
  try {
    await db.notification.create({
      data: {
        userId,
        type: 'meeting_cancelled',
        title: 'Meeting Cancelled',
        message: `"${existing.title}" has been cancelled${reason ? `: ${reason}` : ''}`,
        deliveredVia: 'in_app',
        metadata: JSON.stringify({ meetingId }),
      },
    });
  } catch (notifError) {
    console.error('[MeetingOrchestration] Failed to create notification:', notifError);
  }

  return {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    cancellationReason: meeting.cancellationReason,
  };
}

// ── Complete Meeting ──────────────────────────────────────────────

/**
 * Mark a meeting as completed:
 * - Update meeting status and notes
 * - Update lead stage to "meeting_completed"
 * - Create follow-up reminders
 * - Create audit log
 */
export async function completeMeeting(
  userId: string,
  meetingId: string,
  notes?: string,
  followUpActions?: string[]
): Promise<{
  id: string;
  title: string;
  status: string;
  notes: string | null;
  followUpActions: string | null;
  [key: string]: unknown;
}> {
  const existing = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  });

  if (!existing) {
    throw new Error('Meeting not found or you do not have access.');
  }

  if (existing.status === 'completed') {
    throw new Error('Meeting is already marked as completed.');
  }

  if (existing.status === 'cancelled') {
    throw new Error('Cannot complete a cancelled meeting.');
  }

  // Update meeting
  const meeting = await db.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'completed',
      notes: notes || existing.notes,
      followUpActions: followUpActions ? JSON.stringify(followUpActions) : existing.followUpActions,
    },
  });

  // Update lead stage (with pipeline validation)
  if (existing.leadId) {
    const lead = await db.lead.findUnique({ where: { id: existing.leadId } });
    if (lead) {
      const validation = validateStageTransition(lead.stage, 'meeting_completed');
      if (validation.valid && lead.stage === 'meeting_scheduled') {
        await db.lead.update({
          where: { id: existing.leadId },
          data: { stage: 'meeting_completed' },
        });
      } else if (!validation.valid) {
        console.warn(`[MeetingOrchestration] Invalid stage transition for lead ${existing.leadId}: ${lead.stage} → meeting_completed: ${validation.reason}`);
      }
    }

    // Create lead activity
    await db.leadActivity.create({
      data: {
        leadId: existing.leadId,
        type: 'meeting_completed',
        description: `Meeting completed: "${existing.title}"`,
        metadata: JSON.stringify({
          meetingId,
          notes: notes ? notes.substring(0, 500) : null,
          followUpActions,
        }),
      },
    });

    // Update deal status if linked
    if (existing.dealId) {
      try {
        await updateDealAfterMeeting(meetingId, 'meeting_completed' as CRMAction);
      } catch (dealError) {
        console.warn('[MeetingOrchestration] Failed to update deal after meeting completion:', dealError);
      }
    }

    // Create follow-up reminders
    if (followUpActions && followUpActions.length > 0) {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 1); // Default: remind in 1 day

      for (let i = 0; i < Math.min(followUpActions.length, 5); i++) {
        const dueAt = new Date(reminderDate);
        dueAt.setDate(dueAt.getDate() + i); // Stagger reminders

        await db.followUpReminder.create({
          data: {
            leadId: existing.leadId,
            message: `Follow-up: ${followUpActions[i]}`,
            dueAt,
            completed: false,
          },
        });
      }
    }
  }

  // Create audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'meeting_completed',
      details: JSON.stringify({
        meetingId,
        title: existing.title,
        hasNotes: !!notes,
        followUpActionCount: followUpActions?.length || 0,
      }),
      resource: 'meeting',
      resourceId: meetingId,
    },
  });

  // Send completion follow-up email to the meeting owner
  try {
    const hostUser = await db.user.findUnique({ where: { id: userId } });
    const leadInfo = existing.leadId
      ? await db.lead.findUnique({ where: { id: existing.leadId }, select: { businessName: true } })
      : null;

    await sendMeetingNotificationToUser({
      userId,
      meetingId,
      meetingTitle: existing.title,
      leadName: leadInfo?.businessName || undefined,
      leadId: existing.leadId || undefined,
      startDateTime: new Date(existing.startDateTime),
      timezone: existing.timezone,
      platform: existing.platform,
      meetingUrl: existing.meetingUrl || undefined,
      calendarSynced: !!existing.calendarEventId,
      crmLinked: !!existing.leadId,
    });
  } catch (emailError) {
    console.error('[MeetingOrchestration] Failed to send completion email:', emailError);
  }

  // Send in-app notification
  try {
    await db.notification.create({
      data: {
        userId,
        type: 'meeting_completed',
        title: 'Meeting Completed',
        message: `"${existing.title}" has been marked as completed`,
        deliveredVia: 'in_app',
        metadata: JSON.stringify({ meetingId }),
      },
    });
  } catch (notifError) {
    console.error('[MeetingOrchestration] Failed to create notification:', notifError);
  }

  return {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    notes: meeting.notes,
    followUpActions: meeting.followUpActions,
  };
}

// ── Get User Meetings ─────────────────────────────────────────────

/**
 * Get user's meetings with optional filters.
 */
export async function getUserMeetings(
  userId: string,
  filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    leadId?: string;
  }
): Promise<Array<Record<string, unknown>>> {
  const where: Record<string, unknown> = { userId };

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.leadId) {
    where.leadId = filters.leadId;
  }
  if (filters?.startDate || filters?.endDate) {
    const startDateTimeFilter: Record<string, Date> = {};
    if (filters?.startDate) startDateTimeFilter.gte = new Date(filters.startDate);
    if (filters?.endDate) startDateTimeFilter.lte = new Date(filters.endDate);
    where.startDateTime = startDateTimeFilter;
  }

  const meetings = await db.meeting.findMany({
    where,
    orderBy: { startDateTime: 'desc' },
    take: 100,
    include: {
      lead: {
        select: { id: true, businessName: true, ownerName: true, email: true },
      },
      deal: {
        select: { id: true, title: true, proposedPrice: true, finalPrice: true, status: true },
      },
    },
  });

  return meetings.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    meetingType: m.meetingType,
    platform: m.platform,
    meetingUrl: m.meetingUrl,
    calendarEventId: m.calendarEventId,
    status: m.status,
    startDateTime: m.startDateTime,
    endDateTime: m.endDateTime,
    durationMinutes: m.durationMinutes,
    timezone: m.timezone,
    agenda: m.agenda,
    attendees: m.attendees,
    location: m.location,
    leadId: m.leadId,
    dealId: m.dealId,
    notes: m.notes,
    createdBy: m.createdBy,
    cancellationReason: m.cancellationReason,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    leadName: m.lead?.businessName || m.lead?.ownerName || null,
    leadEmail: m.lead?.email || null,
    dealName: m.deal?.title || null,
    dealValue: m.deal?.finalPrice ?? m.deal?.proposedPrice ?? null,
    dealStatus: m.deal?.status || null,
  }));
}

/**
 * Get a single meeting by ID.
 */
export async function getMeetingById(
  userId: string,
  meetingId: string
): Promise<Record<string, unknown> | null> {
  const meeting = await db.meeting.findFirst({
    where: { id: meetingId, userId },
    include: {
      lead: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          email: true,
          website: true,
          niche: true,
          stage: true,
        },
      },
      deal: {
        select: {
          id: true,
          title: true,
          proposedPrice: true,
          finalPrice: true,
          status: true,
          stage: true,
        },
      },
    },
  });

  if (!meeting) return null;

  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    meetingType: meeting.meetingType,
    platform: meeting.platform,
    meetingUrl: meeting.meetingUrl,
    calendarEventId: meeting.calendarEventId,
    status: meeting.status,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    durationMinutes: meeting.durationMinutes,
    timezone: meeting.timezone,
    agenda: meeting.agenda,
    actionItems: meeting.actionItems,
    attendees: meeting.attendees,
    location: meeting.location,
    conferenceData: meeting.conferenceData,
    reminders: meeting.reminders,
    followUpActions: meeting.followUpActions,
    notes: meeting.notes,
    recordingUrl: meeting.recordingUrl,
    leadId: meeting.leadId,
    dealId: meeting.dealId,
    createdBy: meeting.createdBy,
    approvalStatus: meeting.approvalStatus,
    cancellationReason: meeting.cancellationReason,
    rescheduledFrom: meeting.rescheduledFrom,
    metadata: meeting.metadata,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    lead: meeting.lead ? {
      id: meeting.lead.id,
      name: meeting.lead.businessName || meeting.lead.ownerName,
      email: meeting.lead.email,
      website: meeting.lead.website,
      niche: meeting.lead.niche,
      stage: meeting.lead.stage,
    } : null,
    deal: meeting.deal ? {
      id: meeting.deal.id,
      title: meeting.deal.title,
      value: meeting.deal.finalPrice ?? meeting.deal.proposedPrice,
      status: meeting.deal.status,
      stage: meeting.deal.stage,
    } : null,
  };
}

// ── Reschedule Meeting ──────────────────────────────────────────

/**
 * Reschedule a meeting to new date/time:
 * - Validate dates
 * - Update Google Calendar event
 * - Update DB record with new times, track rescheduledFrom
 * - Send reschedule emails to attendees
 * - Create lead activity
 * - Send in-app notification
 * - Create audit log
 */
export async function rescheduleMeeting(
  userId: string,
  meetingId: string,
  newStartDateTime: string,
  newEndDateTime: string,
  reason?: string
): Promise<Record<string, unknown>> {
  // 1. Fetch existing meeting
  const existing = await db.meeting.findFirst({
    where: { id: meetingId, userId },
  });

  if (!existing) {
    throw new Error('Meeting not found or you do not have access.');
  }

  if (existing.status === 'cancelled') {
    throw new Error('Cannot reschedule a cancelled meeting.');
  }

  if (existing.status === 'completed') {
    throw new Error('Cannot reschedule a completed meeting.');
  }

  const newStart = new Date(newStartDateTime);
  const newEnd = new Date(newEndDateTime);

  // 2. Validate dates
  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
    throw new Error('Invalid date format. Use ISO 8601 format.');
  }
  if (newStart >= newEnd) {
    throw new Error('End date must be after start date.');
  }
  if (newStart < new Date()) {
    throw new Error('Cannot reschedule meetings to the past.');
  }

  const oldStartDateTime = new Date(existing.startDateTime);

  // 3. Update Google Calendar event (if exists)
  if (existing.calendarEventId) {
    try {
      const { accessToken } = await getValidCalendarAccessToken(userId);

      const eventUpdate: Record<string, unknown> = {
        start: {
          dateTime: newStartDateTime,
          timeZone: existing.timezone,
        },
        end: {
          dateTime: newEndDateTime,
          timeZone: existing.timezone,
        },
      };

      const updateResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existing.calendarEventId}?sendUpdates=all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventUpdate),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[MeetingOrchestration] Failed to update calendar event for reschedule:', errorText);
      }
    } catch (error) {
      console.error('[MeetingOrchestration] Calendar update error during reschedule:', error);
      // Continue with DB update even if calendar update fails
    }
  }

  // 4. Update DB record with new times, set rescheduledFrom = old start time
  const durationMinutes = Math.round(
    (newEnd.getTime() - newStart.getTime()) / (1000 * 60)
  );

  const meeting = await db.meeting.update({
    where: { id: meetingId },
    data: {
      startDateTime: newStart,
      endDateTime: newEnd,
      durationMinutes,
      rescheduledFrom: oldStartDateTime.toISOString(),
      status: existing.status === 'pending_approval' ? existing.status : 'scheduled',
    },
  });

  // Reschedule meeting reminders
  try {
    await rescheduleMeetingReminders(meetingId, newStart);
  } catch (e) {
    console.error('[MeetingOrchestration] Failed to reschedule reminders:', e);
  }

  // 5. Send reschedule emails to attendees (using professional meeting-email.ts templates)
  try {
    const attendeesList = JSON.parse(existing.attendees || '[]') as Array<{ email: string; name?: string }>;
    const user = await db.user.findUnique({ where: { id: userId } });
    const userName = user?.name || user?.email || 'AcquisitionOS User';

    // Build changes list for the reschedule email
    const changes: string[] = [
      `Time changed from ${oldStartDateTime.toLocaleString()} to ${newStart.toLocaleString()}`,
    ];
    if (reason) changes.push(`Reason: ${reason}`);

    for (const attendee of attendeesList) {
      await sendMeetingUpdateToClient({
        meetingId,
        clientEmail: attendee.email,
        clientName: attendee.name || 'Attendee',
        meetingTitle: meeting.title,
        meetingUrl: meeting.meetingUrl || undefined,
        startDateTime: newStart,
        endDateTime: newEnd,
        timezone: meeting.timezone,
        durationMinutes: meeting.durationMinutes,
        platform: meeting.platform,
        location: meeting.location || undefined,
        hostName: userName,
        changes,
      });
    }
  } catch (emailError) {
    console.error('[MeetingOrchestration] Failed to send reschedule email:', emailError);
  }

  // 6. Create lead activity + update deal
  if (existing.leadId) {
    try {
      await db.leadActivity.create({
        data: {
          leadId: existing.leadId,
          type: 'meeting_rescheduled',
          description: `Meeting rescheduled: "${existing.title}" from ${oldStartDateTime.toLocaleString()} to ${newStart.toLocaleString()}`,
          metadata: JSON.stringify({
            meetingId,
            oldStartDateTime: oldStartDateTime.toISOString(),
            newStartDateTime: newStart.toISOString(),
            reason,
          }),
        },
      });
    } catch (activityError) {
      console.error('[MeetingOrchestration] Failed to create lead activity for reschedule:', activityError);
    }

    // Update deal status if linked
    if (existing.dealId) {
      try {
        await updateDealAfterMeeting(meetingId, 'meeting_rescheduled' as CRMAction);
      } catch (dealError) {
        console.warn('[MeetingOrchestration] Failed to update deal after meeting reschedule:', dealError);
      }
    }
  }

  // 7. Send in-app notification
  try {
    await db.notification.create({
      data: {
        userId,
        type: 'meeting_rescheduled',
        title: 'Meeting Rescheduled',
        message: `"${existing.title}" has been rescheduled to ${newStart.toLocaleString()}`,
        actionUrl: `/meetings/${meetingId}`,
        deliveredVia: 'in_app',
        metadata: JSON.stringify({ meetingId, reason }),
      },
    });
  } catch (notifError) {
    console.error('[MeetingOrchestration] Failed to create notification:', notifError);
  }

  // 8. Create audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'meeting_rescheduled',
      details: JSON.stringify({
        meetingId,
        title: existing.title,
        oldStartDateTime: oldStartDateTime.toISOString(),
        newStartDateTime: newStart.toISOString(),
        newEndDateTime: newEnd.toISOString(),
        reason,
      }),
      resource: 'meeting',
      resourceId: meetingId,
    },
  });

  return {
    id: meeting.id,
    title: meeting.title,
    meetingUrl: meeting.meetingUrl,
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    status: meeting.status,
    rescheduledFrom: meeting.rescheduledFrom,
    durationMinutes: meeting.durationMinutes,
  };
}

// ── Meeting Stats ────────────────────────────────────────────────

/**
 * Get meeting statistics for a user.
 * Includes totals, rates, and weekly/monthly counts.
 */
export async function getMeetingStats(userId: string): Promise<{
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  avgDurationMinutes: number;
  completionRate: number;
  thisWeek: number;
  thisMonthTotal: number;
  conversionRate: number;
  trend: {
    direction: 'up' | 'down';
    value: number;
  };
}> {
  const meetings = await db.meeting.findMany({
    where: { userId },
    select: {
      status: true,
      durationMinutes: true,
      startDateTime: true,
      leadId: true,
    },
  });

  const total = meetings.length;
  const scheduled = meetings.filter((m) => m.status === 'scheduled' || m.status === 'confirmed').length;
  const completed = meetings.filter((m) => m.status === 'completed').length;
  const cancelled = meetings.filter((m) => m.status === 'cancelled').length;

  // Average duration of completed meetings
  const completedMeetings = meetings.filter((m) => m.status === 'completed');
  const avgDurationMinutes = completedMeetings.length > 0
    ? Math.round(
        completedMeetings.reduce((sum, m) => sum + (m.durationMinutes || 0), 0) / completedMeetings.length
      )
    : 0;

  // Completion rate
  const completionRate = total > 0
    ? Math.round((completed / total) * 100) / 100
    : 0;

  // thisWeekTotal: meetings with startDateTime in current ISO week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - isoDay + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const thisWeekTotal = meetings.filter((m) => {
    const start = new Date(m.startDateTime);
    return start >= startOfWeek && start < endOfWeek;
  }).length;

  // lastWeekTotal: meetings from the previous ISO week
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfWeek);

  const lastWeekTotal = meetings.filter((m) => {
    const start = new Date(m.startDateTime);
    return start >= startOfLastWeek && start < endOfLastWeek;
  }).length;

  // thisMonthTotal: meetings with startDateTime in current calendar month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const thisMonthTotal = meetings.filter((m) => {
    const start = new Date(m.startDateTime);
    return start >= startOfMonth && start < endOfMonth;
  }).length;

  // conversionRate: completed meetings with leadId where lead stage is 'won' or 'proposal_pending'
  const completedWithLead = completedMeetings.filter((m) => !!m.leadId);
  let conversionRate = 0;

  if (completedWithLead.length > 0) {
    const leadIds = completedWithLead.map((m) => m.leadId!);
    const leads = await db.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, stage: true },
    });

    const convertedLeads = leads.filter(
      (l) => l.stage === 'won' || l.stage === 'proposal_pending'
    ).length;

    conversionRate = Math.round((convertedLeads / completedWithLead.length) * 100) / 100;
  }

  const trend = {
    direction: lastWeekTotal > 0
      ? (thisWeekTotal > lastWeekTotal ? 'up' as const : 'down' as const)
      : 'up' as const,
    value: lastWeekTotal > 0
      ? Math.abs(Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100))
      : 0,
  };

  return {
    total,
    scheduled,
    completed,
    cancelled,
    avgDurationMinutes,
    completionRate,
    thisWeek: thisWeekTotal,
    thisMonthTotal,
    conversionRate,
    trend,
  };
}

// ── Process Meeting Reminders (Cron) ────────────────────────────

/**
 * Process meeting reminders for all scheduled meetings starting within the next 60 minutes.
 * Designed to be called by a cron job.
 */
export async function processMeetingReminders(): Promise<{ processed: number; errors: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 1 * 60 * 1000); // 1 minute from now
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000);  // 60 minutes from now

  // Find all meetings with status 'scheduled' starting within next 60 minutes
  const upcomingMeetings = await db.meeting.findMany({
    where: {
      status: 'scheduled',
      startDateTime: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  let processed = 0;
  let errors = 0;

  for (const meeting of upcomingMeetings) {
    try {
      // Check if reminder was already sent (check reminders JSON field)
      let reminders: Array<{ minutesBefore: number; type: string; sent?: boolean }> = [];
      try {
        reminders = JSON.parse(meeting.reminders || '[]');
      } catch {
        reminders = [];
      }

      // Check if the 60-minute reminder was already sent
      const reminderEntry = reminders.find((r) => r.minutesBefore === 60);
      if (reminderEntry?.sent) {
        continue; // Already sent
      }

      // Parse attendees
      let attendees: Array<{ email: string; name?: string }> = [];
      try {
        attendees = JSON.parse(meeting.attendees || '[]');
      } catch {
        attendees = [];
      }

      const hostName = meeting.user?.name || meeting.user?.email || 'AcquisitionOS User';
      const meetingStart = new Date(meeting.startDateTime);
      const meetingEnd = new Date(meeting.endDateTime);

      // Calculate minutes until meeting
      const minutesUntilMeeting = Math.round(
        (meetingStart.getTime() - now.getTime()) / (60 * 1000)
      );

      // Send reminder email to all attendees (using professional meeting-email.ts templates)
      for (const attendee of attendees) {
        await sendMeetingReminderToClient({
          meetingId: meeting.id,
          clientEmail: attendee.email,
          clientName: attendee.name || 'Attendee',
          meetingTitle: meeting.title,
          meetingUrl: meeting.meetingUrl || undefined,
          startDateTime: meetingStart,
          endDateTime: meetingEnd,
          timezone: meeting.timezone,
          durationMinutes: meeting.durationMinutes,
          platform: meeting.platform,
          location: meeting.location || undefined,
          hostName,
          minutesUntilMeeting,
        });
      }

      // Also send reminder to the meeting owner
      if (meeting.user?.email) {
        await sendMeetingReminderToClient({
          meetingId: meeting.id,
          clientEmail: meeting.user.email,
          clientName: meeting.user.name || 'User',
          meetingTitle: meeting.title,
          meetingUrl: meeting.meetingUrl || undefined,
          startDateTime: meetingStart,
          endDateTime: meetingEnd,
          timezone: meeting.timezone,
          durationMinutes: meeting.durationMinutes,
          platform: meeting.platform,
          location: meeting.location || undefined,
          hostName,
          minutesUntilMeeting,
        });
      }

      // Send in-app notification to user
      await db.notification.create({
        data: {
          userId: meeting.userId,
          type: 'meeting_reminder',
          title: 'Meeting Starting Soon',
          message: `"${meeting.title}" starts at ${meetingStart.toLocaleTimeString()}`,
          actionUrl: meeting.meetingUrl || undefined,
          deliveredVia: 'in_app',
          metadata: JSON.stringify({ meetingId: meeting.id, meetingUrl: meeting.meetingUrl }),
        },
      });

      // Mark reminder as sent in DB
      const existingReminders = reminders.find((r) => r.minutesBefore === 60)
        ? reminders.map((r) => r.minutesBefore === 60 ? { ...r, sent: true } : r)
        : [...reminders, { minutesBefore: 60, type: 'email', sent: true }];

      await db.meeting.update({
        where: { id: meeting.id },
        data: { reminders: JSON.stringify(existingReminders) },
      });

      processed++;
    } catch (error) {
      console.error(`[MeetingOrchestration] Failed to process reminder for meeting ${meeting.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}
