// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomy Mode Settings API
// Phase 3: GET/PATCH /api/settings/autonomy-mode
//
// GET  - Retrieve the user's current autonomy mode and config
// PATCH - Update the user's autonomy mode preference
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getUserAutonomyMode,
  setUserAutonomyMode,
  getAutonomyConfig,
  getDailyAutonomousUsage,
  type AutonomyMode,
} from '@/lib/meetings/autonomy-engine';

// GET /api/settings/autonomy-mode — Retrieve autonomy mode and config
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const [mode, config, dailyUsage] = await Promise.all([
        getUserAutonomyMode(user.id),
        getAutonomyConfig(user.id),
        getDailyAutonomousUsage(user.id),
      ]);

      return NextResponse.json({
        mode,
        config: {
          defaultMode: config.defaultMode,
          boundaries: config.boundaries,
          rules: config.rules,
        },
        dailyUsage,
      });
    } catch (error) {
      console.error('[AutonomyModeAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve autonomy mode settings' },
        { status: 500 }
      );
    }
  });
}

// PATCH /api/settings/autonomy-mode — Update autonomy mode
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { mode, boundaries } = body;

      // Validate mode if provided
      const validModes: AutonomyMode[] = ['manual', 'assisted', 'autonomous'];
      if (mode !== undefined && !validModes.includes(mode)) {
        return NextResponse.json(
          { error: `Invalid mode. Valid modes: ${validModes.join(', ')}` },
          { status: 400 }
        );
      }

      // Update mode if provided
      if (mode !== undefined) {
        const result = await setUserAutonomyMode(user.id, mode);
        if (!result.success) {
          return NextResponse.json(
            { error: 'Failed to update autonomy mode' },
            { status: 500 }
          );
        }
      }

      // Update boundaries if provided
      if (boundaries) {
        const { updateAutonomyConfig } = await import('@/lib/meetings/autonomy-engine');
        await updateAutonomyConfig(user.id, { boundaries });
      }

      // Return updated config
      const updatedMode = await getUserAutonomyMode(user.id);
      const updatedConfig = await getAutonomyConfig(user.id);

      return NextResponse.json({
        mode: updatedMode,
        config: {
          defaultMode: updatedConfig.defaultMode,
          boundaries: updatedConfig.boundaries,
          rules: updatedConfig.rules,
        },
      });
    } catch (error) {
      console.error('[AutonomyModeAPI] PATCH error:', error);
      return NextResponse.json(
        { error: 'Failed to update autonomy mode settings' },
        { status: 500 }
      );
    }
  });
}
