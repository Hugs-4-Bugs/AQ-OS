// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/threads
// Phase 9: Gmail Integration — List Email Threads
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getThreads } from '@/lib/gmail-inbox-service';
import { getConnectedAccounts } from '@/lib/gmail-oauth-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const emailAccountId = searchParams.get('emailAccountId');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
      const query = searchParams.get('query') || undefined;
      const labelIdsParam = searchParams.get('labelIds');
      const labelIds = labelIdsParam ? labelIdsParam.split(',') : undefined;

      if (!emailAccountId) {
        return NextResponse.json(
          { error: 'emailAccountId is required' },
          { status: 400 }
        );
      }

      // Verify the account belongs to the user
      const accounts = await getConnectedAccounts(user.id);
      const account = accounts.find(a => a.id === emailAccountId);
      if (!account) {
        return NextResponse.json(
          { error: 'Email account not found or not accessible' },
          { status: 404 }
        );
      }

      const result = await getThreads(emailAccountId, {
        page,
        limit,
        query,
        labelIds,
      });

      return NextResponse.json({
        threads: result.threads,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      console.error('[Gmail API] Threads error:', error);

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
