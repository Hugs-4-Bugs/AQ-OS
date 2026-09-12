// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/status
// Phase 9: Gmail Integration — Gmail Connection Status
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getConnectedAccounts } from '@/lib/gmail-oauth-service';
import { cacheGet, CachePrefix } from '@/lib/gmail-cache-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const accounts = await getConnectedAccounts(user.id);
      const activeAccounts = accounts.filter(a => a.isActive);
      const connected = activeAccounts.length > 0;

      // Get last sync time from the most recently polled account
      const lastSyncAt = activeAccounts.length > 0
        ? activeAccounts
            .filter(a => a.lastPollAt)
            .sort((a, b) => {
              const aTime = a.lastPollAt ? new Date(a.lastPollAt).getTime() : 0;
              const bTime = b.lastPollAt ? new Date(b.lastPollAt).getTime() : 0;
              return bTime - aTime;
            })[0]?.lastPollAt?.toISOString() || null
        : null;

      // Check if any account has PubSub configured
      const pubSubEnabled = activeAccounts.some(a => a.pubSubConfigured);

      // Check sync status from cache
      let syncStatus = 'idle';
      for (const account of activeAccounts) {
        const syncCache = cacheGet<{ inProgress: boolean }>(
          `${CachePrefix.SYNC_STATUS}${account.id}`
        );
        if (syncCache?.inProgress) {
          syncStatus = 'syncing';
          break;
        }
      }

      return NextResponse.json({
        connected,
        accounts: accounts.length,
        activeAccounts: activeAccounts.length,
        lastSyncAt,
        pubSubEnabled,
        syncStatus,
      });
    } catch (error) {
      console.error('[Gmail API] Status error:', error);

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
