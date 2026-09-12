// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/pubsub/setup
// Phase 9: Gmail Integration — Setup PubSub Notification
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { setupPubSubNotification } from '@/lib/gmail-pubsub-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { emailAccountId } = body;

      if (!emailAccountId) {
        return NextResponse.json(
          { error: 'emailAccountId is required' },
          { status: 400 }
        );
      }

      const result = await setupPubSubNotification(emailAccountId);

      // Audit log
      await logGmailEvent({
        userId: user.id,
        action: result.success ? 'gmail_pubsub_configured' : 'gmail_sync_error',
        details: result.success
          ? `PubSub configured for account: ${emailAccountId}`
          : `PubSub setup failed for account: ${emailAccountId} — ${result.error}`,
        resourceId: emailAccountId,
        metadata: {
          success: result.success,
          historyId: result.historyId,
          expiration: result.expiration,
          error: result.error,
        },
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        historyId: result.historyId,
        expiration: result.expiration,
      });
    } catch (error) {
      console.error('[Gmail API] PubSub setup error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
        if (customError.statusCode === 429) {
          return NextResponse.json(
            { error: error.message },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: error.message, code: customError.code },
          { status: customError.statusCode }
        );
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
