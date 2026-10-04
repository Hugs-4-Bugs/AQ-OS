// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Settings API
// GET  /api/meetings/settings — Get meeting settings
// PUT  /api/meetings/settings — Update meeting settings
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';

// ── Helper: Parse JSON string field safely ──────────────────────

function safeParseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ── Helper: Build settings response from DB record ─────────────

function buildSettingsResponse(settings: {
  meetingPlatform: string;
  meetingDurationDefault: number;
  meetingBufferMinutes: number;
  meetingWorkingHoursStart: string;
  meetingWorkingHoursEnd: string;
  meetingWorkingDays: string;
  meetingTimezone: string;
  meetingAutoSchedule: boolean;
  meetingAutonomyMode: string;
  meetingRemindersEnabled: boolean;
  meetingReminderMinutes: string;
  meetingEmailConfirmation: boolean;
  meetingEmailReminder: boolean;
  calendarSyncEnabled: boolean;
  calendarWatchEnabled: boolean;
  googleCalendarConnected: boolean;
}) {
  return {
    meetingPlatform: settings.meetingPlatform,
    meetingDurationDefault: settings.meetingDurationDefault,
    meetingBufferMinutes: settings.meetingBufferMinutes,
    meetingWorkingHoursStart: settings.meetingWorkingHoursStart,
    meetingWorkingHoursEnd: settings.meetingWorkingHoursEnd,
    meetingWorkingDays: safeParseJSON<number[]>(settings.meetingWorkingDays, [1, 2, 3, 4, 5]),
    meetingTimezone: settings.meetingTimezone,
    meetingAutoSchedule: settings.meetingAutoSchedule,
    meetingAutonomyMode: settings.meetingAutonomyMode,
    meetingRemindersEnabled: settings.meetingRemindersEnabled,
    meetingReminderMinutes: safeParseJSON<number[]>(settings.meetingReminderMinutes, [10, 60]),
    meetingEmailConfirmation: settings.meetingEmailConfirmation,
    meetingEmailReminder: settings.meetingEmailReminder,
    calendarSyncEnabled: settings.calendarSyncEnabled,
    calendarWatchEnabled: settings.calendarWatchEnabled,
    googleCalendarConnected: settings.googleCalendarConnected,
  };
}

// ── Default settings ────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  meetingPlatform: 'google_meet',
  meetingDurationDefault: 30,
  meetingBufferMinutes: 15,
  meetingWorkingHoursStart: '09:00',
  meetingWorkingHoursEnd: '18:00',
  meetingWorkingDays: [1, 2, 3, 4, 5],
  meetingTimezone: 'UTC',
  meetingAutoSchedule: false,
  meetingAutonomyMode: 'approval',
  meetingRemindersEnabled: true,
  meetingReminderMinutes: [10, 60],
  meetingEmailConfirmation: true,
  meetingEmailReminder: true,
  calendarSyncEnabled: true,
  calendarWatchEnabled: false,
  googleCalendarConnected: false,
};

// ── GET: Get meeting settings ─────────────────────────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
      });

      // FIX (2026-09-09): Derive googleCalendarConnected from the ACTUAL
      // GoogleCalendarToken record (real-time) instead of trusting a
      // stale boolean field on userSettings. This ensures the Meeting
      // Preferences dialog always shows the true current connection state.
      let realCalendarConnected = false;
      let calendarEmail: string | null = null;
      try {
        const calToken = await db.googleCalendarToken.findFirst({
          where: { userId: user.id, isConnected: true },
          select: { id: true, calendarEmail: true, isConnected: true },
        });
        realCalendarConnected = !!calToken;
        calendarEmail = calToken?.calendarEmail || null;
      } catch (calErr) {
        console.warn('[Meeting Settings API] Calendar token lookup failed (non-fatal):', calErr);
      }

      if (!settings) {
        return NextResponse.json({
          settings: {
            ...DEFAULT_SETTINGS,
            googleCalendarConnected: realCalendarConnected,
            calendarEmail,
          },
        });
      }

      const base = buildSettingsResponse(settings);
      return NextResponse.json({
        settings: {
          ...base,
          googleCalendarConnected: realCalendarConnected,
          calendarEmail,
        },
      });
    } catch (error) {
      console.error('[Meeting Settings API] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meeting settings' },
        { status: 500 }
      );
    }
  });
}, 'meetings/settings');

