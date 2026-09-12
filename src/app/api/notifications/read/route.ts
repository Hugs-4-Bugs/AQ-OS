// ═══════════════════════════════════════════════════════════════════
// POST /api/notifications/read — Mark notifications as read
// Phase 11: Notification API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { markAsRead, markAllAsRead } from '@/lib/notification-engine';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { notificationId, all } = body as {
        notificationId?: string;
        all?: boolean;
      };

      // Mark all notifications as read
      if (all) {
        const count = await markAllAsRead(user.id);
        return NextResponse.json({
          success: true,
          action: 'mark_all_read',
          count,
        });
      }

      // Mark a single notification as read
      if (notificationId) {
        const success = await markAsRead(notificationId, user.id);
        if (!success) {
          return NextResponse.json(
            { error: 'Notification not found or does not belong to this user' },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          action: 'mark_read',
          notificationId,
        });
      }

      // Neither notificationId nor all provided
      return NextResponse.json(
        { error: 'Provide either notificationId or all=true in the request body' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[API /notifications/read] Error marking as read:', error);
      return NextResponse.json(
        { error: 'Failed to mark notifications as read' },
        { status: 500 }
      );
    }
  });
}
