/**
 * SSE endpoint for payment events
 * GET /api/events/payments
 *
 * Authentication: Requires valid JWT or session cookie (enforced by getAuthUser).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSSEConnection, sendSSEEvent } from '@/lib/sse-manager';
import { subscribeToChannel, unsubscribeFromChannel, replayEvents } from '@/lib/realtime-event-bus';
import { persistEvent } from '@/lib/replay-persistence';
import { trackConnection, trackDisconnection } from '@/lib/realtime-observability';
import { getAuthUser } from '@/lib/auth';

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

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const connection = createSSEConnection(userId, 'payment_events', writer, lastEventId);

    trackConnection('sse', userId, connection.id);

    const subId = subscribeToChannel('payment_events', async (event) => {
      try {
        await sendSSEEvent(connection, {
          id: event.id,
          event: event.eventType,
          data: event.payload,
        });
        await persistEvent(event);
      } catch (err) {
        console.error('[SSE payment_events] Failed to send event:', err);
      }
    }, (event) => {
      if (event.userId && event.userId !== userId) return false;
      return true;
    });

    await sendSSEEvent(connection, {
      id: `conn_${Date.now()}`,
      event: 'connected',
      data: { message: 'Connected to payment events stream', connectionId: connection.id },
    });

    if (lastEventId) {
      const missed = replayEvents('payment_events', { userId, limit: 50 });
      for (const event of missed) {
        if (event.id === lastEventId) continue;
        try {
          await sendSSEEvent(connection, {
            id: event.id,
            event: event.eventType,
            data: event.payload,
          });
        } catch (err) {
          console.error('[SSE payment_events] Failed to replay event:', err);
          break;
        }
      }
    }

    const handleClose = () => {
      unsubscribeFromChannel(subId);
      trackDisconnection(connection.id);
    };

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[SSE payment_events] Route error:', error);
    return new Response('event: error\ndata: {"message":"Internal server error"}\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
