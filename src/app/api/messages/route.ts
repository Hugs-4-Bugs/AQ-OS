// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/messages
// Phase 10: Unified messaging hub — list conversations with filters
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getConversations, type ChannelType, type ConversationStatus } from '@/lib/messaging-hub-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse filter params
      const channel = searchParams.get('channel') as ChannelType | null;
      const status = searchParams.get('status') as ConversationStatus | null;
      const search = searchParams.get('search');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      // Parse pagination params
      const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

      // Validate channel if provided
      const validChannels: ChannelType[] = ['email', 'telegram', 'whatsapp', 'linkedin', 'instagram'];
      if (channel && !validChannels.includes(channel)) {
        return NextResponse.json(
          { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate status if provided
      const validStatuses: ConversationStatus[] = ['active', 'closed', 'archived'];
      if (status && !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      // Build filters
      const filters: {
        channel?: ChannelType;
        status?: ConversationStatus;
        searchQuery?: string;
        dateFrom?: Date;
        dateTo?: Date;
      } = {};

      if (channel) filters.channel = channel;
      if (status) filters.status = status;
      if (search) filters.searchQuery = search;
      if (startDate) {
        const parsed = new Date(startDate);
        if (!isNaN(parsed.getTime())) {
          filters.dateFrom = parsed;
        }
      }
      if (endDate) {
        const parsed = new Date(endDate);
        if (!isNaN(parsed.getTime())) {
          filters.dateTo = parsed;
        }
      }

      // Fetch conversations
      const result = await getConversations(user.id, filters, { page, limit });

      return NextResponse.json(result);
    } catch (error) {
      console.error('[API /messages] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }
  });
}
