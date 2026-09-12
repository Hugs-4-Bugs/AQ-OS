import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAdmin } from '@/lib/auth-middleware';
import { Prisma } from '@prisma/client';

// ─── GET /api/admin/feedback/analytics ─────────────────────────────

export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        statusCounts,
        typeCounts,
        severityCounts,
        browserCounts,
        osCounts,
        resolvedItems,
        topPagesRaw,
        feedbackVolumeRaw,
        crashVolumeRaw,
        tagCountsRaw,
      ] = await Promise.all([
        db.feedbackReport.groupBy({ by: ['status'], _count: { _all: true } }),
        db.feedbackReport.groupBy({ by: ['type'], _count: { _all: true } }),
        db.feedbackReport.groupBy({ by: ['severity'], _count: { _all: true } }),
        db.feedbackReport.groupBy({ by: ['browserName'], _count: { _all: true } }),
        db.feedbackReport.groupBy({ by: ['osName'], _count: { _all: true } }),
        db.feedbackReport.findMany({
          where: { resolvedAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true, resolvedAt: true },
        }),
        db.feedbackReport.findMany({
          where: { pageUrl: { not: null } },
          select: { pageUrl: true },
        }),
        db.feedbackReport.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true },
        }),
        db.crashReport.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true, errorMessage: true },
        }),
        db.feedbackReport.findMany({
          where: { tags: { not: Prisma.DbNull } },
          select: { tags: true },
        }),
      ]);

      const byStatus: Record<string, number> = {};
      for (const r of statusCounts) byStatus[r.status] = r._count._all;
      const byType: Record<string, number> = {};
      for (const r of typeCounts) byType[r.type] = r._count._all;
      const bySeverity: Record<string, number> = {};
      for (const r of severityCounts) bySeverity[r.severity] = r._count._all;
      const byBrowser: Record<string, number> = {};
      for (const r of browserCounts) byBrowser[r.browserName || 'Unknown'] = r._count._all;
      const byOS: Record<string, number> = {};
      for (const r of osCounts) byOS[r.osName || 'Unknown'] = r._count._all;

      let avgResolutionHours = 0;
      if (resolvedItems.length > 0) {
        const totalHours = resolvedItems.reduce((sum, item) => {
          if (!item.resolvedAt) return sum;
          return sum + (item.resolvedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60);
        }, 0);
        avgResolutionHours = Math.round((totalHours / resolvedItems.length) * 10) / 10;
      }

      const pageCountMap: Record<string, number> = {};
      for (const item of topPagesRaw) {
        if (item.pageUrl) pageCountMap[item.pageUrl] = (pageCountMap[item.pageUrl] || 0) + 1;
      }
      const topPages = Object.entries(pageCountMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([page, count]) => ({ page, count }));

      const feedbackVolume: Array<{ date: string; count: number }> = [];
      const feedbackVolumeMap: Record<string, number> = {};
      for (const item of feedbackVolumeRaw) {
        const day = item.createdAt.toISOString().slice(0, 10);
        feedbackVolumeMap[day] = (feedbackVolumeMap[day] || 0) + 1;
      }
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const day = d.toISOString().slice(0, 10);
        feedbackVolume.push({ date: day, count: feedbackVolumeMap[day] || 0 });
      }

      const crashVolume: Array<{ date: string; count: number }> = [];
      const crashVolumeMap: Record<string, number> = {};
      for (const item of crashVolumeRaw) {
        const day = item.createdAt.toISOString().slice(0, 10);
        crashVolumeMap[day] = (crashVolumeMap[day] || 0) + 1;
      }
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const day = d.toISOString().slice(0, 10);
        crashVolume.push({ date: day, count: crashVolumeMap[day] || 0 });
      }

      const tagCountMap: Record<string, number> = {};
      for (const item of tagCountsRaw) {
        if (Array.isArray(item.tags)) {
          for (const tag of item.tags as unknown[]) {
            if (typeof tag === 'string') tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
          }
        }
      }
      const topTags = Object.entries(tagCountMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag, count]) => ({ tag, count }));

      return NextResponse.json({
        byStatus,
        byType,
        bySeverity,
        byBrowser,
        byOS,
        avgResolutionHours,
        resolvedCount: resolvedItems.length,
        topPages,
        feedbackVolume,
        crashVolume,
        topTags,
        totalFeedback: Object.values(byStatus).reduce((a, b) => a + b, 0),
        totalCrashes: crashVolumeRaw.length,
      });
    } catch (err) {
      console.error('[Admin Feedback Analytics] error:', err);
      return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
    }
  });
}
