import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * Fetch notifications for the authenticated user, ordered newest first.
 * Query params:
 *   - limit: number (default 50, max 100)
 *   - offset: number (default 0) — for pagination on the notifications page
 *   - unreadOnly: boolean (default false)
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const where = {
      userId: authUser.id,
      ...(unreadOnly ? { read: false } : {}),
    };

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        read: true,
        actionUrl: true,
        createdAt: true,
      },
    });

    const unreadCount = await db.notification.count({
      where: {
        userId: authUser.id,
        read: false,
      },
    });

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 * Mark notifications as read.
 * Body: { ids?: string[], markAllRead?: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, markAllRead } = body;

    if (markAllRead) {
      await db.notification.updateMany({
        where: {
          userId: authUser.id,
          read: false,
        },
        data: { read: true },
      });
      return NextResponse.json({ success: true, markedAll: true });
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      await db.notification.updateMany({
        where: {
          id: { in: ids },
          userId: authUser.id,
        },
        data: { read: true },
      });
      return NextResponse.json({ success: true, marked: ids.length });
    }

    return NextResponse.json(
      { error: 'Provide ids array or markAllRead: true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Mark notifications read error:', error);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
