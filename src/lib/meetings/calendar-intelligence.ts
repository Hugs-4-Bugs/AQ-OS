// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Intelligence
// Free/busy lookup, availability search, conflict detection,
// AI slot recommendations, and automatic rescheduling
//
// This module provides intelligent calendar analysis on top of
// the raw Google Calendar API, including:
// - Free/busy analysis using Google's freeBusy endpoint
// - Smart slot recommendations using AI
// - Conflict detection and resolution
// - Timezone-aware scheduling
// - Automatic rescheduling suggestions
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ===== TYPES =====

/** Calendar event from Google Calendar */
export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  timezone: string;
  isAllDay: boolean;
  attendees?: CalendarAttendee[];
  status?: string;
  hangoutLink?: string;
}

/** Calendar attendee */
export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus: 'needsAction' | 'tentative' | 'accepted' | 'declined';
}

/** Free/busy interval */
export interface FreeBusyInterval {
  start: Date;
  end: Date;
  busy: boolean;
  eventSummary?: string; // Name of the conflicting event (if busy)
}

/** Available time slot */
export interface AvailableSlot {
  start: Date;
  end: Date;
  timezone: string;
  durationMinutes: number;
  score: number; // 0-1, AI-calculated quality score
  reason: string; // AI explanation of why this slot is good
  isPreferredTime: boolean; // Within user's preferred meeting hours
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  hourOfDay: number; // 0-23
}

/** Slot recommendation request */
export interface SlotRecommendationRequest {
  userId: string;
  durationMinutes: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  timezone: string;
  preferredHours?: { start: number; end: number }; // e.g., { start: 9, end: 17 }
  preferredDays?: number[]; // e.g., [1, 2, 3, 4, 5] for weekdays
  excludeSlots?: { start: Date; end: Date }[]; // Already-proposed slots
  leadTimezone?: string; // For cross-timezone scheduling
  maxResults?: number;
}

/** Conflict detection result */
export interface ConflictResult {
  hasConflict: boolean;
  conflicts: ConflictInfo[];
  suggestedResolution?: string;
}

/** Conflict information */
export interface ConflictInfo {
  existingEvent: CalendarEvent;
  proposedStart: Date;
  proposedEnd: Date;
  overlapMinutes: number;
  severity: 'hard' | 'soft'; // hard = direct overlap, soft = back-to-back
}

/** Rescheduling suggestion */
export interface ReschedulingSuggestion {
  originalSlot: { start: Date; end: Date };
  suggestedSlots: AvailableSlot[];
  reason: string;
  automatic: boolean; // Whether this was auto-triggered
}

// ===== CONSTANTS =====

const LOG_PREFIX = '[CalendarIntelligence]';
const DEFAULT_WORKING_HOURS_START = 9;  // 9am
const DEFAULT_WORKING_HOURS_END = 18;   // 6pm
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri
const DEFAULT_BUFFER_MINUTES = 15;
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

// ===== HELPER: GET USER TIMEZONE =====

/**
 * Get the user's stored timezone from UserSettings.
 * Falls back to server-side Intl detection.
 */
async function getUserTimezone(userId: string): Promise<string> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { meetingTimezone: true },
    });
    return settings?.meetingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
}

// ===== HELPER: GET USER WORKING HOURS =====

async function getUserWorkingHours(userId: string): Promise<{
  startHour: number;
  endHour: number;
  workingDays: number[];
  bufferMinutes: number;
}> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: {
        meetingWorkingHoursStart: true,
        meetingWorkingHoursEnd: true,
        meetingWorkingDays: true,
        meetingBufferMinutes: true,
      },
    });

    let workingDays = DEFAULT_WORKING_DAYS;
    if (settings?.meetingWorkingDays) {
      try {
        workingDays = JSON.parse(settings.meetingWorkingDays);
      } catch {
        workingDays = DEFAULT_WORKING_DAYS;
      }
    }

    return {
      startHour: settings?.meetingWorkingHoursStart
        ? parseInt(settings.meetingWorkingHoursStart.split(':')[0], 10) || DEFAULT_WORKING_HOURS_START
        : DEFAULT_WORKING_HOURS_START,
      endHour: settings?.meetingWorkingHoursEnd
        ? parseInt(settings.meetingWorkingHoursEnd.split(':')[0], 10) || DEFAULT_WORKING_HOURS_END
        : DEFAULT_WORKING_HOURS_END,
      workingDays,
      bufferMinutes: settings?.meetingBufferMinutes || DEFAULT_BUFFER_MINUTES,
    };
  } catch {
    return {
      startHour: DEFAULT_WORKING_HOURS_START,
      endHour: DEFAULT_WORKING_HOURS_END,
      workingDays: DEFAULT_WORKING_DAYS,
      bufferMinutes: DEFAULT_BUFFER_MINUTES,
    };
  }
}

