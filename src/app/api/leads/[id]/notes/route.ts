// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/POST /api/leads/[id]/notes
// Phase 7: List and add notes for a lead
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // Verify lead exists and user has access
      const lead = await db.lead.findFirst({
        where: { id, isActive: true },
        select: { id: true, userId: true, orgId: true },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      if (lead.userId && lead.userId !== user.id && lead.orgId !== user.orgId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
      const offset = (page - 1) * limit;

      const [notes, total] = await Promise.all([
        db.leadNote.findMany({
          where: { leadId: id },
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        db.leadNote.count({ where: { leadId: id } }),
      ]);

      return NextResponse.json({ notes, total, page, limit });
    } catch (error) {
      console.error('[API /leads/[id]/notes] GET Error:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // Verify lead exists and user has access
      const lead = await db.lead.findFirst({
        where: { id, isActive: true },
        select: { id: true, userId: true, orgId: true },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      if (lead.userId && lead.userId !== user.id && lead.orgId !== user.orgId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const body = await request.json();
      const { content, pinned } = body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json({ error: 'content is required' }, { status: 400 });
      }

      if (content.length > 5000) {
        return NextResponse.json({ error: 'content must be under 5000 characters' }, { status: 400 });
      }

      const note = await db.leadNote.create({
        data: {
          leadId: id,
          userId: user.id,
          content: content.trim(),
          pinned: !!pinned,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return NextResponse.json({ note }, { status: 201 });
    } catch (error) {
      console.error('[API /leads/[id]/notes] POST Error:', error);
      return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
    }
  });
}
