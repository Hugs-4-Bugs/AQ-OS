import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Fetch recent data exports
      const exports = await db.dataExport.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Fetch scheduled reports
      const reports = await db.report.findMany({
        where: { userId: user.id },
        orderBy: { lastRunAt: 'desc' },
      });

      // Format export history
      const history = exports.map((exp) => {
        const sizeStr = exp.fileSize
          ? exp.fileSize > 1024 * 1024
            ? `${(exp.fileSize / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(exp.fileSize / 1024)} KB`
          : 'N/A';

        const statusMap: Record<string, 'completed' | 'processing' | 'failed'> = {
          completed: 'completed',
          processing: 'processing',
          pending: 'processing',
          failed: 'failed',
        };

        return {
          id: exp.id,
          reportName: exp.exportType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: exp.type,
          format: (exp.exportType.includes('csv') ? 'csv' : exp.exportType.includes('pdf') ? 'pdf' : exp.exportType.includes('json') ? 'json' : 'excel') as 'pdf' | 'excel' | 'csv' | 'json',
          date: exp.createdAt.toLocaleString(),
          size: sizeStr,
          status: statusMap[exp.status] ?? 'processing',
          requestedBy: 'You',
        };
      });

      // Format scheduled reports
      const scheduled = reports
        .filter((r) => r.lastRunAt)
        .map((r) => {
          const lastRunMs = r.lastRunAt ? Date.now() - r.lastRunAt.getTime() : null;
          let lastRun = 'Never';
          if (lastRunMs !== null) {
            const days = Math.floor(lastRunMs / (1000 * 60 * 60 * 24));
            lastRun = days === 0 ? 'Today' : `${days} day${days !== 1 ? 's' : ''} ago`;
          }

          return {
            id: r.id,
            name: r.name,
            type: r.type,
            frequency: 'Scheduled',
            lastRun,
            nextRun: 'As scheduled',
            status: 'active' as const,
            recipients: 1,
          };
        });

      return NextResponse.json({
        data: {
          scheduled,
          history,
        },
      });
    } catch (error) {
      console.error('[API] Error fetching exports:', error);
      return NextResponse.json(
        { data: { scheduled: [], history: [] }, error: 'Failed to fetch exports' },
        { status: 500 }
      );
    }
  });
}