// ===== FREE/BUSY FUNCTIONS =====

/**
 * Get free/busy information for a user's calendar.
 * Uses Google Calendar's freeBusy query endpoint.
 *
 * @param userId - The user whose calendar to query
 * @param timeMin - Start of query window
 * @param timeMax - End of query window
 * @returns Array of busy intervals from Google Calendar
 */
export async function getFreeBusy(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<FreeBusyInterval[]> {
  console.log(`${LOG_PREFIX} getFreeBusy called for user ${userId}`);

  const busyIntervals: FreeBusyInterval[] = [];

  try {
    // 1. Get valid calendar access token
    const { accessToken } = await getValidCalendarAccessToken(userId);

    // 2. Call Google Calendar freeBusy API
    const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Google Calendar freeBusy API failed:`, errorText);

      // Fallback: try events API instead
      return await getFreeBusyFromEvents(userId, timeMin, timeMax);
    }

    const data = await response.json() as {
      calendars?: Record<string, {
        busy?: Array<{ start: string; end: string }>;
        errors?: Array<{ domain: string; reason: string }>;
      }>;
    };

    // 3. Parse the busy intervals from the response
    const primaryCal = data.calendars?.primary;
    if (primaryCal?.errors) {
      console.error(`${LOG_PREFIX} Google Calendar freeBusy errors:`, primaryCal.errors);
      return await getFreeBusyFromEvents(userId, timeMin, timeMax);
    }

    if (primaryCal?.busy) {
      for (const slot of primaryCal.busy) {
        busyIntervals.push({
          start: new Date(slot.start),
          end: new Date(slot.end),
          busy: true,
        });
      }
    }

    console.log(`${LOG_PREFIX} getFreeBusy found ${busyIntervals.length} busy intervals`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} getFreeBusy API call failed, falling back to events:`, error instanceof Error ? error.message : 'Unknown');
    return await getFreeBusyFromEvents(userId, timeMin, timeMax);
  }

  // Also include local meeting records that might not be synced yet
  try {
    const localMeetings = await db.meeting.findMany({
      where: {
        userId,
        status: { in: ['scheduled', 'confirmed', 'rescheduled'] },
        startDateTime: { gte: timeMin, lte: timeMax },
        endDateTime: { gte: timeMin, lte: timeMax },
      },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        calendarEventId: true,
      },
    });

    for (const meeting of localMeetings) {
      // Check if this slot is already covered by Google Calendar busy data
      const alreadyCovered = busyIntervals.some(
        (interval) => Math.abs(interval.start.getTime() - meeting.startDateTime.getTime()) < 60000
      );

      if (!alreadyCovered) {
        busyIntervals.push({
          start: meeting.startDateTime,
          end: meeting.endDateTime,
          busy: true,
          eventSummary: meeting.title,
        });
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to fetch local meeting records:`, error);
  }

  // Sort by start time
  busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  return busyIntervals;
}

/**
 * Fallback: Derive busy intervals from Google Calendar events API
 * when the freeBusy endpoint fails.
 */
async function getFreeBusyFromEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<FreeBusyInterval[]> {
  console.log(`${LOG_PREFIX} Falling back to events API for free/busy data`);

  const intervals: FreeBusyInterval[] = [];

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const response = await fetch(`${GOOGLE_CALENDAR_API}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`${LOG_PREFIX} Events API fallback also failed`);
      return intervals;
    }

    const data = await response.json() as { items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
    }> };

    for (const event of data.items || []) {
      if (event.status === 'cancelled') continue;

      if (event.start?.dateTime && event.end?.dateTime) {
        intervals.push({
          start: new Date(event.start.dateTime),
          end: new Date(event.end.dateTime),
          busy: true,
          eventSummary: event.summary,
        });
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Events API fallback failed:`, error instanceof Error ? error.message : 'Unknown');
  }

  return intervals;
}

/**
 * Get all calendar events for a user in a time range.
 * Returns both confirmed and tentative events.
 */
export async function getCalendarEvents(
  userId: string,
  startTime: Date,
  endTime: Date,
  timezone: string
): Promise<CalendarEvent[]> {
  console.log(`${LOG_PREFIX} getCalendarEvents for user ${userId}`);

  const events: CalendarEvent[] = [];

  try {
    const { accessToken } = await getValidCalendarAccessToken(userId);

    const params = new URLSearchParams({
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const response = await fetch(`${GOOGLE_CALENDAR_API}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`${LOG_PREFIX} Failed to fetch calendar events`);
      return events;
    }

    const data = await response.json() as { items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string; timeZone?: string };
      end?: { dateTime?: string; date?: string; timeZone?: string };
      attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
      status?: string;
      hangoutLink?: string;
    }> };

    for (const item of data.items || []) {
      if (item.status === 'cancelled') continue;

      const isAllDay = !item.start?.dateTime;
      const startStr = item.start?.dateTime || item.start?.date || '';
      const endStr = item.end?.dateTime || item.end?.date || '';

      if (!startStr || !endStr) continue;

      events.push({
        id: item.id,
        summary: item.summary || 'Untitled Event',
        start: new Date(startStr),
        end: new Date(endStr),
        timezone: item.start?.timeZone || timezone,
        isAllDay,
        attendees: item.attendees?.map((a) => ({
          email: a.email,
          name: a.displayName,
          responseStatus: (a.responseStatus as CalendarAttendee['responseStatus']) || 'needsAction',
        })),
        status: item.status,
        hangoutLink: item.hangoutLink,
      });
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} getCalendarEvents failed:`, error instanceof Error ? error.message : 'Unknown');
  }

  return events;
}

// ===== SLOT RECOMMENDATION FUNCTIONS =====

/**
 * Find available time slots for a meeting.
 * Combines free/busy data with scoring based on user preferences.
 *
 * @param userId - The user whose calendar to check
 * @param durationMinutes - Required meeting duration in minutes
 * @param preferredDates - Array of preferred dates to search
 * @returns Array of available time slots with quality scores
 */
export async function findAvailableSlots(
  userId: string,
  durationMinutes: number,
  preferredDates?: Date[]
): Promise<AvailableSlot[]> {
  console.log(`${LOG_PREFIX} findAvailableSlots for user ${userId}, duration: ${durationMinutes}min`);

  try {
    // Get user preferences
    const timezone = await getUserTimezone(userId);
    const { startHour, endHour, workingDays, bufferMinutes } = await getUserWorkingHours(userId);

    // Determine the search date range
    const now = new Date();
    let searchStart = new Date(now.getTime() + 30 * 60 * 1000); // At least 30 min from now
    let searchEnd = new Date(searchStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

    if (preferredDates && preferredDates.length > 0) {
      // Use preferred dates for the search range
      const sorted = [...preferredDates].sort((a, b) => a.getTime() - b.getTime());
      searchStart = new Date(sorted[0]);
      searchStart.setHours(0, 0, 0, 0);
      searchEnd = new Date(sorted[sorted.length - 1]);
      searchEnd.setHours(23, 59, 59, 999);
    }

    // Get free/busy data for the search window
    const busyIntervals = await getFreeBusy(userId, searchStart, searchEnd);

    // Generate candidate slots within working hours
    const availableSlots: AvailableSlot[] = [];
    const datesToSearch = preferredDates || generateDateRange(searchStart, searchEnd);

    for (const date of datesToSearch) {
      const dayOfWeek = date.getDay();

      // Convert to ISO day (1=Monday, 7=Sunday) for workingDays check
      const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      if (!workingDays.includes(isoDay)) continue;

      // Generate slots within working hours
      for (let hour = startHour; hour + Math.ceil(durationMinutes / 60) <= endHour; hour++) {
        // Generate slots at 30-minute intervals within each hour
        for (let minute = 0; minute < 60; minute += 30) {
          if (hour === endHour && minute > 0) break;
          if (hour + Math.ceil(durationMinutes / 60) > endHour && minute + durationMinutes % 60 > 0) {
            // Skip if the slot would extend past working hours
            const slotEndHour = hour + Math.floor((minute + durationMinutes) / 60);
            const slotEndMinute = (minute + durationMinutes) % 60;
            if (slotEndHour > endHour || (slotEndHour === endHour && slotEndMinute > 0)) continue;
          }

          const slotStart = new Date(date);
          slotStart.setHours(hour, minute, 0, 0);

          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

          // Skip past slots
          if (slotStart.getTime() < now.getTime() + 30 * 60 * 1000) continue;

          // Check for conflicts with busy intervals
          let hasConflict = false;
          let hasSoftConflict = false;

          for (const interval of busyIntervals) {
            const overlapStart = Math.max(slotStart.getTime(), interval.start.getTime());
            const overlapEnd = Math.min(slotEnd.getTime(), interval.end.getTime());

            if (overlapEnd > overlapStart) {
              hasConflict = true;
              break;
            }

            // Check buffer violations (soft conflict)
            const gapBefore = (slotStart.getTime() - interval.end.getTime()) / 60000;
            const gapAfter = (interval.start.getTime() - slotEnd.getTime()) / 60000;

            if ((gapBefore > 0 && gapBefore < bufferMinutes) || (gapAfter > 0 && gapAfter < bufferMinutes)) {
              hasSoftConflict = true;
            }
          }

          if (hasConflict) continue; // Skip conflicting slots

          // Score the slot
          let score = 0.5; // Base score
          const isPreferredTime = hour >= startHour && hour < endHour;

          if (isPreferredTime) score += 0.2;
          if (!hasSoftConflict) score += 0.15;

          // Prefer morning slots slightly
          if (hour >= 9 && hour < 12) score += 0.05;
          else if (hour >= 14 && hour < 16) score += 0.03;

          // Prefer sooner rather than later
          const daysFromNow = (slotStart.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
          score -= daysFromNow * 0.02;

          // Cap at 1.0
          score = Math.min(1, Math.max(0, score));

          // Build reason string
          const reasons: string[] = [];
          if (isPreferredTime) reasons.push('within preferred hours');
          if (!hasSoftConflict) reasons.push('buffer time respected');
          if (hour >= 9 && hour < 12) reasons.push('morning slot');
          else if (hour >= 14 && hour < 16) reasons.push('afternoon slot');

          availableSlots.push({
            start: slotStart,
            end: slotEnd,
            timezone,
            durationMinutes,
            score,
            reason: reasons.join(', ') || 'Available slot',
            isPreferredTime,
            dayOfWeek,
            hourOfDay: hour,
          });
        }
      }
    }

    // Sort by score (highest first)
    availableSlots.sort((a, b) => b.score - a.score);

    // Return top results (default 10)
    const maxResults = 10;
    const result = availableSlots.slice(0, maxResults);

    console.log(`${LOG_PREFIX} findAvailableSlots found ${result.length} available slots`);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} findAvailableSlots error:`, error);
    return [];
  }
}

