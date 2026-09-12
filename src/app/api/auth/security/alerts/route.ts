// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Security Alerts API Route
// GET: Get security alerts for current user
// POST: Dismiss / acknowledge a security alert
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import type { AuthUser } from '@/lib/auth';

/**
 * GET /api/auth/security/alerts
 * Get security alerts for the current user (suspicious logins, new devices, etc.)
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type'); // filter by alert type
      const resolved = searchParams.get('resolved'); // 'true', 'false', or null for all
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
      const offset = parseInt(searchParams.get('offset') || '0');

      // Build the where clause for notifications (security alerts are stored as notifications)
      const notificationWhere: Record<string, unknown> = {
        userId: user.id,
        type: type || { in: ['security_alert', 'suspicious_login'] },
      };

      if (resolved === 'true') {
        notificationWhere.read = true;
      } else if (resolved === 'false') {
        notificationWhere.read = false;
      }

      // Get security alert notifications
      const alerts = await db.notification.findMany({
        where: notificationWhere as never,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      // Try to get SecurityAlert records as well (if table exists)
      let securityAlerts: unknown[] = [];
      try {
        const prisma = db as any;
        if (prisma.securityAlert) {
          const saWhere: Record<string, unknown> = { userId: user.id };
          if (resolved === 'true') saWhere.isResolved = true;
          else if (resolved === 'false') saWhere.isResolved = false;

          securityAlerts = await prisma.securityAlert.findMany({
            where: saWhere,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          });
        }
      } catch {
        // Table may not exist yet
      }

      // Get total counts
      const totalNotifications = await db.notification.count({
        where: notificationWhere as never,
      });

      const unresolvedCount = await db.notification.count({
        where: {
          userId: user.id,
          type: { in: ['security_alert', 'suspicious_login'] },
          read: false,
        },
      });

      // Format alerts for response
      const formattedAlerts = alerts.map(alert => {
        let metadata = null;
        try {
          metadata = alert.metadata ? JSON.parse(alert.metadata) : null;
        } catch {
          // Keep null
        }

        return {
          id: alert.id,
          type: alert.type,
          title: alert.title,
          message: alert.message,
          isResolved: alert.read,
          resolvedAt: alert.read ? alert.createdAt : null,
          actionUrl: alert.actionUrl,
          metadata,
          createdAt: alert.createdAt,
        };
      });

      // Format SecurityAlert records
      const formattedSecurityAlerts = (securityAlerts as Array<Record<string, unknown>>).map(sa => ({
        id: sa.id,
        type: 'security_alert_record',
        alertType: sa.alertType,
        ipAddress: sa.ipAddress,
        userAgent: sa.userAgent,
        country: sa.country,
        city: sa.city,
        isResolved: sa.isResolved,
        resolvedAt: sa.resolvedAt,
        createdAt: sa.createdAt,
      }));

      return NextResponse.json({
        alerts: [...formattedSecurityAlerts, ...formattedAlerts],
        pagination: {
          total: totalNotifications + securityAlerts.length,
          limit,
          offset,
          hasMore: offset + limit < totalNotifications + securityAlerts.length,
        },
        unresolvedCount,
      });
    } catch (error) {
      console.error('Security alerts GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch security alerts' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/auth/security/alerts
 * Dismiss / acknowledge a security alert, or mark it as suspicious
 *
 * Body:
 * - alertId: string — ID of the alert to dismiss
 * - action: 'dismiss' | 'mark_suspicious' | 'trust_device'
 * - deviceFingerprint?: string — for trust_device action
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { alertId, action, deviceFingerprint } = body;

      if (!alertId || !action) {
        return NextResponse.json(
          { error: 'alertId and action are required' },
          { status: 400 }
        );
      }

      const validActions = ['dismiss', 'mark_suspicious', 'trust_device'];
      if (!validActions.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
          { status: 400 }
        );
      }

      switch (action) {
        case 'dismiss': {
          // Mark the notification as read (resolved)
          const notification = await db.notification.findFirst({
            where: {
              id: alertId,
              userId: user.id,
              type: { in: ['security_alert', 'suspicious_login'] },
            },
          });

          if (!notification) {
            // Try SecurityAlert table
            try {
              const prisma = db as any;
              if (prisma.securityAlert) {
                const sa = await prisma.securityAlert.findFirst({
                  where: { id: alertId, userId: user.id },
                });
                if (sa) {
                  await prisma.securityAlert.update({
                    where: { id: alertId },
                    data: { isResolved: true, resolvedAt: new Date() },
                  });
                  return NextResponse.json({ message: 'Alert dismissed' });
                }
              }
            } catch {
              // Fall through
            }
            return NextResponse.json(
              { error: 'Alert not found' },
              { status: 404 }
            );
          }

          await db.notification.update({
            where: { id: notification.id },
            data: { read: true },
          });

          return NextResponse.json({ message: 'Alert dismissed' });
        }

        case 'mark_suspicious': {
          // Mark the alert as suspicious and optionally lock the account
          try {
            const prisma = db as any;
            if (prisma.securityAlert) {
              await prisma.securityAlert.updateMany({
                where: { id: alertId, userId: user.id },
                data: { isResolved: true, resolvedAt: new Date() },
              });
            }
          } catch {
            // Non-blocking
          }

          // Also mark the notification as read
          await db.notification.updateMany({
            where: {
              id: alertId,
              userId: user.id,
              type: { in: ['security_alert', 'suspicious_login'] },
            },
            data: { read: true },
          });

          return NextResponse.json({
            message: 'Alert marked as suspicious. Consider changing your password and enabling MFA.',
          });
        }

        case 'trust_device': {
          if (!deviceFingerprint) {
            return NextResponse.json(
              { error: 'deviceFingerprint is required for trust_device action' },
              { status: 400 }
            );
          }

          // Trust the device
          const { trustDevice } = await import('@/lib/device-fingerprint');
          const trusted = await trustDevice(user.id, deviceFingerprint);

          if (!trusted) {
            return NextResponse.json(
              { error: 'Failed to trust device. Device tracking may not be available.' },
              { status: 500 }
            );
          }

          // Dismiss the associated alert
          await db.notification.updateMany({
            where: {
              id: alertId,
              userId: user.id,
              type: { in: ['security_alert', 'suspicious_login'] },
            },
            data: { read: true },
          });

          return NextResponse.json({
            message: 'Device trusted and alert dismissed.',
          });
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('Security alerts POST error:', error);
      return NextResponse.json(
        { error: 'Failed to process security alert action' },
        { status: 500 }
      );
    }
  });
}
