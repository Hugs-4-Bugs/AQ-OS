/**
 * Recover missed events after offline period
 * POST /api/realtime/recover
 */
import { NextRequest, NextResponse } from 'next/server';
import { recoverMissedEvents, trackUserActivity } from '@/lib/offline-recovery';
import { type EventChannel } from '@/lib/realtime-event-bus';

export const dynamic = 'force-dynamic';

const VALID_CHANNELS: EventChannel[] = [
  'lead_events',
  'payment_events',
  'notification_events',
  'message_events',
  'workflow_events',
  'ai_events',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, orgId, sinceTimestamp, channels } = body as {
      userId?: string;
      orgId?: string;
      sinceTimestamp?: number;
      channels?: string[];
    };

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 },
      );
    }

    // Validate channels if provided
    let validatedChannels: EventChannel[] | undefined;
    if (channels && Array.isArray(channels)) {
      validatedChannels = channels.filter((ch): ch is EventChannel =>
        VALID_CHANNELS.includes(ch as EventChannel),
      );
      if (validatedChannels.length === 0) {
        return NextResponse.json(
          { error: 'No valid channels provided', validChannels: VALID_CHANNELS },
          { status: 400 },
        );
      }
    }

    // Track user as back online
    trackUserActivity(userId);

    // Recover missed events
    const result = await recoverMissedEvents(userId, {
      orgId,
      sinceTimestamp,
      channels: validatedChannels,
    });

    return NextResponse.json({
      success: true,
      recovery: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RealtimeRecover] Error:', error);
    return NextResponse.json(
      { error: 'Recovery failed', message: String(error) },
      { status: 500 },
    );
  }
}
