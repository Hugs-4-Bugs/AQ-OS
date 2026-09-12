// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Intelligence Service
// Comprehensive Google Calendar integration with smart scheduling,
// conflict detection, timezone management, and AI-powered recommendations.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Date range for calendar queries */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Calendar event from Google Calendar */
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string; date?: string };
  end: { dateTime: string; timeZone?: string; date?: string };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  hangoutLink?: string;
  conferenceData?: unknown;
  status?: string;
  isRecurring?: boolean;
  creator?: { email?: string; displayName?: string };
  visibility?: string;
}

/** Busy slot information */
export interface BusySlot {
  start: Date;
  end: Date;
  summary?: string;
  isAllDay?: boolean;
}

/** Free time slot */
export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

/** Conflict detection result */
export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    eventId: string;
    summary: string;
    start: Date;
    end: Date;
    overlapMinutes: number;
  }>;
  bufferViolations: Array<{
    eventId: string;
    summary: string;
    start: Date;
    end: Date;
    bufferMinutes: number;
  }>;
}

/** Timezone overlap window */
export interface TimezoneOverlapWindow {
  startUtc: Date;
  endUtc: Date;
  startInUserTz: string;
  endInUserTz: string;
  startInLeadTz: string;
  endInLeadTz: string;
  overlapMinutes: number;
}

/** Smart recommendation */
export interface SmartRecommendation {
  start: Date;
  end: Date;
  score: number;
  reason: string;
  timezone: string;
  conflictFree: boolean;
  bufferRespected: boolean;
  withinWorkingHours: boolean;
  withinOverlapWindow: boolean;
}

/** Calendar connection status */
export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  lastSyncAt?: Date;
  status?: string;
  error?: string;
}

