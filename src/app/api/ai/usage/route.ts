// ═══════════════════════════════════════════════════════════════════
// GET /api/ai/usage — AI usage history and summary
// Phase 8: AI Usage API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getAIUsageHistory, getAIUsageSummary } from '@/lib/ai/ai-provider';
import { bulkCreditCheck } from '@/lib/ai/credit-enforcement';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action') || 'summary';
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      if (action === 'history') {
        const history = getAIUsageHistory({
          userId: user.id,
          limit,
          offset,
        });

        return NextResponse.json({
          success: true,
          history,
          total: history.length,
        });
      }

      if (action === 'credits') {
        const creditCheck = await bulkCreditCheck(user.id);
        return NextResponse.json({
          success: true,
          credits: creditCheck,
        });
      }

      // Default: summary
      const summary = getAIUsageSummary(user.id);
      const creditCheck = await bulkCreditCheck(user.id);

      return NextResponse.json({
        success: true,
        usage: summary,
        credits: creditCheck,
      });
    } catch (error) {
      console.error('[API /ai/usage] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get AI usage' },
        { status: 500 }
      );
    }
  });
}
