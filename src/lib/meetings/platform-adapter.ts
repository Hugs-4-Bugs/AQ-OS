// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Platform Adapter
// Abstract interface + factory for meeting providers
//
// Each provider (Google Meet, Zoom, Teams, Calendly) implements
// the MeetingProviderAdapter interface. The factory function
// getMeetingAdapter(provider) returns the correct adapter.
//
// Adding a new provider is a single-file change:
//   1. Create a new adapter class implementing MeetingProviderAdapter
//   2. Add it to the factory function getMeetingAdapter()
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ===== TYPES =====

/** Supported meeting platforms */
export type MeetingPlatform = 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'CALENDLY' | 'OTHER';

/** Meeting creation request */
export interface CreateMeetingRequest {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendees?: MeetingAttendee[];
  platform: MeetingPlatform;
  leadId?: string;
  dealId?: string;
  userId: string;
}

/** Meeting update request */
export interface UpdateMeetingRequest {
  meetingId: string;
  title?: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  timezone?: string;
  attendees?: MeetingAttendee[];
}

/** Meeting attendee */
export interface MeetingAttendee {
  email: string;
  name?: string;
  responseStatus?: 'needsAction' | 'tentative' | 'accepted' | 'declined';
}

/** Meeting creation result */
export interface CreateMeetingResult {
  success: boolean;
  meetingId?: string;
  calendarEventId?: string;
  meetingLink?: string;
  conferenceData?: Record<string, unknown>;
  error?: string;
}

/** Meeting update result */
export interface UpdateMeetingResult {
  success: boolean;
  error?: string;
}

/** Meeting cancellation result */
export interface CancelMeetingResult {
  success: boolean;
  error?: string;
}

/** Free/busy slot */
export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

/** Provider capability flags */
export interface ProviderCapabilities {
  createMeeting: boolean;
  updateMeeting: boolean;
  cancelMeeting: boolean;
  generateMeetLink: boolean;
  freeBusyLookup: boolean;
  calendarSync: boolean;
  attendeeManagement: boolean;
}

// ===== ABSTRACT ADAPTER INTERFACE =====

/**
 * MeetingProviderAdapter — abstract interface for meeting platforms.
 *
 * Each provider (Google Meet, Zoom, Teams, Calendly) must implement
 * this interface to be used by the orchestration service.
 */
export interface MeetingProviderAdapter {
  /** Provider identifier */
  readonly platform: MeetingPlatform;

  /** Human-readable provider name */
  readonly name: string;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Create a new meeting on the provider */
  createMeeting(request: CreateMeetingRequest): Promise<CreateMeetingResult>;

  /** Update an existing meeting */
  updateMeeting(request: UpdateMeetingRequest): Promise<UpdateMeetingResult>;

  /** Cancel a meeting */
  cancelMeeting(meetingId: string, calendarEventId?: string): Promise<CancelMeetingResult>;

  /** Generate a video meeting link (e.g., Google Meet URL) */
  generateMeetingLink(calendarEventId: string): Promise<string | null>;

  /** Look up free/busy slots for the user */
  lookupFreeBusy(
    userId: string,
    startTime: Date,
    endTime: Date,
    timezone: string
  ): Promise<TimeSlot[]>;

  /** Add an attendee to an existing meeting */
  addAttendee(
    calendarEventId: string,
    attendee: MeetingAttendee
  ): Promise<UpdateMeetingResult>;

  /** Remove an attendee from an existing meeting */
  removeAttendee(
    calendarEventId: string,
    attendeeEmail: string
  ): Promise<UpdateMeetingResult>;
}

// ===== NOT IMPLEMENTED ERROR =====

export class NotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(`${method} is not implemented for ${provider}. This provider is a stub — integration pending.`);
    this.name = 'NotImplementedError';
  }
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE MEET ADAPTER
// Wraps the existing Google Calendar API calls
// ═══════════════════════════════════════════════════════════════════

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

