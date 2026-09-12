// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/connect
// Phase 9: Gmail Integration — Generate OAuth URL
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { generateAuthUrl } from '@/lib/gmail-oauth-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { url, state } = generateAuthUrl(user.id);

      // Audit log
      await logGmailEvent({
        userId: user.id,
        action: 'gmail_auth_url_generated',
        details: 'Gmail OAuth URL generated',
        metadata: { state },
      });

      return NextResponse.json({ authUrl: url, state });
    } catch (error) {
      console.error('[Gmail API] Connect error:', error);

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
