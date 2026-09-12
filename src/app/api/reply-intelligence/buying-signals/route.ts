// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Reply Intelligence: Buying Signals API Route
// GET /api/reply-intelligence/buying-signals
//
// Returns a summary of leads with detected buying signals, sorted by
// urgency (critical first) and signal count. Includes per-signal
// frequency counts across all leads.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withRequestLogging } from '@/lib/api-request-logger';
import { getBuyingSignalsSummary } from '@/lib/reply-intelligence-service';

export const GET = withRequestLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const summary = await getBuyingSignalsSummary(user.id);

      return NextResponse.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error('[ReplyIntelAPI] GET /buying-signals error:', error);
      return NextResponse.json(
        { error: 'Failed to get buying signals summary' },
        { status: 500 },
      );
    }
  });
}, { service: 'reply-intelligence' });
