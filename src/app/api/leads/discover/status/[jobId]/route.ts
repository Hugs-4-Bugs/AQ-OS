// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/leads/discover/status/[jobId]
// Phase 7: Get discovery job status and results
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getDiscoveryJobStatus } from '@/lib/lead-discovery-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { jobId } = await params;

      if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
      }

      const job = await getDiscoveryJobStatus(jobId, user.id);

      if (!job) {
        return NextResponse.json({ error: 'Discovery job not found' }, { status: 404 });
      }

      return NextResponse.json({ job });
    } catch (error) {
      console.error('[API /leads/discover/status] Error:', error);
      return NextResponse.json({ error: 'Failed to get job status' }, { status: 500 });
    }
  });
}