/**
 * Helper: Generate an array of dates for the search range.
 */
function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Get AI-powered slot recommendations.
 * Uses LLM to consider context like lead timezone, meeting purpose, etc.
 *
 * Currently delegates to findAvailableSlots with additional scoring.
 * Full LLM integration can be added later.
 */
export async function getAISlotRecommendations(
  userId: string,
  leadId: string,
  durationMinutes: number,
  dateRangeStart: Date,
  dateRangeEnd: Date,
  timezone: string
): Promise<AvailableSlot[]> {
  console.log(`${LOG_PREFIX} getAISlotRecommendations for user ${userId}, lead ${leadId}`);

  try {
    // Get lead info for context
    let leadTz: string | null = null;
    if (leadId) {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { country: true },
      });
      if (lead?.country) {
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

    // Generate preferred dates from the range
    const preferredDates = generateDateRange(dateRangeStart, dateRangeEnd);

    // Get available slots
    const slots = await findAvailableSlots(userId, durationMinutes, preferredDates);

    // If we have lead timezone, boost slots that overlap with lead working hours
    if (leadTz && leadTz !== timezone) {
      for (const slot of slots) {
        const leadHour = parseInt(
          new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: leadTz }).format(slot.start),
          10
        );
        // Check if slot is within lead's working hours (9am-6pm)
        if (leadHour >= 9 && leadHour < 18) {
          slot.score = Math.min(1, slot.score + 0.1);
          slot.reason += ', within lead working hours';
        }
      }

      // Re-sort after scoring adjustment
      slots.sort((a, b) => b.score - a.score);
    }

    return slots;
  } catch (error) {
    console.error(`${LOG_PREFIX} getAISlotRecommendations error:`, error);
    return [];
  }
}

