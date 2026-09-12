// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Platform Adapter (Strategy Pattern)
// Extensible meeting platform integration with Google Meet, Zoom,
// Teams, Calendly, and custom URL support.
// ═══════════════════════════════════════════════════════════════════

import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

/** Result of creating a meeting link on a platform */
export interface PlatformMeetingResult {
  meetingUrl: string;
  eventId: string;
  conferenceData: unknown | null;
  platform: string;
  htmlLink?: string;
  rawResponse?: unknown;
}

/** Parameters for creating a meeting link */
export interface PlatformCreateParams {
  userId: string;
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  attendees?: Array<{ email: string; name?: string }>;
  location?: string;
  reminders?: Array<{ method: string; minutes: number }>;
}

/** Parameters for updating a meeting link */
export interface PlatformUpdateParams {
  userId: string;
  eventId: string;
  title?: string;
  description?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  timezone?: string;
  attendees?: Array<{ email: string; name?: string; responseStatus?: string }>;
  location?: string;
  reminders?: Array<{ method: string; minutes: number }>;
}

// ═══════════════════════════════════════════════════════════════════
// PLATFORM ADAPTER INTERFACE
// ═══════════════════════════════════════════════════════════════════

/**
 * Abstract adapter interface for meeting platform integrations.
 * Each platform (Google Meet, Zoom, Teams, Calendly, Custom) implements this.
 */
export interface MeetingPlatformAdapter {
  /** The platform identifier string */
  readonly platform: string;

  /** Create a new meeting event on the platform and return the join URL */
  createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult>;

  /** Update an existing meeting event on the platform */
  updateMeetingLink(params: PlatformUpdateParams): Promise<void>;

  /** Cancel/delete a meeting event on the platform */
  cancelMeetingLink(userId: string, eventId: string): Promise<void>;

  /** Get meeting details from the platform */
  getMeetingDetails(userId: string, eventId: string): Promise<PlatformMeetingResult>;
}

// ═══════════════════════════════════════════════════════════════════
// GOOGLE MEET ADAPTER
// ═══════════════════════════════════════════════════════════════════

/**
 * Google Meet adapter using Google Calendar API v3 with conferenceData
 * for automatic Meet link generation.
 */
export class GoogleMeetAdapter implements MeetingPlatformAdapter {
  readonly platform = 'google_meet';
  private readonly GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

  /**
   * Create a Google Calendar event with Google Meet conference data.
   * Uses conferenceDataVersion=1 to enable automatic Meet link generation.
   */
  async createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult> {
    console.log(`[GoogleMeetAdapter] Creating meeting link: "${params.title}"`);

    const { accessToken } = await getValidCalendarAccessToken(params.userId);

    const requestId = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const body: Record<string, unknown> = {
      summary: params.title,
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
      `${this.GOOGLE_CALENDAR_API}/events?conferenceDataVersion=1&sendUpdates=all`,
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
      console.error(`[GoogleMeetAdapter] Event creation failed:`, errorBody);
      throw new Error(`Failed to create Google Calendar event: ${res.status} ${errorBody}`);
    }

    const event = (await res.json()) as Record<string, unknown>;

    // Extract Meet link from conferenceData
    const conferenceData = event.conferenceData as {
      entryPoints?: Array<{ entryPointType: string; uri: string; label?: string }>;
      conferenceId?: string;
      conferenceSolution?: { key: { type: string }; name: string; iconUri: string };
    } | null;

    let meetLink = '';
    if (conferenceData?.entryPoints) {
      const videoEntry = conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === 'video'
      );
      meetLink = videoEntry?.uri || '';
    }

    console.log(`[GoogleMeetAdapter] Meeting created. Event ID: ${event.id as string}, Meet link: ${meetLink || 'pending'}`);

