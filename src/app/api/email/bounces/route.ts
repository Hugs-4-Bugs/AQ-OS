// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Bounces API Route
// Phase 9: Get bounce intelligence data and handle bounce events
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { handleBounceEvent, getBounceIntelligence, getUserBounceSummary, shouldSuppressAddress, trackBouncePattern } from '@/lib/bounce-intelligence';

/**
 * GET /api/email/bounces — Get bounce intelligence data
 *
 * Query params:
 *   - email: Get intelligence for a specific email address
 *   - domain: Get bounce pattern for a domain
 *   - summary: Get user's overall bounce summary (default if no other param)
 *   - check: Check if an email address should be suppressed
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const email = searchParams.get('email');
      const domain = searchParams.get('domain');
      const check = searchParams.get('check');

      // Check if an email should be suppressed
      if (check) {
        const result = await shouldSuppressAddress(check);
        return NextResponse.json({
          email: check,
          suppress: result.suppress,
          reason: result.reason,
        });
      }

      // Get intelligence for a specific email address
      if (email) {
        const intelligence = await getBounceIntelligence(email);
        return NextResponse.json(intelligence);
      }

      // Get bounce pattern for a domain
      if (domain) {
        const pattern = await trackBouncePattern(domain);
        return NextResponse.json(pattern);
      }

      // Default: return user's overall bounce summary
      const summary = await getUserBounceSummary(user.id);
      return NextResponse.json(summary);
    } catch (error) {
      console.error('[BouncesAPI] GET error:', error);
      return NextResponse.json({ error: 'Failed to get bounce intelligence' }, { status: 500 });
    }
  });
}

/**
 * POST /api/email/bounces — Handle a bounce event
 *
 * Body:
 *   - email: The bounced email address
 *   - bounceReason: The bounce reason message
 *   - leadId: (optional) Associated lead ID
 *   - messageId: (optional) Associated message ID
 *   - smtpCode: (optional) SMTP status code
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { email, bounceReason, leadId, messageId, smtpCode } = body;

      if (!email || !bounceReason) {
        return NextResponse.json(
          { error: 'Missing required fields: email, bounceReason' },
          { status: 400 }
        );
      }

      const result = await handleBounceEvent({
        userId: user.id,
        email,
        bounceReason,
        leadId,
        messageId,
        smtpCode,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        classification: result.classification,
        isSuppressed: result.isSuppressed,
      }, { status: 201 });
    } catch (error) {
      console.error('[BouncesAPI] POST error:', error);
      return NextResponse.json({ error: 'Failed to handle bounce event' }, { status: 500 });
    }
  });
}
