// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Scan API
// POST /api/leads/hot/scan
// Triggers a manual hot lead scan for the authenticated user
// No credit deduction — uses existing scored data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { scanHotLeads } from '@/lib/hot-lead-service';

function handler(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const result = await scanHotLeads(user.id);

      return NextResponse.json({
        success: true,
        data: {
          scannedAt: result.scannedAt.toISOString(),
          totalLeadsScanned: result.totalLeadsScanned,
          newHotLeadsCount: result.newHotLeads.length,
          heatingUpCount: result.heatingUpLeads.length,
          coolingDownCount: result.coolingDownLeads.length,
          fireCount: result.results.filter((r) => r.temperature === 'fire').length,
          hotCount: result.results.filter((r) => r.temperature === 'hot').length,
          warmCount: result.results.filter((r) => r.temperature === 'warm').length,
          topLeads: result.results.slice(0, 10).map((r) => ({
            leadId: r.leadId,
            leadName: r.leadName,
            temperature: r.temperature,
            heatIndex: r.heatIndex,
            criteria: r.criteria,
            temperatureChange: r.temperatureChange,
          })),
        },
      });
    } catch (error) {
      console.error('[HotLeadScan API] POST failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to scan hot leads';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export const POST = withApiLogging(handler, 'leads/hot/scan');