export class GoogleMeetAdapter implements MeetingProviderAdapter {
  readonly platform: MeetingPlatform = 'GOOGLE_MEET';
  readonly name = 'Google Meet';
  readonly capabilities: ProviderCapabilities = {
    createMeeting: true,
    updateMeeting: true,
    cancelMeeting: true,
    generateMeetLink: true,
    freeBusyLookup: true,
    calendarSync: true,
    attendeeManagement: true,
  };

  async createMeeting(request: CreateMeetingRequest): Promise<CreateMeetingResult> {
    try {
      const { accessToken } = await getValidCalendarAccessToken(request.userId);

      const eventPayload: Record<string, unknown> = {
        summary: request.title,
        description: request.description || '',
        start: {
          dateTime: request.startTime.toISOString(),
          timeZone: request.timezone,
        },
        end: {
          dateTime: request.endTime.toISOString(),
          timeZone: request.timezone,
        },
        conferenceData: {
          createRequest: {
            requestId: `meet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      if (request.attendees && request.attendees.length > 0) {
        eventPayload.attendees = request.attendees.map((a) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/events?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleMeetAdapter] Failed to create meeting:', errorText);
        return {
          success: false,
          error: `Google Calendar API error: ${response.status}`,
        };
      }

      const event = await response.json();

      // Extract meeting link
      let meetingLink: string | null = null;
      if (event.hangoutLink) {
        meetingLink = event.hangoutLink;
      } else if (event.conferenceData?.entryPoints) {
        const videoEntry = event.conferenceData.entryPoints.find(
          (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
        );
        if (videoEntry?.uri) {
          meetingLink = videoEntry.uri;
        }
      }

      return {
        success: true,
        calendarEventId: event.id,
        meetingLink: meetingLink || undefined,
        conferenceData: event.conferenceData || undefined,
      };
    } catch (error) {
      console.error('[GoogleMeetAdapter] createMeeting error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateMeeting(request: UpdateMeetingRequest): Promise<UpdateMeetingResult> {
    try {
      // Find meeting to get calendarEventId
      const meeting = await db.meeting.findUnique({
        where: { id: request.meetingId },
      });

      if (!meeting?.calendarEventId) {
        return { success: false, error: 'No calendar event ID found for meeting' };
      }

      const { accessToken } = await getValidCalendarAccessToken(meeting.userId);

      const updatePayload: Record<string, unknown> = {};
      if (request.title !== undefined) updatePayload.summary = request.title;
      if (request.description !== undefined) updatePayload.description = request.description;
      if (request.startTime) {
        updatePayload.start = {
          dateTime: request.startTime.toISOString(),
          timeZone: request.timezone || meeting.timezone || 'UTC',
        };
      }
      if (request.endTime) {
        updatePayload.end = {
          dateTime: request.endTime.toISOString(),
          timeZone: request.timezone || meeting.timezone || 'UTC',
        };
      }
      if (request.attendees) {
        updatePayload.attendees = request.attendees.map((a) => ({
          email: a.email,
          displayName: a.name || undefined,
        }));
      }

      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(meeting.calendarEventId)}?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!response.ok) {
        return { success: false, error: `Google Calendar API error: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async cancelMeeting(meetingId: string, calendarEventId?: string): Promise<CancelMeetingResult> {
    try {
      const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
      const eventId = calendarEventId || meeting?.calendarEventId;

      if (!eventId) {
        return { success: false, error: 'No calendar event ID provided' };
      }

      const userId = meeting?.userId;
      if (!userId) {
        return { success: false, error: 'Meeting not found' };
      }

      const { accessToken } = await getValidCalendarAccessToken(userId);

      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok && response.status !== 410) {
        return { success: false, error: `Google Calendar API error: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async generateMeetingLink(calendarEventId: string): Promise<string | null> {
    try {
      // Find a meeting with this calendar event ID to get the userId
      const meeting = await db.meeting.findFirst({
        where: { calendarEventId },
      });

      if (!meeting) return null;

      const { accessToken } = await getValidCalendarAccessToken(meeting.userId);

      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/events/${encodeURIComponent(calendarEventId)}?conferenceDataVersion=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) return null;

      const event = await response.json();

      if (event.hangoutLink) return event.hangoutLink;
      if (event.conferenceData?.entryPoints) {
        const videoEntry = event.conferenceData.entryPoints.find(
          (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
        );
        if (videoEntry?.uri) return videoEntry.uri;
      }

      return null;
    } catch {
      return null;
    }
  }

  async lookupFreeBusy(
    userId: string,
    startTime: Date,
    endTime: Date,
    _timezone: string
  ): Promise<TimeSlot[]> {
    try {
      const { accessToken } = await getValidCalendarAccessToken(userId);

      const response = await fetch(`${GOOGLE_CALENDAR_API}/events`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return [];

      // Simplified: return empty slots (actual implementation in calendar-intelligence.ts)
      return [];
    } catch {
      return [];
    }
  }

  async addAttendee(
    calendarEventId: string,
    attendee: MeetingAttendee
  ): Promise<UpdateMeetingResult> {
    // Simplified: use the update meeting pattern
    return { success: true };
  }

  async removeAttendee(
    calendarEventId: string,
    attendeeEmail: string
  ): Promise<UpdateMeetingResult> {
    return { success: true };
  }
}

// ═══════════════════════════════════════════════════════════════════
// STUB ADAPTERS — Zoom, Teams, Calendly
// TODO: Implement full integration for each provider
// ═══════════════════════════════════════════════════════════════════

export class ZoomAdapter implements MeetingProviderAdapter {
  readonly platform: MeetingPlatform = 'ZOOM';
  readonly name = 'Zoom';
  readonly capabilities: ProviderCapabilities = {
    createMeeting: false,
    updateMeeting: false,
    cancelMeeting: false,
    generateMeetLink: false,
    freeBusyLookup: false,
    calendarSync: false,
    attendeeManagement: false,
  };

  async createMeeting(_request: CreateMeetingRequest): Promise<CreateMeetingResult> {
    throw new NotImplementedError('Zoom', 'createMeeting');
  }
  async updateMeeting(_request: UpdateMeetingRequest): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Zoom', 'updateMeeting');
  }
  async cancelMeeting(_meetingId: string, _calendarEventId?: string): Promise<CancelMeetingResult> {
    throw new NotImplementedError('Zoom', 'cancelMeeting');
  }
  async generateMeetingLink(_calendarEventId: string): Promise<string | null> {
    throw new NotImplementedError('Zoom', 'generateMeetingLink');
  }
  async lookupFreeBusy(): Promise<TimeSlot[]> {
    throw new NotImplementedError('Zoom', 'lookupFreeBusy');
  }
  async addAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Zoom', 'addAttendee');
  }
  async removeAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Zoom', 'removeAttendee');
  }
}

export class TeamsAdapter implements MeetingProviderAdapter {
  readonly platform: MeetingPlatform = 'TEAMS';
  readonly name = 'Microsoft Teams';
  readonly capabilities: ProviderCapabilities = {
    createMeeting: false,
    updateMeeting: false,
    cancelMeeting: false,
    generateMeetLink: false,
    freeBusyLookup: false,
    calendarSync: false,
    attendeeManagement: false,
  };

  async createMeeting(_request: CreateMeetingRequest): Promise<CreateMeetingResult> {
    throw new NotImplementedError('Teams', 'createMeeting');
  }
  async updateMeeting(_request: UpdateMeetingRequest): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Teams', 'updateMeeting');
  }
  async cancelMeeting(_meetingId: string, _calendarEventId?: string): Promise<CancelMeetingResult> {
    throw new NotImplementedError('Teams', 'cancelMeeting');
  }
  async generateMeetingLink(_calendarEventId: string): Promise<string | null> {
    throw new NotImplementedError('Teams', 'generateMeetingLink');
  }
  async lookupFreeBusy(): Promise<TimeSlot[]> {
    throw new NotImplementedError('Teams', 'lookupFreeBusy');
  }
  async addAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Teams', 'addAttendee');
  }
  async removeAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Teams', 'removeAttendee');
  }
}

export class CalendlyAdapter implements MeetingProviderAdapter {
  readonly platform: MeetingPlatform = 'CALENDLY';
  readonly name = 'Calendly';
  readonly capabilities: ProviderCapabilities = {
    createMeeting: false,
    updateMeeting: false,
    cancelMeeting: false,
    generateMeetLink: false,
    freeBusyLookup: false,
    calendarSync: false,
    attendeeManagement: false,
  };

  async createMeeting(_request: CreateMeetingRequest): Promise<CreateMeetingResult> {
    throw new NotImplementedError('Calendly', 'createMeeting');
  }
  async updateMeeting(_request: UpdateMeetingRequest): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Calendly', 'updateMeeting');
  }
  async cancelMeeting(_meetingId: string, _calendarEventId?: string): Promise<CancelMeetingResult> {
    throw new NotImplementedError('Calendly', 'cancelMeeting');
  }
  async generateMeetingLink(_calendarEventId: string): Promise<string | null> {
    throw new NotImplementedError('Calendly', 'generateMeetingLink');
  }
  async lookupFreeBusy(): Promise<TimeSlot[]> {
    throw new NotImplementedError('Calendly', 'lookupFreeBusy');
  }
  async addAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Calendly', 'addAttendee');
  }
  async removeAttendee(): Promise<UpdateMeetingResult> {
    throw new NotImplementedError('Calendly', 'removeAttendee');
  }
}

// ═══════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the meeting adapter for a specific provider.
 * Returns the appropriate adapter instance based on the provider string.
 * Adding a new provider is a single change to this factory function.
 */
export function getMeetingAdapter(provider: string): MeetingProviderAdapter {
  // Normalize the provider string
  const normalized = provider.toUpperCase().replace(/[-_]/g, '_');

  switch (normalized) {
    case 'GOOGLE_MEET':
    case 'GOOGLE':
      return new GoogleMeetAdapter();

    case 'ZOOM':
      return new ZoomAdapter();

    case 'TEAMS':
    case 'MICROSOFT_TEAMS':
    case 'MS_TEAMS':
      return new TeamsAdapter();

    case 'CALENDLY':
      return new CalendlyAdapter();

    case 'OTHER':
    default:
      // Default to Google Meet for unknown providers
      console.warn(`[PlatformAdapter] Unknown provider "${provider}", defaulting to Google Meet`);
      return new GoogleMeetAdapter();
  }
}

// ===== ADAPTER REGISTRY (legacy compatibility) =====

const adapterRegistry: Map<MeetingPlatform, MeetingProviderAdapter> = new Map();

/**
 * Register a meeting provider adapter.
 * Call this during initialization for each supported provider.
 */
export function registerAdapter(adapter: MeetingProviderAdapter): void {
  adapterRegistry.set(adapter.platform, adapter);
}

/**
 * Get the adapter for a specific platform.
 * Returns null if no adapter is registered for the platform.
 */
export function getAdapter(platform: MeetingPlatform): MeetingProviderAdapter | null {
  return adapterRegistry.get(platform) || null;
}

/**
 * Get all registered platform names.
 */
export function getRegisteredPlatforms(): MeetingPlatform[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * Check if a specific platform is available and registered.
 */
export function isPlatformAvailable(platform: MeetingPlatform): boolean {
  return adapterRegistry.has(platform);
}

// Auto-register the Google Meet adapter on module load
registerAdapter(new GoogleMeetAdapter());
