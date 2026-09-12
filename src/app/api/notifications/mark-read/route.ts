// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — /api/notifications/mark-read
// POST — Mark one or all notifications as read
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth';

interface MarkReadBody {
  notificationId?: string; // If provided, mark only this one. If omitted, mark all.
}

// POST /api/notifications/mark-read
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body: MarkReadBody = await request.json();
    const { notificationId } = body;

    if (notificationId) {
      // Mark a single notification as read
      const notification = await db.notification.findFirst({
        where: { id: notificationId, userId: user.id },
      });

      if (!notification) {
        return NextResponse.json(
          { error: 'Notification not found' },
          { status: 404 },
        );
      }

      await db.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      const unreadCount = await db.notification.count({
        where: { userId: user.id, read: false },
      });

      return NextResponse.json({ success: true, unreadCount });
    } else {
      // Mark all notifications as read
      const result = await db.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });

      return NextResponse.json({
        success: true,
        markedCount: result.count,
        unreadCount: 0,
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[API] Error marking notifications as read:', error);
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
}
