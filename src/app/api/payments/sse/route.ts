// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/sse
// Server-Sent Events stream for real-time payment status updates
// Phase 5: Payments System
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createPaymentSSEStream } from '@/lib/payment-sse-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const stream = createPaymentSSEStream(user.id);

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
      });
    } catch (error) {
      console.error('[API] SSE stream error:', error);
      return new NextResponse(
        JSON.stringify({ error: 'Failed to create SSE stream' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });
}
