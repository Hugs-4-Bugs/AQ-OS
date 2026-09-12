// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Broadcast Detail API Route
// Phase 10: GET/POST /api/messaging/broadcasts/[id]
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getBroadcast,
  getBroadcastDeliveryStats,
  startBroadcast,
  pauseBroadcast,
  cancelBroadcast,
} from '@/lib/broadcast-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const url = new URL(request.url);
      const includeStats = url.searchParams.get('stats') === 'true';

      const broadcast = await getBroadcast(id, user.id);
      if (!broadcast) {
        return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
      }

      const response: Record<string, unknown> = {
        success: true,
        data: broadcast,
      };

      if (includeStats) {
        const stats = await getBroadcastDeliveryStats(id, user.id);
        response.stats = stats;
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error('Broadcast GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to get broadcast' },
        { status: 500 }
      );
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const action = body.action; // 'start' | 'pause' | 'cancel'

      switch (action) {
        case 'start': {
          const result = await startBroadcast(id, user.id);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            message: 'Broadcast started',
          });
        }

        case 'pause': {
          const result = await pauseBroadcast(id, user.id);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            message: 'Broadcast paused',
          });
        }

        case 'cancel': {
          const result = await cancelBroadcast(id, user.id);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            message: 'Broadcast cancelled',
          });
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action. Use: start, pause, cancel' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('Broadcast POST route error:', error);
      return NextResponse.json(
        { error: 'Failed to process broadcast action' },
        { status: 500 }
      );
    }
  });
}