// ===== CONFLICT DETECTION =====

/**
 * Check if a proposed meeting time conflicts with existing events.
 * Uses Google Calendar freeBusy API for accurate conflict detection.
 *
 * @param userId - The user whose calendar to check
 * @param proposedStart - Proposed meeting start time
 * @param proposedEnd - Proposed meeting end time
 * @returns Boolean indicating whether there is a conflict
 */
export async function detectConflict(
  userId: string,
  proposedStart: Date,
  proposedEnd: Date
): Promise<boolean> {
  console.log(`${LOG_PREFIX} detectConflict for user ${userId}`);

  try {
    // Add buffer time around the proposed window for conflict detection
    const { bufferMinutes } = await getUserWorkingHours(userId);

    // Query a slightly larger window to catch buffer violations too
    const queryStart = new Date(proposedStart.getTime() - bufferMinutes * 60 * 1000);
    const queryEnd = new Date(proposedEnd.getTime() + bufferMinutes * 60 * 1000);

    // Get busy intervals
    const busyIntervals = await getFreeBusy(userId, queryStart, queryEnd);

    // Check each busy interval for direct overlap
    for (const interval of busyIntervals) {
      if (!interval.busy) continue;

      const overlapStart = Math.max(proposedStart.getTime(), interval.start.getTime());
      const overlapEnd = Math.min(proposedEnd.getTime(), interval.end.getTime());

      if (overlapEnd > overlapStart) {
        console.log(`${LOG_PREFIX} Conflict detected with: ${interval.eventSummary || 'busy'}`);
        return true;
      }
    }

    console.log(`${LOG_PREFIX} No conflicts detected`);
    return false;
  } catch (error) {
    console.error(`${LOG_PREFIX} detectConflict error:`, error);
    // In case of error, return false to not block scheduling
    // The Google Calendar API itself will also prevent double-booking
    return false;
  }
}

