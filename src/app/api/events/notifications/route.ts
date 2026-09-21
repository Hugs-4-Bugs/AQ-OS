/**
 * SSE endpoint for notification events
 * GET /api/events/notifications
 *
 * Authentication: Requires valid JWT or session cookie (getAuthUser).
 *
 * Transport note: uses a ReadableStream + controller.enqueue() and writes
 * the first event inside start(). The previous TransformStream +
 * getWriter().write()-before-return pattern never flushed in this Next.js
 * dev runtime (client received 0 bytes / headers never sent — verified by a
 * minimal probe route; ReadableStream start/enqueue streams immediately),
 * which is why live notification delivery silently never worked here.
 */
import { NextRequest } from 'next/server';
import { createSSEConnection, sendSSEEvent, closeSSEConnection } from '@/lib/sse-manager';
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

    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    let connectionId: string | null = null;
    let subId: string | null = null;
    let cleanedUp = false;

    const encoder = new TextEncoder();

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (subId) unsubscribeFromChannel(subId);
      if (connectionId) {
        closeSSEConnection(connectionId);
        trackDisconnection(connectionId);
      }
      try {
        controllerRef?.close();
      } catch {
        // already closed
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controllerRef = controller;

        // createSSEConnection expects a WritableStreamDefaultWriter; provide a
        // minimal shim that routes encoded chunks through the controller so
        // the shared sse-manager (heartbeats, activity tracking, event
        // formatting) stays untouched.
        const writerShim = {
          write: async (chunk: Uint8Array) => {
            controller.enqueue(chunk);
          },
        } as unknown as WritableStreamDefaultWriter<Uint8Array>;

        // Create SSE connection
        const connection = createSSEConnection(userId, 'notification_events', writerShim, lastEventId);
        connectionId = connection.id;

        // Track connection for observability
        trackConnection('sse', userId, connection.id);

        // Subscribe to notification events on the event bus
        subId = subscribeToChannel('notification_events', async (event) => {
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

        // Handle client disconnect — previously the cleanup handler existed
        // but was never registered, leaking bus subscriptions.
        if (request.signal.aborted) {
          cleanup();
        } else {
          request.signal.addEventListener('abort', cleanup);
        }
      },
      cancel() {
        cleanup();
      },
    });

    // Return SSE response
    return new Response(stream, {
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
