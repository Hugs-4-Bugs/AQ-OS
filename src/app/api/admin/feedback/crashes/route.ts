import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin } from '@/lib/auth-middleware';

// ─── GET /api/admin/feedback/crashes ───────────────────────────────
// Returns crash reports grouped by error message

export async function GET(request: NextRequest) {
  return withSuperAdmin(request, async () => {
    try {
      const url = request.nextUrl;
      const resolved = url.searchParams.get('resolved');

      const where: Record<string, unknown> = {};
      if (resolved === 'true') where.resolved = true;
      if (resolved === 'false') where.resolved = false;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: thirtyDaysAgo };

      const crashes = await db.crashReport.findMany({
        where,
        select: {
          id: true, errorMessage: true, stackTrace: true, componentName: true,
          pageUrl: true, userId: true, createdAt: true, resolved: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      const grouped: Record<string, {
        errorMessage: string;
        count: number;
        firstSeen: Date;
        lastSeen: Date;
        sampleStack: string | null;
        componentName: string | null;
        pageUrl: string | null;
        affectedUsers: Set<string>;
        resolved: boolean;
        sampleIds: string[];
      }> = {};

      for (const c of crashes) {
        const key = c.errorMessage.slice(0, 200);
        if (!grouped[key]) {
          grouped[key] = {
            errorMessage: c.errorMessage,
            count: 0, firstSeen: c.createdAt, lastSeen: c.createdAt,
            sampleStack: c.stackTrace, componentName: c.componentName,
            pageUrl: c.pageUrl, affectedUsers: new Set(),
            resolved: c.resolved, sampleIds: [],
          };
        }
        const g = grouped[key];
        g.count++;
        if (c.createdAt < g.firstSeen) g.firstSeen = c.createdAt;
        if (c.createdAt > g.lastSeen) g.lastSeen = c.createdAt;
        if (c.userId) g.affectedUsers.add(c.userId);
        if (g.sampleIds.length < 5) g.sampleIds.push(c.id);
      }

      const result = Object.values(grouped)
        .map((g) => ({
          errorMessage: g.errorMessage, count: g.count,
          firstSeen: g.firstSeen, lastSeen: g.lastSeen,
          sampleStack: g.sampleStack, componentName: g.componentName,
          pageUrl: g.pageUrl, affectedUsersCount: g.affectedUsers.size,
          resolved: g.resolved, sampleIds: g.sampleIds,
        }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({ crashes: result });
    } catch (err) {
      console.error('[Admin Crash Reports] error:', err);
      return NextResponse.json({ error: 'Failed to load crash reports' }, { status: 500 });
    }
  });
}

// ─── PATCH /api/admin/feedback/crashes — mark resolved ────────────

export async function PATCH(request: NextRequest) {
  return withSuperAdmin(request, async () => {
    try {
      const body = await request.json();
      const { errorMessage, resolved } = body as { errorMessage?: string; resolved?: boolean };

      if (!errorMessage || typeof resolved !== 'boolean') {
        return NextResponse.json({ error: 'errorMessage and resolved (boolean) are required' }, { status: 400 });
      }

      const result = await db.crashReport.updateMany({
        where: { errorMessage: { startsWith: errorMessage.slice(0, 200) } },
        data: { resolved },
      });

      return NextResponse.json({ success: true, updated: result.count });
    } catch (err) {
      console.error('[Admin Crash Reports PATCH] error:', err);
      return NextResponse.json({ error: 'Failed to update crash reports' }, { status: 500 });
    }
  });
}
