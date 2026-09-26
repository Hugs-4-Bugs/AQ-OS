import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  createSupportTicket,
  SupportValidationError,
} from '@/lib/support-service';

// ─── POST /api/support/tickets — create a support ticket ────────────
// Authenticated users only. The ticket belongs to the AUTHENTICATED user
// (never a client-supplied userId). Downgrade requests only create a
// ticket — subscription state is never touched here.

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }

      const {
        category,
        subcategory,
        subject,
        description,
        priority,
        requestedPlan,
        billingCycle,
        source,
        metadata,
      } = body as Record<string, unknown>;

      const ticket = await createSupportTicket({
        userId: user.id,
        category: String(category || ''),
        subcategory: subcategory ? String(subcategory) : null,
        subject: String(subject || ''),
        description: String(description || ''),
        priority: priority ? String(priority) : 'NORMAL',
        // Current plan comes from the authenticated session, NOT the client.
        currentPlan: user.plan,
        requestedPlan: requestedPlan ? String(requestedPlan) : null,
        billingCycle: billingCycle ? String(billingCycle) : null,
        source: source ? String(source) : 'support_center',
        metadata:
          metadata && typeof metadata === 'object'
            ? (metadata as Record<string, unknown>)
            : undefined,
      });

      return NextResponse.json(
        {
          ticket: {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            category: ticket.category,
            subcategory: ticket.subcategory,
            createdAt: ticket.createdAt,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof SupportValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error('[Support] create ticket error:', err);
      return NextResponse.json(
        { error: 'Failed to submit support request. Please try again.' },
        { status: 500 },
      );
    }
  });
}

// ─── GET /api/support/tickets — list the CURRENT USER's tickets ─────
// Always scoped by the authenticated user id. Pagination + optional
// status filter. Internal support notes are never included.

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20),
      );
      const status = url.searchParams.get('status');

      const where = {
        userId: user.id,
        ...(status && ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'].includes(status)
          ? { status }
          : {}),
      };

      const [tickets, total, openCount] = await Promise.all([
        db.supportTicket.findMany({
          where,
          orderBy: { lastActivityAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            ticketNumber: true,
            subject: true,
            category: true,
            subcategory: true,
            status: true,
            priority: true,
            currentPlan: true,
            requestedPlan: true,
            billingCycle: true,
            assignedTo: true,
            createdAt: true,
            updatedAt: true,
            lastActivityAt: true,
            resolvedAt: true,
            closedAt: true,
            _count: { select: { messages: { where: { isInternal: false } } } },
          },
        }),
        db.supportTicket.count({ where: { userId: user.id } }),
        db.supportTicket.count({
          where: { userId: user.id, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER'] } },
        }),
      ]);

      // Resolve assigned staff names (assignedTo is an admin user id).
      const assigneeIds = [...new Set(tickets.map((t) => t.assignedTo).filter(Boolean))] as string[];
      const assignees = assigneeIds.length
        ? await db.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const assigneeMap = new Map(assignees.map((a) => [a.id, a.name || a.email]));

      return NextResponse.json({
        tickets: tickets.map((t) => ({
          ...t,
          messageCount: t._count.messages,
          assignedToName: t.assignedTo ? assigneeMap.get(t.assignedTo) || null : null,
          _count: undefined,
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        stats: { total, open: openCount },
      });
    } catch (err) {
      console.error('[Support] list tickets error:', err);
      return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
    }
  });
}
