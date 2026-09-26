import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  addTicketMessage,
  SupportValidationError,
  SupportNotFoundError,
} from '@/lib/support-service';

function ticketIdFromUrl(request: NextRequest): string {
  // /api/support/tickets/<id>/messages
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 2] || '';
}

// ─── POST /api/support/tickets/[id]/messages — reply ────────────────
// Users may reply only to their OWN tickets. Staff replies may include
// isInternal (support notes); the flag is IGNORED for normal users.

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const id = ticketIdFromUrl(request);
      // Platform staff = super_admin only (support tickets are platform-
      // level data; org roles are tenant-scoped and insufficient).
      const isStaff = user.role === 'super_admin';
      const body = await request.json().catch(() => ({}));
      const { content, isInternal } = body as Record<string, unknown>;

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      if (!isStaff && ticket.userId !== user.id) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      const message = await addTicketMessage({
        ticketId: id,
        authorId: user.id,
        authorRole: isStaff ? 'admin' : 'user',
        content: String(content || ''),
        isInternal: isStaff ? !!isInternal : false,
      });

      return NextResponse.json(
        {
          message: {
            id: message.id,
            content: message.content,
            isInternal: message.isInternal,
            createdAt: message.createdAt,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof SupportValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof SupportNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      console.error('[Support] add message error:', err);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }
  });
}

// ─── GET /api/support/tickets/[id]/messages — conversation ──────────
// Owner (or admin) only. Internal notes excluded for normal users.

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const id = ticketIdFromUrl(request);
      const isStaff = user.role === 'super_admin';

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!ticket || (!isStaff && ticket.userId !== user.id)) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      const messages = await db.supportTicketMessage.findMany({
        where: { ticketId: id, ...(isStaff ? {} : { isInternal: false }) },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          authorId: true,
          authorRole: true,
          content: true,
          isInternal: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ messages });
    } catch (err) {
      console.error('[Support] list messages error:', err);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }
  });
}
