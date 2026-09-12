// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/credits/history
// Returns paginated credit transaction history with filters
// Requires billing:read permission
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { getUsageHistory } from '@/lib/usage-service';

export async function GET(request: NextRequest) {
  return withPermission(request, 'billing:read', async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
      const action = searchParams.get('action') || undefined;
      const startDateStr = searchParams.get('startDate');
      const endDateStr = searchParams.get('endDate');

      const startDate = startDateStr ? new Date(startDateStr) : undefined;
      const endDate = endDateStr ? new Date(endDateStr) : undefined;

      // Validate dates if provided
      if (startDateStr && isNaN(startDate!.getTime())) {
        return NextResponse.json(
          { error: 'Invalid startDate format. Use ISO 8601 (e.g., 2024-01-01).' },
          { status: 400 }
        );
      }
      if (endDateStr && isNaN(endDate!.getTime())) {
        return NextResponse.json(
          { error: 'Invalid endDate format. Use ISO 8601 (e.g., 2024-12-31).' },
          { status: 400 }
        );
      }

      const offset = (page - 1) * limit;

      const result = await getUsageHistory(user.id, {
        limit,
        offset,
        action,
        startDate,
        endDate,
      });

      return NextResponse.json({
        entries: result.entries.map((entry) => ({
          id: entry.id,
          action: entry.action,
          credits: entry.credits,
          balance: entry.balance,
          description: entry.description,
          referenceId: entry.referenceId,
          createdAt: entry.createdAt.toISOString(),
        })),
        pagination: {
          page,
          limit,
          total: result.total,
          hasMore: result.hasMore,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      console.error('[API] Failed to get credit history:', error);
      return NextResponse.json(
        { error: 'Failed to get credit history' },
        { status: 500 }
      );
    }
  });
}
