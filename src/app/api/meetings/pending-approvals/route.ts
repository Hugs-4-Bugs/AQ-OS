// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Pending Approvals API
// GET /api/meetings/pending-approvals — Get pending approvals for user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getPendingApprovals } from '@/lib/meeting/autonomy-engine';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const pendingApprovals = await getPendingApprovals(user.id);

      return NextResponse.json({
        pendingApprovals,
        count: pendingApprovals.length,
      });
    } catch (error) {
      console.error('[Meeting Pending Approvals API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pending approvals' },
        { status: 500 }
      );
    }
  });
}, 'meetings/pending-approvals');