/** Calendar intelligence query result */
export interface CalendarEventsResult {
  events: CalendarEvent[];
  syncedFromGoogle: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[CalendarIntelligence]';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';
const DEFAULT_BUFFER_MINUTES = 15;
const DEFAULT_WORKING_HOURS_START = '09:00';
const DEFAULT_WORKING_HOURS_END = '18:00';
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

// ═══════════════════════════════════════════════════════════════════
// 1. GET CALENDAR EVENTS — Fetch events from Google Calendar
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch calendar events from Google Calendar for a user within a date range.
 * Handles token refresh automatically via getValidCalendarAccessToken.
 *
 * @param userId - The user whose calendar to query
 * @param dateRange - The date range to fetch events for
 * @returns Calendar events and sync status
 */
export async function getCalendarEvents(
  userId: string,
  dateRange: DateRange
): Promise<CalendarEventsResult> {
  console.log(`${LOG_PREFIX} Fetching calendar events for user ${userId}`);

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const params = new URLSearchParams({
      timeMin: dateRange.start.toISOString(),
      timeMax: dateRange.end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const res = await fetch(`${GOOGLE_CALENDAR_API}/events?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`${LOG_PREFIX} Google Calendar events fetch failed:`, errorBody);
      return {
        events: [],
        syncedFromGoogle: false,
        error: `Failed to fetch calendar events: ${res.status}`,
      };
    }

    const data = (await res.json()) as { items?: CalendarEvent[] };
    const events = data.items || [];

    // Update last sync timestamp
    await db.googleCalendarToken.updateMany({
      where: { userId, status: 'active' },
      data: { lastSyncAt: new Date() },
    }).catch(() => {});

    console.log(`${LOG_PREFIX} Fetched ${events.length} calendar events for user ${userId}`);
    return { events, syncedFromGoogle: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Error fetching calendar events:`, message);
    return {
      events: [],
      syncedFromGoogle: false,
      error: message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. GET BUSY SLOTS — Get busy/free detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Get busy time slots from Google Calendar using the freebusy query API.
 * Also includes local meeting records from the database.
 *
 * @param userId - The user whose calendar to check
 * @param dateRange - The date range to check
 * @returns Array of busy slots with optional summary
 */
export async function getBusySlots(
  userId: string,
  dateRange: DateRange
): Promise<BusySlot[]> {
  console.log(`${LOG_PREFIX} Getting busy slots for user ${userId}`);

  const busySlots: BusySlot[] = [];

  try {
    // 1. Get Google Calendar busy slots via freebusy API
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
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
    });

    if (res.ok) {
      const data = (await res.json()) as {
        calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
      };

      const googleBusy = (data.calendars?.primary?.busy || []).map((slot) => ({
        start: new Date(slot.start),
        end: new Date(slot.end),
      }));

      busySlots.push(...googleBusy);
    } else {
      console.warn(`${LOG_PREFIX} Google freebusy query failed, falling back to events API`);
      // Fallback: fetch events and derive busy slots
      const eventsResult = await getCalendarEvents(userId, dateRange);
      if (eventsResult.syncedFromGoogle) {
        for (const event of eventsResult.events) {
          if (event.start?.dateTime && event.end?.dateTime) {
            busySlots.push({
              start: new Date(event.start.dateTime),
              end: new Date(event.end.dateTime),
              summary: event.summary,
            });
          } else if (event.start?.date && event.end?.date) {
            // All-day event
            busySlots.push({
              start: new Date(event.start.date),
              end: new Date(event.end.date),
              summary: event.summary,
              isAllDay: true,
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Google Calendar freebusy failed:`, error instanceof Error ? error.message : 'Unknown');
  }

  // 2. Get local meeting records as additional busy slots
  try {
    const localMeetings = await db.meeting.findMany({
      where: {
        userId,
        status: { in: ['scheduled', 'confirmed', 'rescheduled'] },
        startDateTime: { gte: dateRange.start },
        endDateTime: { lte: dateRange.end },
      },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
      },
    });

    for (const meeting of localMeetings) {
      // Check if this slot is already covered by Google Calendar
      const alreadyCovered = busySlots.some(
        (slot) => Math.abs(slot.start.getTime() - meeting.startDateTime.getTime()) < 60000
      );

      if (!alreadyCovered) {
        busySlots.push({
          start: meeting.startDateTime,
          end: meeting.endDateTime,
          summary: meeting.title,
        });
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to fetch local meeting records:`, error);
  }

  // Sort by start time
  busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

  console.log(`${LOG_PREFIX} Found ${busySlots.length} busy slots for user ${userId}`);
  return busySlots;
}

// ═══════════════════════════════════════════════════════════════════
// 3. DETECT CONFLICTS — Conflict detection for new events
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect scheduling conflicts for a proposed meeting time.
 * Checks Google Calendar events, local meetings, and buffer time violations.
 *
 * @param userId - The user whose calendar to check
 * @param newEventStart - Proposed start time
 * @param newEventEnd - Proposed end time
 * @param excludeEventId - Optional event ID to exclude (for rescheduling)
 * @returns Conflict detection result with overlaps and buffer violations
 */
export async function detectConflicts(
  userId: string,
  newEventStart: Date,
  newEventEnd: Date,
  excludeEventId?: string
): Promise<ConflictResult> {
  console.log(`${LOG_PREFIX} Detecting conflicts for user ${userId}`);

  const result: ConflictResult = {
    hasConflict: false,
    conflicts: [],
    bufferViolations: [],
  };

  // Get user settings for buffer time
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { meetingBufferMinutes: true },
  });
  const bufferMinutes = settings?.meetingBufferMinutes || DEFAULT_BUFFER_MINUTES;

  // Expand the query window by buffer time on both sides
  const queryStart = new Date(newEventStart.getTime() - bufferMinutes * 60 * 1000);
  const queryEnd = new Date(newEventEnd.getTime() + bufferMinutes * 60 * 1000);

  // Get busy slots in the expanded window
  const busySlots = await getBusySlots(userId, { start: queryStart, end: queryEnd });

  // Check each busy slot for overlap
  for (const slot of busySlots) {
    if (slot.isAllDay) continue; // Skip all-day events for conflict detection

    const overlapStart = new Date(Math.max(newEventStart.getTime(), slot.start.getTime()));
    const overlapEnd = new Date(Math.min(newEventEnd.getTime(), slot.end.getTime()));
    const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;

    if (overlapMinutes > 0) {
      result.hasConflict = true;
      result.conflicts.push({
        eventId: '',
        summary: slot.summary || 'Busy',
        start: slot.start,
        end: slot.end,
        overlapMinutes: Math.round(overlapMinutes),
      });
    }

    // Check buffer violations (meeting too close to another)
    const bufferBefore = (newEventStart.getTime() - slot.end.getTime()) / 60000;
    const bufferAfter = (slot.start.getTime() - newEventEnd.getTime()) / 60000;

    if (bufferBefore > 0 && bufferBefore < bufferMinutes) {
      result.bufferViolations.push({
        eventId: '',
        summary: slot.summary || 'Busy',
        start: slot.start,
        end: slot.end,
        bufferMinutes: Math.round(bufferBefore),
      });
    } else if (bufferAfter > 0 && bufferAfter < bufferMinutes) {
      result.bufferViolations.push({
        eventId: '',
        summary: slot.summary || 'Busy',
        start: slot.start,
        end: slot.end,
        bufferMinutes: Math.round(bufferAfter),
      });
    }
  }

  // Also check local DB meetings (for events not yet synced to Google Calendar)
  const localMeetings = await db.meeting.findMany({
    where: {
      userId,
      status: { in: ['scheduled', 'confirmed', 'rescheduled'] },
      startDateTime: { lte: queryEnd },
      endDateTime: { gte: queryStart },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    select: {
      id: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
    },
  });

  for (const meeting of localMeetings) {
    const overlapStart = new Date(Math.max(newEventStart.getTime(), meeting.startDateTime.getTime()));
    const overlapEnd = new Date(Math.min(newEventEnd.getTime(), meeting.endDateTime.getTime()));
    const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;

    if (overlapMinutes > 0) {
      // Check if this conflict is already detected from Google Calendar
      const alreadyDetected = result.conflicts.some(
        (c) => Math.abs(c.start.getTime() - meeting.startDateTime.getTime()) < 60000
      );

      if (!alreadyDetected) {
        result.hasConflict = true;
        result.conflicts.push({
          eventId: meeting.id,
          summary: meeting.title,
          start: meeting.startDateTime,
          end: meeting.endDateTime,
          overlapMinutes: Math.round(overlapMinutes),
        });
      }
    }
  }

  console.log(
    `${LOG_PREFIX} Conflict detection complete: ${result.conflicts.length} conflicts, ${result.bufferViolations.length} buffer violations`
  );

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 4. CONVERT TIMEZONE — Timezone conversion utility
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a date from one timezone to another.
 * Uses Intl.DateTimeFormat for accurate timezone conversion.
 *
 * @param date - The date to convert
 * @param fromTz - Source timezone (IANA format, e.g., 'America/New_York')
 * @param toTz - Target timezone (IANA format, e.g., 'Asia/Kolkata')
 * @returns The converted date
 */
export function convertTimezone(date: Date, fromTz: string, toTz: string): Date {
  if (fromTz === toTz) return date;

  try {
    // Get the date components in the source timezone
    const sourceFormatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: fromTz,
    });

    // Get the date components in the target timezone
    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: toTz,
    });

    // Calculate the offset difference
    const sourceParts = sourceFormatter.formatToParts(date);
    const targetParts = targetFormatter.formatToParts(date);

    const getSourceValue = (type: string) => {
      const part = sourceParts.find((p) => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };

    const getTargetValue = (type: string) => {
      const part = targetParts.find((p) => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };

    // Build a date in the source timezone interpretation
    const sourceDate = new Date(
      getSourceValue('year'),
      getSourceValue('month') - 1,
      getSourceValue('day'),
      getSourceValue('hour') === 24 ? 0 : getSourceValue('hour'),
      getSourceValue('minute'),
      getSourceValue('second')
    );

    // Build a date in the target timezone interpretation
    const targetDate = new Date(
      getTargetValue('year'),
      getTargetValue('month') - 1,
      getTargetValue('day'),
      getTargetValue('hour') === 24 ? 0 : getTargetValue('hour'),
      getTargetValue('minute'),
      getTargetValue('second')
    );

    // The offset difference is the difference between the two local interpretations
    const offsetDiff = targetDate.getTime() - sourceDate.getTime();

    return new Date(date.getTime() + offsetDiff);
  } catch (error) {
    console.error(`${LOG_PREFIX} Timezone conversion error:`, error);
    return date; // Return original date on error
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. FIND OVERLAP TIME — Find timezone overlap windows
// ═══════════════════════════════════════════════════════════════════

/**
 * Find overlapping working hours between two timezones for a given date.
 * Useful for scheduling cross-timezone meetings.
 *
 * @param userTz - User's timezone (IANA format)
 * @param leadTz - Lead's timezone (IANA format)
 * @param date - The date to check (uses the date portion only)
 * @returns Array of overlap windows
 */
export function findOverlapTime(
  userTz: string,
  leadTz: string,
  date: Date
): TimezoneOverlapWindow[] {
  console.log(`${LOG_PREFIX} Finding overlap time between ${userTz} and ${leadTz}`);

  const overlapWindows: TimezoneOverlapWindow[] = [];

  if (userTz === leadTz) {
    // Same timezone — the entire working day is the overlap
    const dayStart = new Date(date);
    dayStart.setHours(9, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(18, 0, 0, 0);

    const formatInTz = (d: Date, tz: string) => {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: tz,
        day: '2-digit',
        month: 'short',
      }).format(d);
    };

    overlapWindows.push({
      startUtc: dayStart,
      endUtc: dayEnd,
      startInUserTz: formatInTz(dayStart, userTz),
      endInUserTz: formatInTz(dayEnd, userTz),
      startInLeadTz: formatInTz(dayStart, leadTz),
      endInLeadTz: formatInTz(dayEnd, leadTz),
      overlapMinutes: 540, // 9 hours
    });

    return overlapWindows;
  }

  // For different timezones, check each hour of the day for overlapping working hours
  const workingStart = 9; // 9:00 AM
  const workingEnd = 18; // 6:00 PM

  const formatInTz = (d: Date, tz: string) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
      day: '2-digit',
      month: 'short',
    }).format(d);
  };

  const getHourInTz = (d: Date, tz: string): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    return parseInt(formatter.format(d), 10);
  };

  // Iterate through each hour of the day in UTC
  let currentOverlapStart: Date | null = null;

  for (let utcHour = 0; utcHour < 24; utcHour++) {
    const testDate = new Date(date);
    testDate.setUTCHours(utcHour, 0, 0, 0);

    const userHour = getHourInTz(testDate, userTz);
    const leadHour = getHourInTz(testDate, leadTz);

    const userInWorkingHours = userHour >= workingStart && userHour < workingEnd;
    const leadInWorkingHours = leadHour >= workingStart && leadHour < workingEnd;

    if (userInWorkingHours && leadInWorkingHours) {
      if (!currentOverlapStart) {
        currentOverlapStart = new Date(testDate);
      }
    } else {
      if (currentOverlapStart) {
        const overlapEnd = new Date(testDate);
        overlapWindows.push({
          startUtc: currentOverlapStart,
          endUtc: overlapEnd,
          startInUserTz: formatInTz(currentOverlapStart, userTz),
          endInUserTz: formatInTz(overlapEnd, userTz),
          startInLeadTz: formatInTz(currentOverlapStart, leadTz),
          endInLeadTz: formatInTz(overlapEnd, leadTz),
          overlapMinutes: Math.round((overlapEnd.getTime() - currentOverlapStart.getTime()) / 60000),
        });
        currentOverlapStart = null;
      }
    }
  }

  // Close any open overlap at end of day
  if (currentOverlapStart) {
    const overlapEnd = new Date(date);
    overlapEnd.setUTCHours(23, 59, 0, 0);
    overlapWindows.push({
      startUtc: currentOverlapStart,
      endUtc: overlapEnd,
      startInUserTz: formatInTz(currentOverlapStart, userTz),
      endInUserTz: formatInTz(overlapEnd, userTz),
      startInLeadTz: formatInTz(currentOverlapStart, leadTz),
      endInLeadTz: formatInTz(overlapEnd, leadTz),
      overlapMinutes: Math.round((overlapEnd.getTime() - currentOverlapStart.getTime()) / 60000),
    });
  }

  console.log(`${LOG_PREFIX} Found ${overlapWindows.length} overlap windows`);
  return overlapWindows;
}

// ═══════════════════════════════════════════════════════════════════
// 6. GET SMART RECOMMENDATIONS — AI-powered meeting time recommendations
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate smart meeting time recommendations based on:
 * - Calendar availability (no conflicts)
 * - Buffer time preferences
 * - Working hours configuration
 * - Timezone overlap with the lead
 * - Past meeting patterns (time preferences)
 *
 * @param userId - The user whose calendar to analyze
 * @param leadId - Optional lead ID for timezone overlap
 * @param durationMinutes - Meeting duration in minutes (default 30)
 * @returns Array of recommended time slots with scores
 */
export async function getSmartRecommendations(
  userId: string,
  leadId?: string,
  durationMinutes: number = 30
): Promise<SmartRecommendation[]> {
  console.log(`${LOG_PREFIX} Getting smart recommendations for user ${userId}`);

  try {
    // 1. Get user settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: {
        meetingWorkingHoursStart: true,
        meetingWorkingHoursEnd: true,
        meetingWorkingDays: true,
        meetingTimezone: true,
        meetingBufferMinutes: true,
      },
    });

    const timezone = settings?.meetingTimezone || 'UTC';
    const workingStart = settings?.meetingWorkingHoursStart || DEFAULT_WORKING_HOURS_START;
    const workingEnd = settings?.meetingWorkingHoursEnd || DEFAULT_WORKING_HOURS_END;
    const bufferMinutes = settings?.meetingBufferMinutes || DEFAULT_BUFFER_MINUTES;

    let workingDays: number[];
    try {
      workingDays = settings?.meetingWorkingDays
        ? JSON.parse(settings.meetingWorkingDays)
        : DEFAULT_WORKING_DAYS;
    } catch {
      workingDays = DEFAULT_WORKING_DAYS;
    }

    // 2. Get lead timezone for overlap detection
    let leadTz: string | null = null;
    if (leadId) {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { country: true },
      });
      if (lead?.country) {
        // Map common countries to timezones
        const countryToTz: Record<string, string> = {
          'India': 'Asia/Kolkata',
          'United States': 'America/New_York',
          'United Kingdom': 'Europe/London',
          'Australia': 'Australia/Sydney',
          'Canada': 'America/Toronto',
          'Germany': 'Europe/Berlin',
          'France': 'Europe/Paris',
          'Japan': 'Asia/Tokyo',
          'Singapore': 'Asia/Singapore',
          'UAE': 'Asia/Dubai',
        };
        leadTz = countryToTz[lead.country] || null;
      }
    }

    // 3. Get busy slots for the next 7 days
    const now = new Date();
    const searchEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const busySlots = await getBusySlots(userId, { start: now, end: searchEnd });

    // 4. Generate candidate time slots within working hours
    const recommendations: SmartRecommendation[] = [];
    const [whStart, whStartMin] = workingStart.split(':').map(Number);
    const [whEnd, whEndMin] = workingEnd.split(':').map(Number);
    const workingStartMinutes = (whStart || 9) * 60 + (whStartMin || 0);
    const workingEndMinutes = (whEnd || 18) * 60 + (whEndMin || 0);

    // Iterate through next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const candidateDate = new Date(now);
      candidateDate.setDate(candidateDate.getDate() + dayOffset);

      // Check if this is a working day
      const dayOfWeek = candidateDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday=0 to 7
      if (!workingDays.includes(adjustedDay)) continue;

      // Generate 30-minute slots within working hours
      for (let slotMinutes = workingStartMinutes; slotMinutes + durationMinutes <= workingEndMinutes; slotMinutes += 30) {
        const slotStart = new Date(candidateDate);
        slotStart.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);

        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

        // Skip past slots
        if (slotStart.getTime() < now.getTime() + 30 * 60 * 1000) continue; // At least 30 min from now

        // Check for conflicts
        let conflictFree = true;
        for (const busy of busySlots) {
          if (busy.isAllDay) continue;
          const overlapStart = Math.max(slotStart.getTime(), busy.start.getTime());
          const overlapEnd = Math.min(slotEnd.getTime(), busy.end.getTime());
          if (overlapEnd > overlapStart) {
            conflictFree = false;
            break;
          }
        }

        // Check buffer violations
        let bufferRespected = true;
        for (const busy of busySlots) {
          const gapBefore = (slotStart.getTime() - busy.end.getTime()) / 60000;
          const gapAfter = (busy.start.getTime() - slotEnd.getTime()) / 60000;
          if ((gapBefore > 0 && gapBefore < bufferMinutes) || (gapAfter > 0 && gapAfter < bufferMinutes)) {
            bufferRespected = false;
            break;
          }
        }

        // Check timezone overlap
        let withinOverlapWindow = true;
        if (leadTz && leadTz !== timezone) {
          const overlapWindows = findOverlapTime(timezone, leadTz, slotStart);
          withinOverlapWindow = overlapWindows.some(
            (w) => slotStart.getTime() >= w.startUtc.getTime() && slotEnd.getTime() <= w.endUtc.getTime()
          );
        }

        // Score the slot
        let score = 50; // Base score
        if (conflictFree) score += 20;
        if (bufferRespected) score += 10;
        if (withinOverlapWindow) score += 15;

        // Prefer morning slots (9-12) slightly
        const hour = slotStart.getHours();
        if (hour >= 9 && hour < 12) score += 3;
        else if (hour >= 14 && hour < 16) score += 2; // After lunch is also good

        // Prefer sooner rather than later
        const daysFromNow = (slotStart.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
        score -= Math.floor(daysFromNow); // Slight penalty for further days

        // Skip slots with conflicts (unless they're just buffer violations)
        if (!conflictFree) continue;

        recommendations.push({
          start: slotStart,
          end: slotEnd,
          score,
          reason: buildRecommendationReason(conflictFree, bufferRespected, withinOverlapWindow, hour),
          timezone,
          conflictFree,
          bufferRespected,
          withinWorkingHours: true,
          withinOverlapWindow,
        });
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    // Return top 10 recommendations
    const topRecommendations = recommendations.slice(0, 10);

    console.log(`${LOG_PREFIX} Generated ${topRecommendations.length} smart recommendations`);
    return topRecommendations;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error generating smart recommendations:`, error);
    return [];
  }
}

/**
 * Build a human-readable reason for a recommendation.
 */
function buildRecommendationReason(
  conflictFree: boolean,
  bufferRespected: boolean,
  withinOverlap: boolean,
  hour: number
): string {
  const reasons: string[] = [];

  if (conflictFree) reasons.push('No conflicts');
  else reasons.push('Has scheduling conflicts');

  if (bufferRespected) reasons.push('buffer time respected');
  else reasons.push('close to another meeting');

  if (withinOverlap) reasons.push('within timezone overlap window');

  if (hour >= 9 && hour < 12) reasons.push('morning slot preferred');
  else if (hour >= 14 && hour < 16) reasons.push('afternoon slot');

  return reasons.join(', ');
}

// ═══════════════════════════════════════════════════════════════════
// 7. CHECK CALENDAR CONNECTION — Check if Google Calendar is connected
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a user has an active Google Calendar connection.
 *
 * @param userId - The user to check
 * @returns Calendar connection status
 */
export async function checkCalendarConnection(
  userId: string
): Promise<CalendarConnectionStatus> {
  console.log(`${LOG_PREFIX} Checking calendar connection for user ${userId}`);

  try {
    const token = await db.googleCalendarToken.findFirst({
      where: { userId, status: 'active' },
      select: {
        calendarEmail: true,
        lastSyncAt: true,
        status: true,
        tokenExpiry: true,
      },
    });

    if (!token) {
      return {
        connected: false,
        error: 'Google Calendar not connected. Please connect your Google Calendar in settings.',
      };
    }

    // Check if token is expired (with 5 minute buffer)
    const isExpired = token.tokenExpiry
      ? new Date(token.tokenExpiry.getTime() - 5 * 60 * 1000) < new Date()
      : true;

    if (isExpired) {
      // Try to refresh the token
      try {
        await getValidCalendarAccessToken(userId);
        return {
          connected: true,
          email: token.calendarEmail,
          lastSyncAt: token.lastSyncAt || undefined,
          status: token.status,
        };
      } catch {
        return {
          connected: false,
          email: token.calendarEmail,
          lastSyncAt: token.lastSyncAt || undefined,
          status: 'expired',
          error: 'Calendar token expired. Please reconnect your Google Calendar.',
        };
      }
    }

    return {
      connected: true,
      email: token.calendarEmail,
      lastSyncAt: token.lastSyncAt || undefined,
      status: token.status,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking calendar connection:`, error);
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Failed to check calendar connection',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. GET UPCOMING MEETINGS FROM CALENDAR — Sync upcoming from Google Calendar
// ═══════════════════════════════════════════════════════════════════