    return {
      meetingUrl: meetLink,
      eventId: event.id as string,
      conferenceData,
      platform: this.platform,
      htmlLink: (event.htmlLink as string) || '',
      rawResponse: event,
    };
  }

  /**
   * Update a Google Calendar event.
   */
  async updateMeetingLink(params: PlatformUpdateParams): Promise<void> {
    console.log(`[GoogleMeetAdapter] Updating meeting link: ${params.eventId}`);

    const { accessToken } = await getValidCalendarAccessToken(params.userId);

    const body: Record<string, unknown> = {};

    if (params.title !== undefined) body.summary = params.title;
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
      `${this.GOOGLE_CALENDAR_API}/events/${encodeURIComponent(params.eventId)}?conferenceDataVersion=1&sendUpdates=all`,
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
      console.error(`[GoogleMeetAdapter] Event update failed:`, errorBody);
      throw new Error(`Failed to update Google Calendar event: ${res.status} ${errorBody}`);
    }

    console.log(`[GoogleMeetAdapter] Meeting updated: ${params.eventId}`);
  }

  /**
   * Cancel/delete a Google Calendar event.
   */
  async cancelMeetingLink(userId: string, eventId: string): Promise<void> {
    console.log(`[GoogleMeetAdapter] Cancelling meeting link: ${eventId}`);

    const { accessToken } = await getValidCalendarAccessToken(userId);

    const res = await fetch(
      `${this.GOOGLE_CALENDAR_API}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok && res.status !== 410) {
      // 410 = already deleted
      const errorBody = await res.text();
      console.error(`[GoogleMeetAdapter] Event deletion failed:`, errorBody);
      throw new Error(`Failed to delete Google Calendar event: ${res.status} ${errorBody}`);
    }

    console.log(`[GoogleMeetAdapter] Meeting cancelled: ${eventId}`);
  }

  /**
   * Get meeting details from Google Calendar.
   */
  async getMeetingDetails(userId: string, eventId: string): Promise<PlatformMeetingResult> {
    console.log(`[GoogleMeetAdapter] Getting meeting details: ${eventId}`);

    const { accessToken } = await getValidCalendarAccessToken(userId);

    const res = await fetch(
      `${this.GOOGLE_CALENDAR_API}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[GoogleMeetAdapter] Event fetch failed:`, errorBody);
      throw new Error(`Failed to fetch Google Calendar event: ${res.status} ${errorBody}`);
    }

    const event = (await res.json()) as Record<string, unknown>;

    // Extract Meet link
    const conferenceData = event.conferenceData as {
      entryPoints?: Array<{ entryPointType: string; uri: string }>;
    } | null;

    let meetLink = '';
    if (conferenceData?.entryPoints) {
      const videoEntry = conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === 'video'
      );
      meetLink = videoEntry?.uri || '';
    }

    return {
      meetingUrl: meetLink,
      eventId: event.id as string,
      conferenceData,
      platform: this.platform,
      htmlLink: (event.htmlLink as string) || '',
      rawResponse: event,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CUSTOM MEETING ADAPTER
// ═══════════════════════════════════════════════════════════════════

/**
 * Custom meeting adapter for manually provided meeting URLs.
 * Used when the user specifies a custom meeting link (e.g., a personal Zoom room,
 * a Jitsi link, or any other URL).
 */
export class CustomMeetingAdapter implements MeetingPlatformAdapter {
  readonly platform = 'custom';

  /**
   * Create a custom meeting. The meeting URL must be provided in the description or location.
   * Since custom meetings don't have a platform API, we just validate the URL.
   */
  async createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult> {
    console.log(`[CustomMeetingAdapter] Creating custom meeting: "${params.title}"`);

    const meetingUrl = params.location || '';

    // Validate that the URL is provided
    if (!meetingUrl) {
      return {
        meetingUrl: '',
        eventId: `custom-${Date.now()}`,
        conferenceData: null,
        platform: this.platform,
      };
    }

    return {
      meetingUrl,
      eventId: `custom-${Date.now()}`,
      conferenceData: null,
      platform: this.platform,
    };
  }

  /**
   * Update a custom meeting. No platform API to update.
   */
  async updateMeetingLink(params: PlatformUpdateParams): Promise<void> {
    console.log(`[CustomMeetingAdapter] Updating custom meeting: ${params.eventId}`);
    // No platform API to update — the URL is stored in the Meeting record
  }

  /**
   * Cancel a custom meeting. No platform API to cancel.
   */
  async cancelMeetingLink(_userId: string, eventId: string): Promise<void> {
    console.log(`[CustomMeetingAdapter] Cancelling custom meeting: ${eventId}`);
    // No platform API to cancel
  }

  /**
   * Get details for a custom meeting.
   */
  async getMeetingDetails(_userId: string, eventId: string): Promise<PlatformMeetingResult> {
    console.log(`[CustomMeetingAdapter] Getting custom meeting details: ${eventId}`);
    return {
      meetingUrl: '',
      eventId,
      conferenceData: null,
      platform: this.platform,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// FUTURE ADAPTERS — Stubs for upcoming integrations
// ═══════════════════════════════════════════════════════════════════

// /**
//  * Zoom adapter using Zoom Server-to-Server OAuth API.
//  * Requires: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
//  *
//  * @see https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/
//  */
// export class ZoomAdapter implements MeetingPlatformAdapter {
//   readonly platform = 'zoom';
//   private readonly ZOOM_API = 'https://api.zoom.us/v2';
//
//   async createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult> {
//     // 1. Get Zoom access token via Server-to-Server OAuth
//     // 2. POST /users/me/meetings with topic, type=2, start_time, duration, settings
//     // 3. Return join_url, start_url, and meeting ID
//     throw new Error('ZoomAdapter not yet implemented');
//   }
//
//   async updateMeetingLink(params: PlatformUpdateParams): Promise<void> {
//     // PATCH /meetings/{meetingId}
//     throw new Error('ZoomAdapter not yet implemented');
//   }
//
//   async cancelMeetingLink(userId: string, eventId: string): Promise<void> {
//     // DELETE /meetings/{meetingId}
//     throw new Error('ZoomAdapter not yet implemented');
//   }
//
//   async getMeetingDetails(userId: string, eventId: string): Promise<PlatformMeetingResult> {
//     // GET /meetings/{meetingId}
//     throw new Error('ZoomAdapter not yet implemented');
//   }
// }

// /**
//  * Microsoft Teams adapter using Microsoft Graph API.
//  * Requires: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
//  *
//  * @see https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0
//  */
// export class TeamsAdapter implements MeetingPlatformAdapter {
//   readonly platform = 'teams';
//   private readonly GRAPH_API = 'https://graph.microsoft.com/v1.0';
//
//   async createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult> {
//     // 1. Get Microsoft Graph access token via client credentials
//     // 2. POST /users/{userId}/calendar/events with isOnlineMeeting=true
//     // 3. Return onlineMeeting.joinUrl and event ID
//     throw new Error('TeamsAdapter not yet implemented');
//   }
//
//   async updateMeetingLink(params: PlatformUpdateParams): Promise<void> {
//     // PATCH /users/{userId}/calendar/events/{eventId}
//     throw new Error('TeamsAdapter not yet implemented');
//   }
//
//   async cancelMeetingLink(userId: string, eventId: string): Promise<void> {
//     // DELETE /users/{userId}/calendar/events/{eventId}
//     throw new Error('TeamsAdapter not yet implemented');
//   }
//
//   async getMeetingDetails(userId: string, eventId: string): Promise<PlatformMeetingResult> {
//     // GET /users/{userId}/calendar/events/{eventId}
//     throw new Error('TeamsAdapter not yet implemented');
//   }
// }

// /**
//  * Calendly adapter using Calendly API v2.
//  * Requires: CALENDLY_API_KEY or CALENDLY_PERSONAL_TOKEN
//  *
//  * @see https://developer.calendly.com/docs/api-v2
//  */
// export class CalendlyAdapter implements MeetingPlatformAdapter {
//   readonly platform = 'calendly';
//   private readonly CALENDLY_API = 'https://api.calendly.com';
//
//   async createMeetingLink(params: PlatformCreateParams): Promise<PlatformMeetingResult> {
//     // 1. Get user's organization and scheduling URL
//     // 2. Create a one-off event type or use existing
//     // 3. Return the scheduling link for the invitee
//     throw new Error('CalendlyAdapter not yet implemented');
//   }
//
//   async updateMeetingLink(params: PlatformUpdateParams): Promise<void> {
//     // Cancel and reschedule via Calendly
//     throw new Error('CalendlyAdapter not yet implemented');
//   }
//
//   async cancelMeetingLink(userId: string, eventId: string): Promise<void> {
//     // POST /scheduled_events/{uuid}/cancellation
//     throw new Error('CalendlyAdapter not yet implemented');
//   }
//
//   async getMeetingDetails(userId: string, eventId: string): Promise<PlatformMeetingResult> {
//     // GET /scheduled_events/{uuid}
//     throw new Error('CalendlyAdapter not yet implemented');
//   }
// }

// ═══════════════════════════════════════════════════════════════════
// PLATFORM FACTORY
// ═══════════════════════════════════════════════════════════════════

/**
 * Factory function that returns the correct platform adapter based on the platform identifier.
 * Currently supports: google_meet, custom
 * Future: zoom, teams, calendly
 *
 * @param platform - Platform identifier (google_meet, zoom, teams, calendly, custom)
 * @returns The appropriate MeetingPlatformAdapter instance
 */
export function getPlatformAdapter(platform: string): MeetingPlatformAdapter {
  const adapters: Record<string, () => MeetingPlatformAdapter> = {
    google_meet: () => new GoogleMeetAdapter(),
    custom: () => new CustomMeetingAdapter(),
    // Future adapters — uncomment when implemented:
    // zoom: () => new ZoomAdapter(),
    // teams: () => new TeamsAdapter(),
    // calendly: () => new CalendlyAdapter(),
  };

  const factory = adapters[platform];

  if (!factory) {
    console.warn(
      `[PlatformAdapter] Unsupported platform "${platform}", falling back to Google Meet`
    );
    return new GoogleMeetAdapter();
  }

  return factory();
}
