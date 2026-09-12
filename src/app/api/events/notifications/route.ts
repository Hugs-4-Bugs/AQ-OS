/**
 * SSE endpoint for notification events
 * GET /api/events/notifications
 *
 * Authentication: Requires valid JWT or session cookie (enforced by withAuth).
 */
import { NextRequest } from 'next/server';
import { createSSEConnection, sendSSEEvent } from '@/lib/sse-manager';
import { subscribeToChannel, unsubscribeFromChannel, replayEvents } from '@/lib/realtime-event-bus';
import { persistEvent } from '@/lib/replay-persistence';
import { trackConnection, trackDisconnection } from '@/lib/realtime-observability';
import { getAuthUser } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user from JWT cookie or Authorization header
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    const userId = user.id;
    const lastEventId = request.headers.get('Last-Event-ID') || undefined;

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Create SSE connection
    const connection = createSSEConnection(userId, 'notification_events', writer, lastEventId);

    // Track connection for observability
    trackConnection('sse', userId, connection.id);

    // Subscribe to notification events on the event bus
    const subId = subscribeToChannel('notification_events', async (event) => {
      try {
        await sendSSEEvent(connection, {
          id: event.id,
          event: event.eventType,
          data: event.payload,
        });

        // Persist for replay
        await persistEvent(event);
      } catch (err) {
        console.error('[SSE notification_events] Failed to send event:', err);
      }
    }, (event) => {
      // Filter: only events for this user or org
      if (event.userId && event.userId !== userId) return false;
      return true;
    });

    // Send initial connection event
    await sendSSEEvent(connection, {
      id: `conn_${Date.now()}`,
      event: 'connected',
      data: { message: 'Connected to notification events stream', connectionId: connection.id },
    });

    // If Last-Event-ID provided, replay missed events
    if (lastEventId) {
      const missed = replayEvents('notification_events', {
        userId,
        limit: 50,
      });

      for (const event of missed) {
        if (event.id === lastEventId) continue;
        try {
          await sendSSEEvent(connection, {
            id: event.id,
            event: event.eventType,
            data: event.payload,
          });
        } catch (err) {
          console.error('[SSE notification_events] Failed to replay event:', err);
          break;
        }
      }
    }

    // Handle connection close
    const handleClose = () => {
      unsubscribeFromChannel(subId);
      trackDisconnection(connection.id);
    };

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[SSE notification_events] Route error:', error);
    return new Response('event: error\ndata: {"message":"Internal server error"}\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
