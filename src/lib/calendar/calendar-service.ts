/**
 * AcquisitionOS — Google Calendar Service
 * Consolidated calendar operations: events CRUD, availability, booking, reminders
 * 
 * All operations require a valid Google Calendar access token obtained via
 * getValidCalendarAccessToken() from google-oauth.ts
 */

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ===== TYPES =====

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: string;
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey?: { type: string };
    };
  };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  hangoutLink?: string;
  htmlLink?: string;
  status: string;
  creator?: { email: string; displayName?: string };
  organizer?: { email: string; displayName?: string };
  created?: string;
  updated?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  timeZone?: string;
  location?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  createConference?: boolean;
  reminders?: Array<{ method: string; minutes: number }>;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

export interface AvailabilityResult {
  date: string;
  busyPeriods: Array<{ start: string; end: string }>;
  availableSlots: AvailabilitySlot[];
  totalSlots: number;
  availableCount: number;
}

// ===== API WRAPPER =====

async function calendarApi(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<{ data: Record<string, unknown>; status: number }> {
  const { accessToken, calendarToken } = await getValidCalendarAccessToken(userId);
  
  const baseUrl = 'https://www.googleapis.com/calendar/v3';
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    // Token expired — mark as disconnected
    await db.googleCalendarToken.update({
      where: { id: calendarToken.id },
      data: { isConnected: false },
    });
    throw new Error('Calendar token expired. Please reconnect.');
  }
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error (${response.status}): ${error}`);
  }
  
  const data = response.status === 204 ? {} : await response.json();
  return { data, status: response.status };
}

// ===== EVENT OPERATIONS =====

/**
 * List calendar events within a time range.
 */
export async function listEvents(
  userId: string,
  options?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    query?: string;
  }
): Promise<{ events: CalendarEvent[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  if (options?.timeMin) params.set('timeMin', options.timeMin);
  if (options?.timeMax) params.set('timeMax', options.timeMax);
  params.set('maxResults', String(options?.maxResults || 50));
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');
  if (options?.query) params.set('q', options.query);
  
  const { data } = await calendarApi(
    userId,
    `/calendars/primary/events?${params.toString()}`
  );
  
  const events = (data.items || []) as CalendarEvent[];
  const nextPageToken = data.nextPageToken as string | undefined;
  
  // Update last sync timestamp
  try {
    await db.googleCalendarToken.findFirst({
      where: { userId, isConnected: true },
    }).then((token) => {
      if (token) {
        db.googleCalendarToken.update({
          where: { id: token.id },
          data: { lastSyncedAt: new Date() },
        });
      }
    });
  } catch { /* non-critical */ }
  
  return { events, nextPageToken };
}

/**
 * Get a single event by ID.
 */
export async function getEvent(userId: string, eventId: string): Promise<CalendarEvent> {
  const { data } = await calendarApi(userId, `/calendars/primary/events/${eventId}`);
  return data as unknown as CalendarEvent;
}

/**
 * Create a new calendar event.
 */
export async function createEvent(userId: string, params: CreateEventParams): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {
    summary: params.summary,
    start: {
      dateTime: params.startTime,
      timeZone: params.timeZone || 'UTC',
    },
    end: {
      dateTime: params.endTime,
      timeZone: params.timeZone || 'UTC',
    },
  };
  
  if (params.description) body.description = params.description;
  if (params.location) body.location = params.location;
  if (params.attendees?.length) body.attendees = params.attendees;
  
  if (params.createConference) {
    body.conferenceData = {
      createRequest: {
        requestId: `aos_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        conferenceSolutionKey: { type: 'eventNamedHangout' },
      },
    };
  }
  
  if (params.reminders?.length) {
    body.reminders = {
      useDefault: false,
      overrides: params.reminders,
    };
  } else {
    body.reminders = { useDefault: true };
  }
  
  const path = '/calendars/primary/events?conferenceDataVersion=1&sendNotifications=true';
  const { data } = await calendarApi(userId, path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  
  return data as unknown as CalendarEvent;
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(
  userId: string,
  eventId: string,
  updates: Partial<CreateEventParams>
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.location !== undefined) body.location = updates.location;
  if (updates.startTime) body.start = { dateTime: updates.startTime, timeZone: updates.timeZone || 'UTC' };
  if (updates.endTime) body.end = { dateTime: updates.endTime, timeZone: updates.timeZone || 'UTC' };
  if (updates.attendees) body.attendees = updates.attendees;
  
  const { data } = await calendarApi(
    userId,
    `/calendars/primary/events/${eventId}?sendNotifications=true`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  
  return data as unknown as CalendarEvent;
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  await calendarApi(
    userId,
    `/calendars/primary/events/${eventId}?sendNotifications=true`,
    { method: 'DELETE' }
  );
}

// ===== AVAILABILITY =====

/**
 * Check free/busy for a given date range.
 * Returns available time slots.
 */
export async function checkAvailability(
  userId: string,
  date: string,
  durationMinutes: number = 30,
  startHour: number = 9,
  endHour: number = 18
): Promise<AvailabilityResult> {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) throw new Error('Invalid date format');
  
  const durationMs = durationMinutes * 60 * 1000;
  
  const timeMin = new Date(dateObj);
  timeMin.setHours(startHour, 0, 0, 0);
  const timeMax = new Date(dateObj);
  timeMax.setHours(endHour, 0, 0, 0);
  
  // Query free/busy
  const { data } = await calendarApi(userId, `/freeBusy?key=${process.env.GOOGLE_API_KEY || ''}`, {
    method: 'POST',
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  
  const busyPeriods = ((data.calendars as Record<string, Record<string, unknown>>)?.primary?.busy || []) as Array<{ start: string; end: string }>;
  
  // Generate slots at 30-minute intervals
  const slots: AvailabilitySlot[] = [];
  const slotIntervalMs = 30 * 60 * 1000;
  const currentSlot = new Date(timeMin);
  
  while (currentSlot.getTime() + durationMs <= timeMax.getTime()) {
    const slotEnd = new Date(currentSlot.getTime() + durationMs);
    
    const isAvailable = !busyPeriods.some((busy) => {
      const busyStart = new Date(busy.start).getTime();
      const busyEnd = new Date(busy.end).getTime();
      return currentSlot.getTime() < busyEnd && slotEnd.getTime() > busyStart;
    });
    
    slots.push({
      start: currentSlot.toISOString(),
      end: slotEnd.toISOString(),
      available: isAvailable,
    });
    
    currentSlot.setTime(currentSlot.getTime() + slotIntervalMs);
  }
  
  const availableSlots = slots.filter((s) => s.available);
  
  return {
    date,
    busyPeriods,
    availableSlots,
    totalSlots: slots.length,
    availableCount: availableSlots.length,
  };
}

// ===== AI BOOKING =====

/**
 * AI-powered meeting booking: find optimal time and create event.
 * Uses z-ai-web-dev-sdk to pick the best slot based on lead context.
 */
export async function aiBookMeeting(params: {
  userId: string;
  leadId?: string;
  title?: string;
  description?: string;
  durationMinutes?: number;
  dateRange?: { start: string; end: string };
  attendeeEmail?: string;
  preferences?: string;
}): Promise<{ event: CalendarEvent; reasoning: string }> {
  const { userId, title, description, durationMinutes = 30, attendeeEmail, preferences } = params;
  
  // Get lead context if provided
  let leadContext = '';
  if (params.leadId) {
    const lead = await db.lead.findUnique({ where: { id: params.leadId } });
    if (lead) {
      leadContext = `Lead: ${lead.businessName}, Niche: ${lead.niche || 'unknown'}, City: ${lead.city || 'unknown'}, Best Timing: ${lead.bestTiming || 'not set'}, Best Channel: ${lead.bestChannel || 'not set'}`;
    }
  }
  
  // Find available slots for next 5 business days
  const availableSlots: AvailabilitySlot[] = [];
  const today = new Date();
  
  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    try {
      const result = await checkAvailability(
        userId,
        date.toISOString().split('T')[0],
        durationMinutes
      );
      availableSlots.push(...result.availableSlots);
    } catch {
      continue;
    }
  }
  
  if (availableSlots.length === 0) {
    throw new Error('No available slots found in the next 7 days');
  }
  
  // Use AI to pick the best slot
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();
  
  const slotDescriptions = availableSlots.slice(0, 10).map((s, i) => {
    const d = new Date(s.start);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `Slot ${i + 1}: ${dayName} at ${time}`;
  }).join('\n');
  
  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are a scheduling assistant. Pick the best meeting slot. Consider business hours, day of week preferences (Tue-Thu best), and any user preferences. Return ONLY a JSON object with "slotIndex" (0-based) and "reasoning" (one sentence).',
      },
      {
        role: 'user',
        content: `Find the best slot for a ${durationMinutes}-minute meeting.\n${leadContext}\nUser preferences: ${preferences || 'none'}\n\nAvailable slots:\n${slotDescriptions}`,
      },
    ],
    model: 'auto',
  });
  
  const content = response.choices?.[0]?.message?.content || '{}';
  const choice = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  const slotIndex = Math.min(choice.slotIndex || 0, availableSlots.length - 1);
  const selectedSlot = availableSlots[slotIndex];
  
  // Create the event
  const event = await createEvent(userId, {
    summary: title || 'AcquisitionOS Meeting',
    description: description || `Scheduled via AI Booking${leadContext ? `\n\n${leadContext}` : ''}`,
    startTime: selectedSlot.start,
    endTime: selectedSlot.end,
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
    createConference: true,
    reminders: [
      { method: 'email', minutes: 60 },
      { method: 'popup', minutes: 15 },
    ],
  });
  
  return {
    event,
    reasoning: choice.reasoning || `Selected slot ${slotIndex + 1}`,
  };
}