/**
 * Full conflict detection with detailed information.
 * Returns conflict details including overlap minutes and severity.
 */
export async function detectConflicts(
  userId: string,
  proposedStart: Date,
  proposedEnd: Date,
  timezone: string,
  bufferMinutes?: number
): Promise<ConflictResult> {
  console.log(`${LOG_PREFIX} detectConflicts (detailed) for user ${userId}`);

  const result: ConflictResult = {
    hasConflict: false,
    conflicts: [],
  };

  try {
    const userPrefs = await getUserWorkingHours(userId);
    const buffer = bufferMinutes ?? userPrefs.bufferMinutes;

    // Query expanded window for buffer detection
    const queryStart = new Date(proposedStart.getTime() - buffer * 60 * 1000);
    const queryEnd = new Date(proposedEnd.getTime() + buffer * 60 * 1000);

    const busyIntervals = await getFreeBusy(userId, queryStart, queryEnd);
    const events = await getCalendarEvents(userId, queryStart, queryEnd, timezone);

    // Check for direct overlaps (hard conflicts)
    for (const interval of busyIntervals) {
      if (!interval.busy) continue;

      const overlapStart = Math.max(proposedStart.getTime(), interval.start.getTime());
      const overlapEnd = Math.min(proposedEnd.getTime(), interval.end.getTime());
      const overlapMinutes = (overlapEnd - overlapStart) / 60000;

      if (overlapMinutes > 0) {
        // Find the matching event for more details
        const matchingEvent = events.find(
          (e) => Math.abs(e.start.getTime() - interval.start.getTime()) < 60000
        );

        result.hasConflict = true;
        result.conflicts.push({
          existingEvent: matchingEvent || {
            id: '',
            summary: interval.eventSummary || 'Busy',
            start: interval.start,
            end: interval.end,
            timezone,
            isAllDay: false,
          },
          proposedStart,
          proposedEnd,
          overlapMinutes: Math.round(overlapMinutes),
          severity: 'hard',
        });
      }

      // Check for buffer violations (soft conflicts)
      const gapBefore = (proposedStart.getTime() - interval.end.getTime()) / 60000;
      const gapAfter = (interval.start.getTime() - proposedEnd.getTime()) / 60000;

      if ((gapBefore > 0 && gapBefore < buffer) || (gapAfter > 0 && gapAfter < buffer)) {
        const matchingEvent = events.find(
          (e) => Math.abs(e.start.getTime() - interval.start.getTime()) < 60000
        );

        // Only add soft conflict if not already a hard conflict
        const isAlreadyHardConflict = result.conflicts.some(
          (c) => c.severity === 'hard' && c.existingEvent.id === (matchingEvent?.id || '')
        );

        if (!isAlreadyHardConflict) {
          result.conflicts.push({
            existingEvent: matchingEvent || {
              id: '',
              summary: interval.eventSummary || 'Nearby event',
              start: interval.start,
              end: interval.end,
              timezone,
              isAllDay: false,
            },
            proposedStart,
            proposedEnd,
            overlapMinutes: 0,
            severity: 'soft',
          });
        }
      }
    }

    // Suggest resolution if conflicts found
    if (result.hasConflict) {
      const hardConflicts = result.conflicts.filter((c) => c.severity === 'hard');
      if (hardConflicts.length > 0) {
        result.suggestedResolution = `Conflict with "${hardConflicts[0].existingEvent.summary}" (${hardConflicts[0].overlapMinutes}min overlap). Consider rescheduling.`;
      } else {
        const softConflicts = result.conflicts.filter((c) => c.severity === 'soft');
        result.suggestedResolution = `Close to "${softConflicts[0]?.existingEvent.summary}". Buffer time may be violated.`;
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} detectConflicts error:`, error);
  }

  return result;
}

// ===== RESCHEDULING =====

/**
 * Suggest alternative times when a conflict is detected.
 * Can be triggered automatically or manually.
 */
export async function suggestReschedule(
  userId: string,
  meetingId: string,
  conflictReason?: string
): Promise<ReschedulingSuggestion> {
  console.log(`${LOG_PREFIX} suggestReschedule for meeting ${meetingId}`);

  try {
    // Get the current meeting details
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    // Find alternative slots
    const suggestedSlots = await findAvailableSlots(
      userId,
      meeting.durationMinutes
    );

    return {
      originalSlot: { start: meeting.startDateTime, end: meeting.endDateTime },
      suggestedSlots,
      reason: conflictReason || 'Conflict detected with current time slot',
      automatic: false,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} suggestReschedule error:`, error);
    throw error;
  }
}

