// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — SSE Endpoint for Workflow Events
// Phase 12: GET /api/events/workflows
//
// Authentication: Requires valid JWT or session cookie (enforced by getAuthUser).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createSSEConnection, sendSSEEvent } from '@/lib/sse-manager';
import { subscribeToChannel, unsubscribeFromChannel, replayEvents } from '@/lib/realtime-event-bus';
import { persistEvent } from '@/lib/replay-persistence';
import { trackConnection, trackDisconnection } from '@/lib/realtime-observability';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time workflow events.
 * Events: workflow_started, workflow_completed, workflow_failed,
 *         workflow_paused, workflow_resumed, workflow_retried,
 *         workflow_step_completed, workflow_step_failed
 *
 * Headers: Last-Event-ID (for reconnection replay)
 */
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

    // Create SSE connection
    const connection = createSSEConnection(userId, 'workflow_events', writer, lastEventId);

    // Track for observability
    trackConnection('sse', userId, connection.id);

    // Subscribe to workflow events on the event bus
    const subId = subscribeToChannel('workflow_events', async (event) => {
      try {
        await sendSSEEvent(connection, {
          id: event.id,
          event: event.eventType,
          data: event.payload,
        });

        // Persist for replay
        await persistEvent(event);
      } catch (err) {
        console.error('[SSE workflow_events] Failed to send event:', err);
      }
    }, (event) => {
      // Filter: only events for this user
      if (event.userId && event.userId !== userId) return false;
      return true;
    });

    // Send initial connection event
    await sendSSEEvent(connection, {
      id: `wf_conn_${Date.now()}`,
      event: 'connected',
      data: {
        message: 'Connected to workflow events stream',
        connectionId: connection.id,
        events: [
          'workflow_started',
          'workflow_completed',
          'workflow_failed',
          'workflow_paused',
          'workflow_resumed',
          'workflow_retried',
          'workflow_step_completed',
          'workflow_step_failed',
        ],
      },
    });

    // Replay missed events if reconnecting
    if (lastEventId) {
      const missed = replayEvents('workflow_events', {
        userId,
        limit: 100,
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
          console.error('[SSE workflow_events] Failed to replay event:', err);
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
    console.error('[SSE workflow_events] Route error:', error);
    return new Response('event: error\ndata: {"message":"Internal server error"}\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
