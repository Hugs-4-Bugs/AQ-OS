// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Leads API Routes
// GET /api/leads/hot-leads?leadId=xxx — Get heat score or detect hot leads
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { getLeadHeatScore, detectHotLeads } from '@/lib/hot-lead-detection-service';

// GET /api/leads/hot-leads
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const leadId = searchParams.get('leadId');

      if (leadId) {
        // Get heat score for a single lead
        const result = await getLeadHeatScore(leadId, user.id);

        return NextResponse.json({
          success: true,
          lead: result,
        });
      } else {
        // Detect hot leads across all user's leads
        const result = await detectHotLeads(user.id);

        return NextResponse.json({
          success: true,
          scan: result,
        });
      }
    } catch (error) {
      console.error('[HotLeads API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to detect hot leads';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
