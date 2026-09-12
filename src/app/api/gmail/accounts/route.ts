// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/accounts
// Phase 9: Gmail Integration — List Connected Accounts
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getConnectedAccounts } from '@/lib/gmail-oauth-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const accounts = await getConnectedAccounts(user.id);

      // Determine active account (most recently polled)
      const activeAccount = accounts.find(a => a.isActive && a.lastPollAt)
        ? accounts
            .filter(a => a.isActive && a.lastPollAt)
            .sort((a, b) => {
              const aTime = a.lastPollAt ? new Date(a.lastPollAt).getTime() : 0;
              const bTime = b.lastPollAt ? new Date(b.lastPollAt).getTime() : 0;
              return bTime - aTime;
            })[0]
        : null;

      // Get user's default email account setting if any
      let activeAccountId: string | null = activeAccount?.id || null;

      // Check if user has a preferred account
      if (!activeAccountId && accounts.length > 0) {
        const firstActive = accounts.find(a => a.isActive);
        activeAccountId = firstActive?.id || accounts[0]?.id || null;
      }

      return NextResponse.json({
        accounts,
        activeAccountId,
      });
    } catch (error) {
      console.error('[Gmail API] Accounts error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
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
