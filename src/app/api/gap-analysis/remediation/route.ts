// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gap Remediation Plan API
// GET: Get prioritized remediation steps for closing gaps
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getGapRemediationPlan } from '@/lib/competitive-gap-analysis-service';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const competitorId = searchParams.get('competitorId') || undefined;

      const plan = await getGapRemediationPlan(user.id, competitorId);

      return NextResponse.json({
        success: true,
        data: {
          steps: plan,
          totalSteps: plan.length,
          criticalSteps: plan.filter(s =>
            s.effortToClose === 'high' && s.estimatedImpact === 'high'
          ).length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load remediation plan';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}, 'gap-analysis/remediation');
