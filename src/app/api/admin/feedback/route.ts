import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin } from '@/lib/auth-middleware';

// ─── GET /api/admin/feedback — list with filters ──────────────────

export async function GET(request: NextRequest) {
  return withSuperAdmin(request, async () => {
    try {
      const url = request.nextUrl;
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const severity = url.searchParams.get('severity');
      const priority = url.searchParams.get('priority');
      const assignedTo = url.searchParams.get('assignedTo');
      const search = url.searchParams.get('search') || '';
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
      const sortBy = url.searchParams.get('sortBy') || 'newest';

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (type) where.type = type;
      if (severity) where.severity = severity;
      if (priority) where.priority = priority;
      if (assignedTo) where.assignedTo = assignedTo;
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { description: { contains: search } },
          { ticketNumber: { contains: search } },
        ];
      }

      const orderBy: Record<string, 'asc' | 'desc' | Record<string, 'asc' | 'desc'>> = {};
      switch (sortBy) {
        case 'oldest':
          orderBy.createdAt = 'asc';
          break;
        case 'severity':
          orderBy.severity = 'desc';
          break;
        case 'priority':
          orderBy.priority = 'desc';
          break;
        case 'most_commented':
          orderBy.comments = { _count: 'desc' };
          break;
        case 'newest':
        default:
          orderBy.createdAt = 'desc';
      }

      const [items, total] = await Promise.all([
        db.feedbackReport.findMany({
          where,
          orderBy: orderBy as never,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            user: { select: { id: true, email: true, name: true, avatar: true } },
            _count: { select: { comments: true } },
          },
        }),
        db.feedbackReport.count({ where }),
      ]);

      const result = items.map((item) => ({
        id: item.id,
        ticketNumber: item.ticketNumber,
        type: item.type,
        title: item.title,
        severity: item.severity,
        priority: item.priority,
        status: item.status,
        assignedTo: item.assignedTo,
        aiSeverity: item.aiSeverity,
        aiModule: item.aiModule,
        aiDuplicateScore: item.aiDuplicateScore,
        tags: item.tags,
        labels: item.labels,
        pageUrl: item.pageUrl,
        browserName: item.browserName,
        osName: item.osName,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        resolvedAt: item.resolvedAt,
        user: item.user,
        commentCount: item._count.comments,
        attachmentCount: Array.isArray(item.attachments) ? item.attachments.length : 0,
      }));

      return NextResponse.json({
        feedback: result,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      console.error('[Admin Feedback] GET list error:', err);
      return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
    }
  });
}
