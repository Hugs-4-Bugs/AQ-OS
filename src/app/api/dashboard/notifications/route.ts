import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '20');
      const unreadOnly = searchParams.get('unread') === 'true';

      const where: Record<string, unknown> = {
        userId: user.id,
      };

      if (unreadOnly) {
        where.read = false;
      }

      const notifications = await db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const unreadCount = await db.notification.count({
        where: { userId: user.id, read: false },
      });

      return NextResponse.json({
        data: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          read: n.read,
          actionUrl: n.actionUrl,
          metadata: n.metadata,
          deliveredVia: n.deliveredVia,
          timestamp: n.createdAt.toISOString(),
        })),
        unreadCount,
      });
    } catch (error) {
      console.error('[API] Error fetching notifications:', error);
      return NextResponse.json({ data: [], unreadCount: 0, error: 'Failed to fetch notifications' }, { status: 500 });
    }
  });
}
