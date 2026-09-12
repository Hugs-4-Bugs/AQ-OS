// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Send API Route
// POST /api/outreach/send
//
// Generates a personalized AI email and sends it to a lead.
// Uses generateAndSendOutreach from lead-discovery/outreach-sender.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import { generateAndSendOutreach } from '@/lib/lead-discovery/outreach-sender';

/**
 * POST /api/outreach/send
 *
 * Body: { leadId: string }
 *
 * Generates a personalized AI outreach email for the given lead,
 * sends it, updates the lead status, creates activity/audit records,
 * and dispatches notifications.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();

      if (!body.leadId || typeof body.leadId !== 'string' || !body.leadId.trim()) {
        return NextResponse.json(
          { error: 'leadId is required' },
          { status: 400 }
        );
      }

      const result = await generateAndSendOutreach(body.leadId.trim(), user.id);

      if (!result.success) {
        const statusCode = result.error?.includes('Insufficient credits')
          ? 402
          : result.error?.includes('not found')
            ? 404
            : result.error?.includes('no email')
              ? 400
              : 500;

        return NextResponse.json(
          { error: result.error, success: false },
          { status: statusCode }
        );
      }

      return NextResponse.json({
        success: true,
        emailId: result.emailId,
        subject: result.subject,
        creditsDeducted: result.creditsDeducted,
        newCreditBalance: result.newCreditBalance,
      });
    } catch (error) {
      console.error('[OutreachSendAPI] Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate and send outreach email' },
        { status: 500 }
      );
    }
  });
}