/**
 * Sync upcoming meetings from Google Calendar into the local database.
 * Creates Meeting records for events that don't already exist locally.
 *
 * @param userId - The user whose calendar to sync
 * @param days - Number of days ahead to sync (default 7)
 * @returns Array of synced meeting IDs
 */
export async function getUpcomingMeetingsFromCalendar(
  userId: string,
  days: number = 7
): Promise<{ synced: string[]; created: string[]; errors: string[] }> {
  console.log(`${LOG_PREFIX} Syncing upcoming meetings from Google Calendar for user ${userId}`);

  const result = { synced: [] as string[], created: [] as string[], errors: [] as string[] };

  try {
    const now = new Date();
    const searchEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Fetch events from Google Calendar
    const { events, syncedFromGoogle, error: fetchError } = await getCalendarEvents(userId, {
      start: now,
      end: searchEnd,
    });

    if (!syncedFromGoogle) {
      result.errors.push(fetchError || 'Failed to fetch calendar events');
      return result;
    }

    // Get user settings for timezone and platform
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { meetingTimezone: true, meetingPlatform: true },
    });

    const timezone = settings?.meetingTimezone || 'UTC';

    // Get existing meetings with calendar event IDs
    const existingCalendarIds = await db.meeting.findMany({
      where: {
        userId,
        calendarEventId: { not: null },
      },
      select: { calendarEventId: true },
    });

    const existingIdSet = new Set(existingCalendarIds.map((m) => m.calendarEventId));

    // Process each event
    for (const event of events) {
      if (!event.start?.dateTime || !event.end?.dateTime) continue;
      if (event.status === 'cancelled') continue;

      const eventId = event.id;

      if (existingIdSet.has(eventId)) {
        result.synced.push(eventId);
        continue;
      }

      // Create a new Meeting record for this calendar event
      try {
        const startDateTime = new Date(event.start.dateTime);
        const endDateTime = new Date(event.end.dateTime);
        const durationMinutes = Math.round(
          (endDateTime.getTime() - startDateTime.getTime()) / 60000
        );

        const meeting = await db.meeting.create({
          data: {
            userId,
            title: event.summary || 'Imported from Google Calendar',
            description: event.description || null,
            meetingType: event.hangoutLink ? 'video' : 'in-person',
            platform: event.hangoutLink ? 'google_meet' : 'custom',
            meetingUrl: event.hangoutLink || null,
            calendarEventId: eventId,
            status: 'scheduled',
            startDateTime,
            endDateTime,
            durationMinutes,
            timezone,
            attendees: JSON.stringify(
              (event.attendees || []).map((a) => ({
                email: a.email,
                name: a.displayName,
                status: a.responseStatus || 'pending',
              }))
            ),
            location: event.location || null,
            createdBy: 'user',
            approvalStatus: 'approved',
            conferenceData: event.conferenceData
              ? JSON.stringify(event.conferenceData)
              : null,
          },
        });

        result.created.push(meeting.id);
      } catch (createError) {
        console.warn(
          `${LOG_PREFIX} Failed to create meeting for calendar event ${eventId}:`,
          createError
        );
        result.errors.push(`Failed to sync event ${eventId}`);
      }
    }

    // Update last sync timestamp
    await db.googleCalendarToken.updateMany({
      where: { userId, status: 'active' },
      data: { lastSyncAt: new Date() },
    }).catch(() => {});

    console.log(
      `${LOG_PREFIX} Calendar sync complete: ${result.synced.length} synced, ${result.created.length} created, ${result.errors.length} errors`
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error syncing upcoming meetings:`, error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
  }

  return result;
}