// ── PUT: Update meeting settings ──────────────────────────────────

export const PUT = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const updateData: Record<string, unknown> = {};

      if (body.meetingPlatform !== undefined) updateData.meetingPlatform = body.meetingPlatform;
      if (body.meetingDurationDefault !== undefined) updateData.meetingDurationDefault = body.meetingDurationDefault;
      if (body.meetingBufferMinutes !== undefined) updateData.meetingBufferMinutes = body.meetingBufferMinutes;
      if (body.meetingWorkingHoursStart !== undefined) updateData.meetingWorkingHoursStart = body.meetingWorkingHoursStart;
      if (body.meetingWorkingHoursEnd !== undefined) updateData.meetingWorkingHoursEnd = body.meetingWorkingHoursEnd;
      if (body.meetingWorkingDays !== undefined) updateData.meetingWorkingDays = JSON.stringify(body.meetingWorkingDays);
      if (body.meetingTimezone !== undefined) updateData.meetingTimezone = body.meetingTimezone;
      if (body.meetingAutoSchedule !== undefined) updateData.meetingAutoSchedule = body.meetingAutoSchedule;
      if (body.meetingAutonomyMode !== undefined) updateData.meetingAutonomyMode = body.meetingAutonomyMode;
      if (body.meetingRemindersEnabled !== undefined) updateData.meetingRemindersEnabled = body.meetingRemindersEnabled;
      if (body.meetingReminderMinutes !== undefined) updateData.meetingReminderMinutes = JSON.stringify(body.meetingReminderMinutes);
      if (body.meetingEmailConfirmation !== undefined) updateData.meetingEmailConfirmation = body.meetingEmailConfirmation;
      if (body.meetingEmailReminder !== undefined) updateData.meetingEmailReminder = body.meetingEmailReminder;
      if (body.calendarSyncEnabled !== undefined) updateData.calendarSyncEnabled = body.calendarSyncEnabled;
      if (body.calendarWatchEnabled !== undefined) updateData.calendarWatchEnabled = body.calendarWatchEnabled;

      // Validate some fields
      if (body.meetingDurationDefault !== undefined && (body.meetingDurationDefault < 5 || body.meetingDurationDefault > 480)) {
        return NextResponse.json(
          { error: 'Meeting duration must be between 5 and 480 minutes' },
          { status: 400 }
        );
      }
      if (body.meetingBufferMinutes !== undefined && (body.meetingBufferMinutes < 0 || body.meetingBufferMinutes > 120)) {
        return NextResponse.json(
          { error: 'Buffer minutes must be between 0 and 120' },
          { status: 400 }
        );
      }
      if (body.meetingWorkingDays !== undefined) {
        const days = body.meetingWorkingDays as number[];
        if (!Array.isArray(days) || days.some((d) => d < 1 || d > 7)) {
          return NextResponse.json(
            { error: 'Working days must be an array of numbers 1-7 (Mon-Sun)' },
            { status: 400 }
          );
        }
      }
      if (body.meetingAutonomyMode !== undefined) {
        const validModes = ['approval', 'assisted', 'autonomous'];
        if (!validModes.includes(body.meetingAutonomyMode)) {
          return NextResponse.json(
            { error: 'Autonomy mode must be one of: approval, assisted, autonomous' },
            { status: 400 }
          );
        }
      }
      if (body.meetingReminderMinutes !== undefined) {
        const mins = body.meetingReminderMinutes as number[];
        if (!Array.isArray(mins) || mins.some((m) => m < 1 || m > 10080)) {
          return NextResponse.json(
            { error: 'Reminder minutes must be an array of positive numbers (max 10080 = 7 days)' },
            { status: 400 }
          );
        }
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: 'No settings to update' },
          { status: 400 }
        );
      }

      const settings = await db.userSettings.upsert({
        where: { userId: user.id },
        update: updateData,
        create: {
          userId: user.id,
          ...updateData,
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'meeting_settings_updated',
          details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
          resource: 'settings',
          resourceId: settings.id,
        },
      });

      return NextResponse.json({
        settings: buildSettingsResponse(settings),
      });
    } catch (error) {
      console.error('[Meeting Settings API] PUT Error:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting settings' },
        { status: 500 }
      );
    }
  });
}, 'meetings/settings');
