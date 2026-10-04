// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — SDR Pipeline API Routes
// POST /api/sdr — Execute SDR actions (execute_cycle, update_config, etc.)
// GET  /api/sdr — Get SDR status
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';
import {
  executeSDRCycle,
  updateSDRConfig,
  generateDailySummary,
  getSDRStatus,
} from '@/lib/autonomous-sdr-pipeline';

// POST /api/sdr
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { action, config } = body;

      if (!action || typeof action !== 'string') {
        return NextResponse.json(
          { error: 'action is required and must be one of: execute_cycle, update_config, daily_summary, status' },
          { status: 400 }
        );
      }

      switch (action) {
        case 'execute_cycle': {
          const result = await executeSDRCycle(user.id);
          return NextResponse.json({
            success: true,
            cycle: result,
          });
        }

        case 'update_config': {
          if (!config || typeof config !== 'object') {
            return NextResponse.json(
              { error: 'config object is required for update_config action' },
              { status: 400 }
            );
          }
          await updateSDRConfig(user.id, config);
          const updatedStatus = await getSDRStatus(user.id);
          return NextResponse.json({
            success: true,
            message: 'SDR configuration updated',
            config: updatedStatus.config,
          });
        }

        case 'daily_summary': {
          const summary = await generateDailySummary(user.id);
          return NextResponse.json({
            success: true,
            summary,
          });
        }

        case 'status': {
          const status = await getSDRStatus(user.id);
          return NextResponse.json({
            success: true,
            status,
          });
        }

        default:
          return NextResponse.json(
            { error: `Unknown action: ${action}. Valid actions: execute_cycle, update_config, daily_summary, status` },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[SDR API] POST failed:', error);
      const message = error instanceof Error ? error.message : 'SDR operation failed';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}

// GET /api/sdr
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const status = await getSDRStatus(user.id);

      return NextResponse.json({
        success: true,
        status,
      });
    } catch (error) {
      console.error('[SDR API] GET failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to get SDR status';
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
