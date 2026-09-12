// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST/GET /api/payments/webhook-replay
// Replay failed webhook events or list replayable failed webhooks
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { replayWebhook, replayFailedWebhooks, getWebhookReplayStatus } from '@/lib/webhook-replay-service';

// GET: List replayable failed webhooks
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Only allow admin/owner access
      if (!['owner', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Admin access required to view webhook replay status' },
          { status: 403 }
        );
      }

      const { searchParams } = new URL(request.url);
      const provider = searchParams.get('provider') as 'stripe' | 'razorpay' | null;
      const processed = searchParams.get('processed');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await getWebhookReplayStatus({
        provider: provider || undefined,
        processed: processed !== null ? processed === 'true' : undefined,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        webhooks: result.webhooks,
        total: result.total,
      });
    } catch (error) {
      console.error('[API] Webhook replay GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get webhook replay status' },
        { status: 500 }
      );
    }
  });
}

// POST: Replay a failed webhook event or batch replay
interface WebhookReplayRequestBody {
  eventId?: string;
  batchReplay?: boolean;
  provider?: 'stripe' | 'razorpay';
  limit?: number;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Only allow admin/owner access
      if (!['owner', 'admin', 'super_admin'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Admin access required to replay webhooks' },
          { status: 403 }
        );
      }

      const body = (await request.json()) as WebhookReplayRequestBody;
      const { eventId, batchReplay, provider, limit } = body;

      if (batchReplay) {
        // Batch replay all failed webhooks
        const result = await replayFailedWebhooks({
          provider: provider || undefined,
          limit: limit || 50,
        });

        return NextResponse.json({
          success: true,
          total: result.total,
          replayed: result.replayed,
          succeeded: result.succeeded,
          failed: result.failed,
          errors: result.errors,
        });
      }

      if (!eventId) {
        return NextResponse.json(
          { error: 'Event ID is required for single webhook replay, or set batchReplay to true' },
          { status: 400 }
        );
      }

      // Replay a single webhook event
      const result = await replayWebhook(eventId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Webhook replay failed' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        eventId: result.eventId,
        processed: result.processed,
      });
    } catch (error) {
      console.error('[API] Webhook replay POST error:', error);
      return NextResponse.json(
        { error: 'Failed to replay webhook' },
        { status: 500 }
      );
    }
  });
}
