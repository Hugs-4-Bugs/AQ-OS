// GET /api/ai/costs — Get AI cost tracking data
// Updated: Dual auth (JWT OR API Key) + IDOR fix + org isolation

import { NextRequest, NextResponse } from 'next/server';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { getUserSpending, getCostBreakdown, checkBudgetAlert } from '@/lib/ai-cost-tracker';

export async function GET(request: NextRequest) {
  return withDualAuthPermission(request, 'assistant:read', async (user, apiKeyInfo) => {
    try {
      const { searchParams } = new URL(request.url);
      // IDOR fix: use authenticated user's ID, not arbitrary query param
      const userId = user.id;
      const view = searchParams.get('view') || 'spending'; // 'spending', 'breakdown', 'alerts'

      switch (view) {
        case 'spending': {
          const spending = await getUserSpending(userId);
          return NextResponse.json(spending);
        }

        case 'breakdown': {
          const periodStart = searchParams.get('periodStart')
            ? new Date(searchParams.get('periodStart')!)
            : undefined;
          const periodEnd = searchParams.get('periodEnd')
            ? new Date(searchParams.get('periodEnd')!)
            : undefined;

          const breakdown = await getCostBreakdown(userId, periodStart, periodEnd);
          return NextResponse.json(breakdown);
        }

        case 'alerts': {
          const alert = await checkBudgetAlert(userId);
          return NextResponse.json(alert);
        }

        default:
          return NextResponse.json(
            { error: 'Invalid view parameter. Use: spending, breakdown, alerts' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[AI Costs API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get AI cost data' },
        { status: 500 }
      );
    }
  });
}
