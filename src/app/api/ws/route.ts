// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Server-Sent Events (SSE) Real-Time Endpoint
// Phase 7: Real-Time Updates for Leads, Deals, Notifications
//
// Since Next.js App Router doesn't support WebSocket upgrades natively,
// we use SSE as the primary real-time transport. The client uses
// EventSource API which auto-reconnects and supports event IDs.
// ═══════════════════════════════════════════════════════════════════

import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PING_INTERVAL = 15_000; // 15 seconds

export async function GET(request: Request) {
  // ── Authenticate ──────────────────────────────────────────────
  let user;
  try {
    user = await requireAuth(request);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Setup SSE Stream ──────────────────────────────────────────
  const encoder = new TextEncoder();
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object, id?: string) => {
        const lines: string[] = [];
        if (id) lines.push(`id: ${id}`);
        lines.push(`event: ${event}`);
        lines.push(`data: ${JSON.stringify(data)}`);
        lines.push('');
        lines.push('');
        controller.enqueue(encoder.encode(lines.join('\n')));
      };

      // ── Send initial connection event ─────────────────────────
      send('connection:established', {
        type: 'connection:established',
        userId,
        timestamp: new Date().toISOString(),
        message: 'Real-time connection established',
      });

      // ── Periodic ping to keep connection alive ────────────────
      const pingTimer = setInterval(() => {
        try {
          send('ping', {
            type: 'ping',
            timestamp: new Date().toISOString(),
          });
        } catch {
          clearInterval(pingTimer);
        }
      }, PING_INTERVAL);

      // ── Cleanup on abort ──────────────────────────────────────
      // When client disconnects, the AbortController will be signaled
      const abortHandler = () => {
        clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      // Store cleanup for the stream's cancel handler
      (stream as any)._cleanup = abortHandler;
    },
    cancel() {
      const cleanup = (stream as any)._cleanup;
      if (cleanup) cleanup();
    },
  });

  // ── Return SSE Response ───────────────────────────────────────
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

// ── Handle CORS preflight ───────────────────────────────────────
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}
