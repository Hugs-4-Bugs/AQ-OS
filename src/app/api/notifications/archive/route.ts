// ═══════════════════════════════════════════════════════════════════
// POST /api/notifications/archive — Archive a notification
// Phase 11: Notification API
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { archiveNotification } from '@/lib/notification-engine';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { notificationId } = body as { notificationId?: string };

      if (!notificationId) {
        return NextResponse.json(
          { error: 'notificationId is required' },
          { status: 400 }
        );
      }

      const success = await archiveNotification(notificationId, user.id);

      if (!success) {
        return NextResponse.json(
          { error: 'Notification not found or does not belong to this user' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'archive',
        notificationId,
      });
    } catch (error) {
      console.error('[API /notifications/archive] Error archiving notification:', error);
      return NextResponse.json(
        { error: 'Failed to archive notification' },
        { status: 500 }
      );
    }
  });
}
