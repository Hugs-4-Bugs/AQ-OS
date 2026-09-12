// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Broadcasts API Route
// Phase 10: GET/POST /api/messaging/broadcasts
// Updated: Dual auth (JWT OR API Key) + org isolation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { createBroadcast, listBroadcasts } from '@/lib/broadcast-service';

export async function GET(request: NextRequest) {
  return withDualAuthPermission(request, 'outreach:read', async (user, apiKeyInfo) => {
    try {
      const url = new URL(request.url);
      const status = url.searchParams.get('status') as 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | null;
      const page = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const orgId = apiKeyInfo?.orgId || undefined;

      const result = await listBroadcasts(user.id, status || undefined, page, limit, orgId);

      return NextResponse.json({
        success: true,
        data: result.broadcasts,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      console.error('Broadcasts GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to list broadcasts' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withDualAuthPermission(request, 'outreach:write', async (user, apiKeyInfo) => {
    try {
      const body = await request.json();
      const { name, channel, audienceFilter, messageContent, templateId, scheduledAt } = body;

      if (!name || !channel || !audienceFilter || !messageContent) {
        return NextResponse.json(
          { error: 'Missing required fields: name, channel, audienceFilter, messageContent' },
          { status: 400 }
        );
      }

      if (!['whatsapp', 'telegram', 'email'].includes(channel)) {
        return NextResponse.json(
          { error: 'Invalid channel. Must be: whatsapp, telegram, or email' },
          { status: 400 }
        );
      }

      const result = await createBroadcast({
        userId: user.id,
        orgId: apiKeyInfo?.orgId || undefined,
        name,
        channel,
        audienceFilter,
        messageContent,
        templateId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        broadcastId: result.broadcastId,
      }, { status: 201 });
    } catch (error) {
      console.error('Broadcasts POST route error:', error);
      return NextResponse.json(
        { error: 'Failed to create broadcast' },
        { status: 500 }
      );
    }
  });
}
