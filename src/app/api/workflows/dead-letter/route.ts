// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Dead Letter Queue API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { listDeadLetter, purgeDeadLetter } from '@/lib/workflow-dlq';
import { getDeadLetterStats } from '@/lib/workflow-metrics';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';

/** GET /api/workflows/dead-letter — List dead letter queue entries */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const url = new URL(request.url);
      const filters = {
        page: parseInt(url.searchParams.get('page') || '1', 10),
        limit: parseInt(url.searchParams.get('limit') || '20', 10),
      };

      const includeStats = url.searchParams.get('includeStats') === 'true';

      const result = await listDeadLetter(user.id, filters);

      if (includeStats) {
        const stats = await getDeadLetterStats(user.id);
        return NextResponse.json({ ...result, stats });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('[Workflows API] Dead Letter GET error:', error);
      return NextResponse.json(
        { error: 'Failed to list dead letter entries' },
        { status: 500 }
      );
    }
  });
}

/** DELETE /api/workflows/dead-letter — Purge all dead letter entries */
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user) => {
    const gate = await checkPlanEntitlement(user.id, user.plan, 'workflow_access');
    if (!gate.allowed) return gate.response!;
    try {
      const result = await purgeDeadLetter(user.id);
      return NextResponse.json(result);
    } catch (error) {
      console.error('[Workflows API] Dead Letter DELETE error:', error);
      return NextResponse.json(
        { error: 'Failed to purge dead letter entries' },
        { status: 500 }
      );
    }
  });
}