/**
 * Automatically reschedule a meeting if a conflict is detected.
 * Only works in autonomous mode.
 */
export async function autoReschedule(
  userId: string,
  meetingId: string
): Promise<ReschedulingSuggestion | null> {
  console.log(`${LOG_PREFIX} autoReschedule for meeting ${meetingId}`);

  try {
    // Check user's autonomy mode setting
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { meetingAutonomyMode: true },
    });

    if (settings?.meetingAutonomyMode !== 'autonomous') {
      console.log(`${LOG_PREFIX} Auto-reschedule skipped: user is not in autonomous mode`);
      return null;
    }

    // Get the current meeting
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    // Detect conflicts for the current meeting
    const hasConflict = await detectConflict(userId, meeting.startDateTime, meeting.endDateTime);

    if (!hasConflict) {
      console.log(`${LOG_PREFIX} No conflicts found, no reschedule needed`);
      return null;
    }

    // Find best alternative slot
    const suggestedSlots = await findAvailableSlots(userId, meeting.durationMinutes);

    if (suggestedSlots.length === 0) {
      console.log(`${LOG_PREFIX} No available slots found for auto-reschedule`);
      return null;
    }

    // Auto-reschedule to the best slot
    const bestSlot = suggestedSlots[0];

    // Update the meeting
    await db.meeting.update({
      where: { id: meetingId },
      data: {
        startDateTime: bestSlot.start,
        endDateTime: bestSlot.end,
        status: 'rescheduled',
        rescheduledFrom: meetingId,
      },
    });

    return {
      originalSlot: { start: meeting.startDateTime, end: meeting.endDateTime },
      suggestedSlots: [bestSlot],
      reason: 'Auto-rescheduled due to conflict (autonomous mode)',
      automatic: true,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} autoReschedule error:`, error);
    return null;
  }
}
