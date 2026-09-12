// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/[id]/enrich
// Phase 7: Trigger lead enrichment
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { enrichLead } from '@/lib/lead-enrichment-service';
import { captureWebsiteScreenshot } from '@/lib/screenshot-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const body = await request.json().catch(() => ({}));
      const includeScreenshot = body.includeScreenshot !== false;

      // Run enrichment
      const result = await enrichLead(id, user.id);

      // Optionally run screenshot/website analysis
      if (includeScreenshot && result.success) {
        const screenshotResult = await captureWebsiteScreenshot(id, user.id);
        if (screenshotResult.success) {
          result.fieldsUpdated.push('websiteQuality', 'techStack');
        }
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        leadId: result.leadId,
        fieldsUpdated: result.fieldsUpdated,
      });
    } catch (error) {
      console.error('[API /leads/[id]/enrich] Error:', error);
      return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 });
    }
  });
}
