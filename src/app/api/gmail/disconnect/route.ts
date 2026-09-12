// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/disconnect
// Phase 9: Gmail Integration — Disconnect Gmail Account
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { disconnectAccount } from '@/lib/gmail-oauth-service';
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

      await disconnectAccount(emailAccountId, user.id);

      // Audit log
      await logGmailEvent({
        userId: user.id,
        action: 'gmail_disconnected',
        details: `Gmail account disconnected: ${emailAccountId}`,
        resourceId: emailAccountId,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[Gmail API] Disconnect error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
        if (customError.statusCode === 429) {
          return NextResponse.json(
            { error: error.message },
            { status: 429 }
          );
        }
        if (customError.statusCode === 403) {
          return NextResponse.json(
            { error: error.message, code: customError.code },
            { status: 403 }
          );
        }
        if (customError.statusCode === 404) {
          return NextResponse.json(
            { error: error.message, code: customError.code },
            { status: 404 }
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
