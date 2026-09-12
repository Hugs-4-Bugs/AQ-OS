import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const securityAlerts = await db.securityAlert.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const gdprRequests = await db.gdprRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const auditLogs = await db.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return NextResponse.json({
        data: {
          securityScore: securityAlerts.length === 0 ? 100 : Math.max(20, 100 - securityAlerts.filter(a => !a.isResolved).length * 10),
          alerts: securityAlerts.map(a => ({
            id: a.id,
            type: a.alertType,
            severity: 'medium' as const,
            message: `${a.alertType} from ${a.ipAddress || 'unknown IP'}`,
            resolved: a.isResolved,
            createdAt: a.createdAt.toISOString(),
          })),
          gdprRequests: gdprRequests.map(r => ({
            id: r.id,
            type: r.requestType,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          })),
          recentAuditLogs: auditLogs.map(l => ({
            id: l.id,
            action: l.action,
            resource: l.resource || '',
            createdAt: l.createdAt.toISOString(),
          })),
          complianceStatus: {
            gdpr: true,
            dataRetention: true,
            accessControl: true,
            encryption: true,
          },
        },
      });
    } catch (error) {
      console.error('[API] Compliance security error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch compliance data' }, { status: 500 });
    }
  });
}
