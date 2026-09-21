/**
 * Recover missed events after offline period
 * POST /api/realtime/recover
 *
 * ACCOUNT ISOLATION: the recovered identity is ALWAYS the authenticated
 * session user. The previous unauthenticated version took userId from the
 * request body and replayed ANY user's missed events (leads, payments,
 * notifications, messages, workflows, AI) to the caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
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
  return withAuth(request, async (authUser) => {
  try {
    const body = await request.json();
    const { sinceTimestamp, channels } = body as {
      sinceTimestamp?: number;
      channels?: string[];
    };

    // Trusted identity only — body userId/orgId are ignored.
    const userId = authUser.id;
    const orgId = authUser.orgId ?? undefined;

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
  });
}
