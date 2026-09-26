import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  changeTicketStatus,
  updateTicketPriority,
  assignTicket,
  SupportValidationError,
  SupportNotFoundError,
} from '@/lib/support-service';

// Route param helper — /api/support/tickets/<id>
function ticketIdFromUrl(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

// ─── GET /api/support/tickets/[id] — ticket detail + conversation ───
// AUTHORIZATION (server-enforced): the ticket is returned ONLY when the
// authenticated user owns it. Admin/staff roles may read any ticket and
// additionally see internal support notes — normal users NEVER do.

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const id = ticketIdFromUrl(request);
      // Platform staff = super_admin only (support tickets are platform-
      // level data; org roles are tenant-scoped and insufficient).
      const isStaff = user.role === 'super_admin';

      const ticket = await db.supportTicket.findUnique({
        where: { id },
        include: {
          messages: isStaff
            ? { orderBy: { createdAt: 'asc' } }
            : { where: { isInternal: false }, orderBy: { createdAt: 'asc' } },
          statusLog: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!ticket) {
        // 404 for both "does not exist" and "not yours" — does not leak
        // the existence of other users' tickets.
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      if (!isStaff && ticket.userId !== user.id) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      // Owner display name for staff views.
      let owner: { id: string; name: string; email: string } | null = null;
      if (isStaff) {
        const u = await db.user.findUnique({
          where: { id: ticket.userId },
          select: { id: true, name: true, email: true },
        });
        owner = u;
      }

      const assignee = ticket.assignedTo
        ? await db.user.findUnique({
            where: { id: ticket.assignedTo },
            select: { id: true, name: true, email: true },
          })
        : null;

      return NextResponse.json({
        ticket: {
          ...ticket,
          owner,
          assignedToName: assignee ? assignee.name || assignee.email : null,
        },
      });
    } catch (err) {
      console.error('[Support] ticket detail error:', err);
      return NextResponse.json({ error: 'Failed to load ticket' }, { status: 500 });
    }
  });
}

// ─── PATCH /api/support/tickets/[id] ────────────────────────────────
// User (owner only): close / reopen their own ticket.
// Admin/staff: change status, priority, assignment.

export async function PATCH(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const id = ticketIdFromUrl(request);
      // Platform staff = super_admin only (see GET above).
      const isStaff = user.role === 'super_admin';
      const body = await request.json().catch(() => ({}));
      const { status, priority, assignedTo, note } = body as Record<string, unknown>;

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

      let updated: { id: string; status?: string; priority?: string } | null = null;

      if (status) {
        updated = await changeTicketStatus({
          ticketId: id,
          newStatus: String(status),
          changedBy: user.id,
          changedByRole: isStaff ? 'admin' : 'user',
          note: note ? String(note) : null,
        });
      }

      if (priority && isStaff) {
        updated = await updateTicketPriority({ ticketId: id, priority: String(priority) });
      }

      if (assignedTo !== undefined && isStaff) {
        // 'me' resolves to the calling admin (used by the admin console
        // "Assign to me" action).
        const assigneeId = assignedTo === null ? null : assignedTo === 'me' ? user.id : String(assignedTo);
        updated = await assignTicket({
          ticketId: id,
          assigneeId,
          assignedBy: user.id,
        });
      }

      if (!updated) {
        return NextResponse.json(
          { error: 'Nothing to update. Provide status, priority or assignedTo.' },
          { status: 400 },
        );
      }

      const fresh = await db.supportTicket.findUnique({
        where: { id },
        select: { id: true, status: true, priority: true, assignedTo: true, updatedAt: true },
      });
      return NextResponse.json({ ticket: fresh });
    } catch (err) {
      if (err instanceof SupportValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof SupportNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      console.error('[Support] ticket patch error:', err);
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }
  });
}
