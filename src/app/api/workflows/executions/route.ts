// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Executions API Route
// Phase 12: List execution history with pagination and filters
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getExecutionHistory } from '@/lib/workflow-engine';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const filters = {
        status: searchParams.get('status') || undefined,
        workflowId: searchParams.get('workflowId') || undefined,
        dateFrom: searchParams.get('dateFrom') || undefined,
        dateTo: searchParams.get('dateTo') || undefined,
        // Server-side search (workflow name or run error text) — the UI's
        // search box now filters in the database, not the client.
        search: searchParams.get('search') || undefined,
        page: parseInt(searchParams.get('page') || '1', 10),
        limit: parseInt(searchParams.get('limit') || '20', 10),
      };

      const result = await getExecutionHistory(user.id, filters);
      return NextResponse.json(result);
    } catch (error) {
      console.error('[WorkflowExecutionsAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch execution history' },
        { status: 500 }
      );
    }
  });
}
