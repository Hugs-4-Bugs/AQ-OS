// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — /api/notifications/[id]
// PATCH — Mark a single notification as read
// DELETE — Delete a notification
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth';

// PATCH /api/notifications/[id] — Mark a notification as read
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const notification = await db.notification.findFirst({
      where: { id, userId: user.id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 },
      );
    }

    await db.notification.update({
      where: { id },
      data: { read: true },
    });

    const unreadCount = await db.notification.count({
      where: { userId: user.id, read: false },
    });

    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[API] Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

// DELETE /api/notifications/[id] — Delete a notification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const notification = await db.notification.findFirst({
      where: { id, userId: user.id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 },
      );
    }

    await db.notification.delete({
      where: { id },
    });

    const unreadCount = await db.notification.count({
      where: { userId: user.id, read: false },
    });

    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[API] Error deleting notification:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
