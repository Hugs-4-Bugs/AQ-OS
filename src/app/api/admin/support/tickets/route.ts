import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// ─── GET /api/admin/support/tickets — staff management list ─────────
// PLATFORM SUPER ADMIN ONLY (same policy as the /admin console layout:
// support tickets are platform-level data, org roles are insufficient).
// Supports search + filters by status / priority / category + pagination
// + queue stats.

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export async function GET(request: NextRequest) {
  return withSuperAdmin(request, async (user) => {
    try {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25),
      );
      const status = url.searchParams.get('status') || '';
      const priority = url.searchParams.get('priority') || '';
      const category = url.searchParams.get('category') || '';
      const search = (url.searchParams.get('search') || '').trim();

      const where: Record<string, unknown> = {};
      if (STATUSES.includes(status)) where.status = status;
      if (PRIORITIES.includes(priority)) where.priority = priority;
      if (category) where.category = category;
      if (search) {
        where.OR = [
          { ticketNumber: { contains: search } },
          { subject: { contains: search } },
          { description: { contains: search } },
        ];
      }

      const [tickets, total] = await Promise.all([
        db.supportTicket.findMany({
          where,
          orderBy: [
            // Urgent + open first, then by recent activity.
            { lastActivityAt: 'desc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, name: true, email: true } },
            _count: { select: { messages: true } },
          },
        }),
        db.supportTicket.count({ where }),
      ]);

      const [statusCounts, priorityCounts] = await Promise.all([
        db.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
        db.supportTicket.groupBy({ by: ['priority'], _count: { _all: true } }),
      ]);

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
          id: t.id,
          ticketNumber: t.ticketNumber,
          userId: t.userId,
          ownerName: t.user.name || t.user.email,
          ownerEmail: t.user.email,
          category: t.category,
          subcategory: t.subcategory,
          subject: t.subject,
          description: t.description,
          status: t.status,
          priority: t.priority,
          currentPlan: t.currentPlan,
          requestedPlan: t.requestedPlan,
          billingCycle: t.billingCycle,
          assignedTo: t.assignedTo,
          assignedToName: t.assignedTo ? assigneeMap.get(t.assignedTo) || null : null,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          lastActivityAt: t.lastActivityAt,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
          messageCount: t._count.messages,
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        stats: {
          byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
          byPriority: Object.fromEntries(priorityCounts.map((p) => [p.priority, p._count._all])),
        },
      });
    } catch (err) {
      console.error('[Admin Support] list error:', err);
      return NextResponse.json({ error: 'Failed to load support tickets' }, { status: 500 });
    }
  });
}
