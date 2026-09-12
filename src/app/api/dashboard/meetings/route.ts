// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dashboard Meetings API
// GET /api/dashboard/meetings — Return real meeting data from DB
// with conflict detection using detectConflict()
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { detectConflict } from '@/lib/meetings/calendar-intelligence';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse query parameters
      const days = parseInt(searchParams.get('days') || '7', 10);
      const status = searchParams.get('status') || undefined;

      // Calculate date range
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      // Build where clause
      const whereClause: Record<string, unknown> = {
        userId: user.id,
        startDateTime: { gte: now },
      };

      if (status) {
        whereClause.status = status;
      } else {
        // By default, only show upcoming (non-cancelled) meetings
        whereClause.status = { in: ['scheduled', 'confirmed', 'rescheduled', 'pending_approval'] };
      }

      // Fetch real meeting data from the database
      const meetings = await db.meeting.findMany({
        where: whereClause,
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              ownerName: true,
              email: true,
              phone: true,
            },
          },
          deal: {
            select: {
              id: true,
              projectType: true,
              status: true,
              proposedPrice: true,
              finalPrice: true,
            },
          },
        },
        orderBy: { startDateTime: 'asc' },
        take: 50,
      });

      // Enrich each meeting with conflict detection
      const enrichedMeetings = await Promise.all(
        meetings.map(async (meeting) => {
          let hasConflict = false;

          try {
            // Only check conflicts for upcoming meetings that haven't started yet
            if (meeting.startDateTime > now && meeting.status !== 'cancelled') {
              hasConflict = await detectConflict(user.id, meeting.startDateTime, meeting.endDateTime);
            }
          } catch (error) {
            // If conflict detection fails (e.g., no Google Calendar), default to false
            console.warn('[Dashboard Meetings] Conflict detection failed for meeting', meeting.id, error);
          }

          // Parse JSON fields for frontend consumption
          let attendees: Array<{ email: string; name?: string; status?: string }> = [];
          try {
            attendees = JSON.parse(meeting.attendees || '[]');
          } catch {
            attendees = [];
          }

          let agenda: Array<{ title: string; durationMinutes?: number; description?: string }> | null = null;
          if (meeting.agenda) {
            try {
              agenda = JSON.parse(meeting.agenda);
            } catch {
              agenda = null;
            }
          }

          let followUpActions: Array<{ id: string; title: string; completed: boolean }> | null = null;
          if (meeting.followUpActions) {
            try {
              followUpActions = JSON.parse(meeting.followUpActions);
            } catch {
              followUpActions = null;
            }
          }

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
            location: meeting.location,
            notes: meeting.notes,
            cancellationReason: meeting.cancellationReason,
            createdBy: meeting.createdBy,
            approvalStatus: meeting.approvalStatus,
            attendees,
            agenda,
            followUpActions,
            hasConflict,
            lead: meeting.lead,
            deal: meeting.deal,
            createdAt: meeting.createdAt,
            updatedAt: meeting.updatedAt,
          };
        })
      );

      // Calculate summary stats
      const totalMeetings = meetings.length;
      const conflictCount = enrichedMeetings.filter((m) => m.hasConflict).length;
      const upcomingCount = meetings.filter(
        (m) => m.startDateTime > now && m.status !== 'cancelled'
      ).length;

      // Stats by platform
      const platformBreakdown: Record<string, number> = {};
      for (const meeting of meetings) {
        const platform = meeting.platform || 'unknown';
        platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;
      }

      return NextResponse.json({
        meetings: enrichedMeetings,
        stats: {
          total: totalMeetings,
          upcoming: upcomingCount,
          conflicts: conflictCount,
          platformBreakdown,
        },
      });
    } catch (error) {
      console.error('[Dashboard Meetings] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch dashboard meetings' },
        { status: 500 }
      );
    }
  });
}, 'dashboard/meetings');
