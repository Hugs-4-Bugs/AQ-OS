// ═══════════════════════════════════════════════════════════════════
// GET  /api/outreach/autonomy-status — Get current autonomy mode & limits
// PUT  /api/outreach/autonomy-status — Update outreach autonomy mode
//
// Body (PUT): { mode }
// Auth: withAuth + withApiLogging
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import {
  getOutreachAutonomyStatus,
  setOutreachAutonomyMode,
  type OutreachAutonomyMode,
} from '@/lib/autonomous-outreach-service';
import type { AuthUser } from '@/lib/auth';

// GET /api/outreach/autonomy-status
export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const status = await getOutreachAutonomyStatus(user.id);

      return NextResponse.json({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error('[API /outreach/autonomy-status] GET failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to get autonomy status' },
        { status: 500 }
      );
    }
  });
}, 'outreach/autonomy-status');

// PUT /api/outreach/autonomy-status
export const PUT = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { mode } = body;

      if (!mode || typeof mode !== 'string') {
        return NextResponse.json(
          { error: 'mode is required and must be a string' },
          { status: 400 }
        );
      }

      const validModes: OutreachAutonomyMode[] = ['manual', 'assisted', 'autonomous'];
      if (!validModes.includes(mode)) {
        return NextResponse.json(
          { error: `mode must be one of: ${validModes.join(', ')}` },
          { status: 400 }
        );
      }

      await setOutreachAutonomyMode(user.id, mode as OutreachAutonomyMode);

      const updatedStatus = await getOutreachAutonomyStatus(user.id);

      return NextResponse.json({
        success: true,
        mode: updatedStatus.mode,
        message: `Outreach autonomy mode updated to ${mode}`,
      });
    } catch (error) {
      console.error('[API /outreach/autonomy-status] PUT failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to update autonomy mode' },
        { status: 500 }
      );
    }
  });
}, 'outreach/autonomy-status');
