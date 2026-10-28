// GET /api/outreach/messages — list outreach messages for the authenticated user
// Returns OutreachMessage rows with accurate delivery state (draft, approval_required,
// queued, sending, provider_accepted, sent, delivered, opened, replied, bounced,
// failed, rejected, rate_limited, retrying, cancelled, provider_blocked).
// Optional filters: ?leadId=, ?status=, ?channel=, ?limit=50
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const leadId = searchParams.get('leadId');
      const status = searchParams.get('status');
      const channel = searchParams.get('channel');
      const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
      const where: Record<string, unknown> = { userId: user.id };
      if (leadId) where.leadId = leadId;
      if (status) where.status = status;
      if (channel) where.channel = channel;
      let rows: unknown[] = [];
      try {
        rows = await db.outreachMessage.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
      } catch {
        return NextResponse.json({ messages: [], total: 0 });
      }
      return NextResponse.json({ messages: rows, total: rows.length });
    } catch (e) {
      return NextResponse.json({ messages: [], total: 0, error: e instanceof Error ? e.message : 'unknown' });
    }
  });
}
