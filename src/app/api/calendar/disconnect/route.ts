// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Disconnect API
// POST /api/calendar/disconnect — Disconnect Google Calendar
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { disconnectGoogleCalendar } from '@/lib/google-oauth';
import { db } from '@/lib/db';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const result = await disconnectGoogleCalendar(user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to disconnect Google Calendar' },
          { status: 500 }
        );
      }

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_disconnected',
          details: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
          resource: 'calendar',
          resourceId: user.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Google Calendar has been disconnected successfully',
      });
    } catch (error) {
      console.error('[Calendar Disconnect API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to disconnect Google Calendar' },
        { status: 500 }
      );
    }
  });
}, 'calendar/disconnect');
