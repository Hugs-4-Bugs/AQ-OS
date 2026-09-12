// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Stop Google Calendar Watch
// POST /api/calendar/watch/stop — Stop a push notification watch channel
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';

// ── POST: Stop watching a Google Calendar ──────────────────────────

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { watchId, channelId } = body as { watchId?: string; channelId?: string };

      // Find the watch to stop — by ID, channel ID, or the first active one
      let watch;

      if (watchId) {
        watch = await db.calendarWatch.findFirst({
          where: { id: watchId, userId: user.id, status: 'active' },
        });
      } else if (channelId) {
        watch = await db.calendarWatch.findFirst({
          where: { channelId, userId: user.id, status: 'active' },
        });
      } else {
        // Stop the first active watch for this user
        watch = await db.calendarWatch.findFirst({
          where: { userId: user.id, status: 'active' },
        });
      }

      if (!watch) {
        return NextResponse.json(
          { error: 'No active watch channel found to stop' },
          { status: 404 }
        );
      }

      // Try to stop the watch channel with Google Calendar API
      let googleStopSuccess = false;

      try {
        const { accessToken } = await getValidCalendarAccessToken(user.id);

        const stopResponse = await fetch(
          'https://www.googleapis.com/calendar/v3/channels/stop',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: watch.channelId,
              resourceId: watch.resourceId,
            }),
          }
        );

        if (stopResponse.ok) {
          googleStopSuccess = true;
          console.log('[Calendar Watch Stop] Google channel stopped:', watch.channelId);
        } else {
          const errorText = await stopResponse.text();
          console.warn('[Calendar Watch Stop] Google stop failed (channel may already be expired):', errorText);
          // Continue anyway — the channel may have already expired or been stopped
        }
      } catch (tokenError) {
        console.warn('[Calendar Watch Stop] Could not get access token for Google stop:', tokenError);
        // Continue — we still want to update our database
      }

      // Update the watch status in our database
      await db.calendarWatch.update({
        where: { id: watch.id },
        data: { status: 'stopped' },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_watch_stopped',
          details: JSON.stringify({
            watchId: watch.id,
            channelId: watch.channelId,
            resourceId: watch.resourceId,
            calendarEmail: watch.calendarEmail,
            googleStopSuccess,
          }),
          resource: 'calendar',
          resourceId: watch.channelId,
        },
      });

      console.log('[Calendar Watch Stop] Watch stopped:', watch.id, 'channel:', watch.channelId);

      return NextResponse.json({
        success: true,
        message: 'Watch channel stopped successfully',
        watch: {
          id: watch.id,
          channelId: watch.channelId,
          status: 'stopped',
          googleStopSuccess,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. The watch has been cleaned up locally.' },
          { status: 404 }
        );
      }

      console.error('[Calendar Watch Stop] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to stop calendar watch' },
        { status: 500 }
      );
    }
  });
}, 'calendar/watch/stop');
