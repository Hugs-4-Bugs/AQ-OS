// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Provider Preferences API
// GET  /api/settings/meeting-provider — Get current meeting provider
// PATCH /api/settings/meeting-provider — Update meeting provider
//
// Provider enum: GOOGLE_MEET, ZOOM, TEAMS, CALENDLY, OTHER
// Default: GOOGLE_MEET
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getMeetingAdapter, type MeetingPlatform } from '@/lib/meetings/platform-adapter';

const VALID_PROVIDERS: MeetingPlatform[] = ['GOOGLE_MEET', 'ZOOM', 'TEAMS', 'CALENDLY', 'OTHER'];

// ── GET: Get current meeting provider ─────────────────────────────

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
        select: { meetingPlatform: true },
      });

      const provider = settings?.meetingPlatform || 'google_meet';
      const normalizedProvider = provider.toUpperCase().replace(/[-]/g, '_');

      // Get adapter info
      const adapter = getMeetingAdapter(provider);
      const capabilities = adapter.capabilities;

      return NextResponse.json({
        provider: normalizedProvider,
        displayName: adapter.name,
        capabilities,
        isImplemented: capabilities.createMeeting,
      });
    } catch (error) {
      console.error('[Meeting Provider API] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meeting provider settings' },
        { status: 500 }
      );
    }
  });
}, 'settings/meeting-provider');

// ── PATCH: Update meeting provider ────────────────────────────────

export const PATCH = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { provider } = body as { provider: string };

      if (!provider) {
        return NextResponse.json(
          { error: 'Missing required field: provider' },
          { status: 400 }
        );
      }

      const normalizedProvider = provider.toUpperCase().replace(/[-]/g, '_');

      if (!VALID_PROVIDERS.includes(normalizedProvider as MeetingPlatform)) {
        return NextResponse.json(
          { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
          { status: 400 }
        );
      }

      // Check if the provider is actually implemented
      const adapter = getMeetingAdapter(normalizedProvider);
      if (!adapter.capabilities.createMeeting) {
        return NextResponse.json(
          {
            error: `Provider "${adapter.name}" is not yet fully implemented. Meeting creation is not available for this provider.`,
            provider: normalizedProvider,
            displayName: adapter.name,
            capabilities: adapter.capabilities,
            isImplemented: false,
          },
          { status: 422 }
        );
      }

      // Store in lowercase with underscores to match existing field format
      const storedValue = normalizedProvider.toLowerCase();

      await db.userSettings.upsert({
        where: { userId: user.id },
        update: { meetingPlatform: storedValue },
        create: {
          userId: user.id,
          meetingPlatform: storedValue,
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'meeting_provider_updated',
          details: JSON.stringify({ provider: normalizedProvider }),
          resource: 'settings',
        },
      });

      return NextResponse.json({
        success: true,
        provider: normalizedProvider,
        displayName: adapter.name,
        capabilities: adapter.capabilities,
        isImplemented: adapter.capabilities.createMeeting,
      });
    } catch (error) {
      console.error('[Meeting Provider API] PATCH Error:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting provider settings' },
        { status: 500 }
      );
    }
  });
}, 'settings/meeting-provider');
