// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Intelligence API
// POST /api/calendar/intelligence — Calendar intelligence actions
// Actions: availability, conflicts, recommendations, connection-status, upcoming
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import {
  getBusySlots,
  detectConflicts,
  getSmartRecommendations,
  checkCalendarConnection,
  getUpcomingMeetingsFromCalendar,
} from '@/lib/calendar/calendar-intelligence';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      if (!body.action) {
        return NextResponse.json(
          { error: 'Missing required field: action' },
          { status: 400 }
        );
      }

      const validActions = ['availability', 'conflicts', 'recommendations', 'connection-status', 'upcoming'];
      if (!validActions.includes(body.action)) {
        return NextResponse.json(
          { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
          { status: 400 }
        );
      }

      switch (body.action) {
        // ── Availability: Get busy/free slots ─────────────────────
        case 'availability': {
          if (!body.startDate || !body.endDate) {
            return NextResponse.json(
              { error: 'Missing required fields: startDate, endDate' },
              { status: 400 }
            );
          }

          const busySlots = await getBusySlots(user.id, {
            start: new Date(body.startDate),
            end: new Date(body.endDate),
          });

          return NextResponse.json({
            action: 'availability',
            busySlots: busySlots.map((slot) => ({
              start: slot.start,
              end: slot.end,
              summary: slot.summary,
              isAllDay: slot.isAllDay,
            })),
          });
        }

        // ── Conflicts: Detect scheduling conflicts ────────────────
        case 'conflicts': {
          if (!body.newEventStart || !body.newEventEnd) {
            return NextResponse.json(
              { error: 'Missing required fields: newEventStart, newEventEnd' },
              { status: 400 }
            );
          }

          const conflicts = await detectConflicts(
            user.id,
            new Date(body.newEventStart),
            new Date(body.newEventEnd),
            body.excludeEventId
          );

          return NextResponse.json({
            action: 'conflicts',
            hasConflict: conflicts.hasConflict,
            conflicts: conflicts.conflicts,
            bufferViolations: conflicts.bufferViolations,
          });
        }

        // ── Recommendations: Get smart meeting time suggestions ───
        case 'recommendations': {
          const recommendations = await getSmartRecommendations(
            user.id,
            body.leadId,
            body.durationMinutes
          );

          return NextResponse.json({
            action: 'recommendations',
            recommendations,
          });
        }

        // ── Connection Status: Check if Google Calendar is connected ──
        case 'connection-status': {
          const status = await checkCalendarConnection(user.id);

          return NextResponse.json({
            action: 'connection-status',
            ...status,
          });
        }

        // ── Upcoming: Sync upcoming meetings from Google Calendar ──
        case 'upcoming': {
          const days = body.days || 7;
          const result = await getUpcomingMeetingsFromCalendar(user.id, days);

          return NextResponse.json({
            action: 'upcoming',
            synced: result.synced,
            created: result.created,
            errors: result.errors,
            syncedCount: result.synced.length,
            createdCount: result.created.length,
          });
        }

        default:
          return NextResponse.json(
            { error: 'Unhandled action' },
            { status: 400 }
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Google Calendar') || errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'Google Calendar is not connected. Please connect your Google Calendar first.' },
          { status: 400 }
        );
      }

      console.error('[Calendar Intelligence API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process calendar intelligence request' },
        { status: 500 }
      );
    }
  });
}, 'calendar/intelligence');
