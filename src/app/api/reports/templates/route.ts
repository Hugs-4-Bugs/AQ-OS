// ═══════════════════════════════════════════════════════════════════
// GET /api/reports/templates — Get predefined report templates
// Task 7: Return report templates for quick report creation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getReportTemplates } from '@/lib/advanced-reports-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const templates = getReportTemplates(user.id);
      return NextResponse.json({ templates });
    } catch (error) {
      console.error('[GET /api/reports/templates] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch report templates' },
        { status: 500 }
      );
    }
  });
}
