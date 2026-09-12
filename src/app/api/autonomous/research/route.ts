// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Research API
// POST: Research a specific company/lead
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { researchCompany } from '@/lib/autonomous-outreach-engine';
import { checkCreditSufficiency } from '@/lib/credit-service';

const CREDIT_COST_RESEARCH = 3;

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { leadId } = body;

      if (!leadId || typeof leadId !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: leadId' },
          { status: 400 }
        );
      }

      // Check credit sufficiency (3 credits for research)
      const creditCheck = await checkCreditSufficiency(user.id, CREDIT_COST_RESEARCH);
      if (!creditCheck.sufficient) {
        return NextResponse.json(
          {
            error: 'Insufficient credits for research',
            details: {
              required: CREDIT_COST_RESEARCH,
              balance: creditCheck.balance,
              shortfall: creditCheck.shortfall,
            },
          },
          { status: 403 }
        );
      }

      // Perform deep company research
      const result = await researchCompany(leadId, user.id);

      if (!result) {
        return NextResponse.json(
          { error: 'Research failed. Lead may not exist or credits may be insufficient.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        research: result,
      });
    } catch (error) {
      console.error('[AutonomousResearchAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to research company' },
        { status: 500 }
      );
    }
  });
}
