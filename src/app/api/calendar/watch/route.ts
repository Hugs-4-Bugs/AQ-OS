// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Calendar Watch (Push Notifications)
// POST /api/calendar/watch — Register a push notification watch channel
// GET  /api/calendar/watch — List watch channels for the user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import { buildAppUrl } from '@/lib/app-url';
import crypto from 'crypto';

// ── POST: Set up Google Calendar push notification watch ───────────

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      // Check for an existing active watch for this user
      const existingWatch = await db.calendarWatch.findFirst({
        where: {
          userId: user.id,
          status: 'active',
        },
      });

      if (existingWatch) {
        // Check if the existing watch is still valid (not expired)
        if (existingWatch.expiration && new Date(existingWatch.expiration) > new Date()) {
          return NextResponse.json({
            success: true,
            message: 'An active watch channel already exists',
            watch: {
              id: existingWatch.id,
              channelId: existingWatch.channelId,
              calendarEmail: existingWatch.calendarEmail,
              expiration: existingWatch.expiration,
              status: existingWatch.status,
            },
          });
        }
        // Existing watch is expired — mark it
        await db.calendarWatch.update({
          where: { id: existingWatch.id },
          data: { status: 'expired' },
        });
      }

      // Get a valid Calendar access token (refreshes if needed)
      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      // Generate a unique channel ID and token for verification
      const channelId = `acqos-${crypto.randomUUID()}`;
      const channelToken = crypto.randomBytes(32).toString('hex');

      // Build the webhook URL that Google will call
      const webhookUrl = buildAppUrl('/api/calendar/webhook');

      // Watch expiration: 1 week from now (Google max is ~30 days, 1 week is safe)
      const expirationMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const expiration = new Date(expirationMs);

      // Register the watch with Google Calendar API
      const watchResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: channelId,
            type: 'web_hook',
            address: webhookUrl,
            token: channelToken,
            expiration: expirationMs,
          }),
        }
      );

      if (!watchResponse.ok) {
        const errorText = await watchResponse.text();
        console.error('[Calendar Watch] Failed to register watch:', errorText);

        if (watchResponse.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { status: 'expired' },
          });
          return NextResponse.json(
            { error: 'Calendar token expired. Please reconnect your Google Calendar.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to register calendar push notification watch', details: errorText },
          { status: 502 }
        );
      }

      const watchData = await watchResponse.json();

      // Google returns the resourceId for the watched calendar
      const resourceId = watchData.resourceId;
      const googleExpiration = watchData.expiration
        ? new Date(Number(watchData.expiration))
        : expiration;

      // Store the watch channel info in our database
      const calendarWatch = await db.calendarWatch.create({
        data: {
          userId: user.id,
          channelId,
          resourceId,
          calendarEmail: calendarToken.calendarEmail,
          expiration: googleExpiration,
          status: 'active',
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_watch_registered',
          details: JSON.stringify({
            channelId,
            resourceId,
            calendarEmail: calendarToken.calendarEmail,
            expiration: googleExpiration.toISOString(),
          }),
          resource: 'calendar',
          resourceId: channelId,
        },
      });

      console.log('[Calendar Watch] Watch registered:', channelId, 'for user:', user.id);

      return NextResponse.json({
        success: true,
        watch: {
          id: calendarWatch.id,
          channelId,
          resourceId,
          calendarEmail: calendarToken.calendarEmail,
          expiration: googleExpiration,
          status: 'active',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Token refresh failed')) {
        return NextResponse.json(
          { error: 'Calendar token expired and refresh failed. Please reconnect your Google Calendar.' },
          { status: 401 }
        );
      }

      console.error('[Calendar Watch] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to set up calendar push notifications' },
        { status: 500 }
      );
    }
  });
}, 'calendar/watch');

// ── GET: List active watch channels for the user ──────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const watches = await db.calendarWatch.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        watches: watches.map((w) => ({
          id: w.id,
          channelId: w.channelId,
          resourceId: w.resourceId,
          calendarEmail: w.calendarEmail,
          expiration: w.expiration,
          status: w.status,
          createdAt: w.createdAt,
        })),
      });
    } catch (error) {
      console.error('[Calendar Watch] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch calendar watches' },
        { status: 500 }
      );
    }
  });
}, 'calendar/watch');
