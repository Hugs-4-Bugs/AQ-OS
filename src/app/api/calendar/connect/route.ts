// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Calendar Connect API
// POST /api/calendar/connect — Generate Google Calendar OAuth URL
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { buildGoogleCalendarAuthUrl } from '@/lib/google-oauth';
import { db } from '@/lib/db';
import { getAppUrl } from '@/lib/app-url';

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const origin = getAppUrl(request);

      // Build the OAuth URL for Calendar + Meet scopes
      const authUrl = buildGoogleCalendarAuthUrl(user.id, origin);

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_connect_initiated',
          details: JSON.stringify({
            purpose: 'calendar',
            timestamp: new Date().toISOString(),
          }),
          resource: 'calendar',
          resourceId: user.id,
        },
      });

      return NextResponse.json({
        authUrl,
        message: 'Redirect the user to authUrl to authorize Google Calendar access',
      });
    } catch (error) {
      console.error('[Calendar Connect API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate Google Calendar authorization URL' },
        { status: 500 }
      );
    }
  });
}, 'calendar/connect');
