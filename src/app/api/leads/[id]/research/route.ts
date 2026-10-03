// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Website Research API (spec §5)
// POST /api/leads/[id]/research — run deep website research now
// GET  /api/leads/[id]/research — latest stored research report
//
// Owner-scoped like every other lead subresource: the lead must belong to
// the authenticated user. POST charges the standard research credit cost
// (same as deep_analysis) and refunds on unexpected failure.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { runWebsiteResearch, getLatestWebsiteResearch } from '@/lib/lead-discovery/website-researcher';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const { businessProfileId, requestId } = (body ?? {}) as {
        businessProfileId?: string | null;
        requestId?: string | null;
      };

      const result = await runWebsiteResearch(id, user.id, {
        businessProfileId: businessProfileId ?? null,
        // Operation identity from the client: one click = one chargeable
        // research run; a replayed request dedupes on the ledger key.
        idempotencyKey:
          typeof requestId === 'string' && requestId.trim()
            ? requestId.trim().substring(0, 120)
            : null,
      });

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research failed';
      const status = message.includes('not found') ? 404
        : message.includes('Insufficient credits') ? 402
        : message.includes('no website') ? 400
        : 500;
      console.error('[LeadResearch] run failed:', message);
      return NextResponse.json({ error: message }, { status });
    }
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const latest = await getLatestWebsiteResearch(id, user.id);
      if (!latest) {
        return NextResponse.json({ research: null });
      }
      return NextResponse.json({
        research: {
          id: latest.id,
          status: latest.status,
          report: latest.reportJson ? JSON.parse(latest.reportJson) : null,
          contacts: latest.contactsJson ? JSON.parse(latest.contactsJson) : [],
          pagesFetched: latest.pagesFetched ? JSON.parse(latest.pagesFetched) : [],
          createdAt: latest.createdAt,
        },
      });
    } catch (error) {
      console.error('[LeadResearch] fetch failed:', error);
      return NextResponse.json({ error: 'Failed to load research' }, { status: 500 });
    }
  });
}
