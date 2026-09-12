import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// GET /api/dashboard/messaging — Fetch conversations, accounts, templates, and messages for the messaging hub
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const channel = searchParams.get('channel') || undefined;
      const conversationId = searchParams.get('conversationId') || undefined;

      // If conversationId is provided, return messages for that conversation
      if (conversationId) {
        const messages = await db.conversationMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });

        const formattedMessages = messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderType: m.senderType,
          senderName: m.senderType === 'user' ? 'You' : m.senderType === 'ai' ? 'AI Assistant' : 'Lead',
          content: m.content,
          channel: m.channel,
          direction: m.direction,
          status: m.direction === 'outbound' ? 'sent' : 'read',
          aiGenerated: m.aiGenerated,
          createdAt: m.createdAt.toISOString(),
          metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
        }));

        return NextResponse.json({ messages: formattedMessages });
      }

      // Fetch email accounts
      const emailAccounts = await db.emailAccount.findMany({
        where: { userId: user.id, status: 'active' },
        select: { id: true, gmailEmail: true, status: true },
      });

      // Fetch Telegram config
      const telegramConfig = await db.telegramConfig.findUnique({
        where: { userId: user.id },
        select: { id: true, isConnected: true, username: true },
      });

      // Fetch WhatsApp config
      const whatsappConfig = await db.whatsappConfig.findUnique({
        where: { userId: user.id },
        select: { id: true, isConnected: true, phoneNumber: true },
      });

      // Build accounts list
      const accounts: Array<{
        id: string;
        label: string;
        channel: 'gmail' | 'telegram' | 'whatsapp';
        email?: string;
        connected: boolean;
      }> = [];

      emailAccounts.forEach((ea) => {
        accounts.push({
          id: ea.id,
          label: ea.gmailEmail,
          channel: 'gmail',
          email: ea.gmailEmail,
          connected: ea.status === 'active',
        });
      });

      if (telegramConfig) {
        accounts.push({
          id: telegramConfig.id,
          label: telegramConfig.username ? `@${telegramConfig.username}` : 'Telegram',
          channel: 'telegram',
          connected: telegramConfig.isConnected,
        });
      }

      if (whatsappConfig) {
        accounts.push({
          id: whatsappConfig.id,
          label: whatsappConfig.phoneNumber || 'WhatsApp',
          channel: 'whatsapp',
          connected: whatsappConfig.isConnected,
        });
      }

      // Fetch conversations with latest message info
      const conversations = await db.conversation.findMany({
        where: {
          channel: channel && channel !== 'all' ? channel : undefined,
          status: { not: 'archived' },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
      });

      // Fetch lead info for conversations
      const leadIds = [...new Set(conversations.map((c) => c.leadId).filter(Boolean))];
      const leads = leadIds.length > 0
        ? await db.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, businessName: true, ownerName: true, stage: true },
          })
        : [];
      const leadMap = new Map(leads.map((l) => [l.id, l]));

      // Count unread messages per conversation
      const conversationIds = conversations.map((c) => c.id);
      const unreadCounts = conversationIds.length > 0
        ? await db.conversationMessage.groupBy({
            by: ['conversationId'],
            where: {
              conversationId: { in: conversationIds },
              direction: 'inbound',
              senderType: 'lead',
            },
            _count: true,
          })
        : [];
      const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count]));

      const formattedConversations = conversations.map((conv) => {
        const lead = leadMap.get(conv.leadId);
        const lastMessage = conv.messages[0];
        return {
          id: conv.id,
          leadId: conv.leadId,
          leadName: lead?.businessName || lead?.ownerName || 'Unknown Lead',
          leadAvatar: undefined,
          channel: conv.channel as 'gmail' | 'telegram' | 'whatsapp',
          subject: conv.subject,
          lastMessage: lastMessage?.content || '',
          lastMessageAt: (conv.lastMessageAt || conv.createdAt).toISOString(),
          unreadCount: unreadMap.get(conv.id) || 0,
          isStarred: false,
          isArchived: conv.status === 'archived',
          status: conv.status as 'active' | 'closed' | 'archived',
          leadStage: lead?.stage,
        };
      });

      // Channel counts
      const allChannelCounts = await db.conversation.groupBy({
        by: ['channel'],
        where: { status: { not: 'archived' } },
        _count: true,
      });

      const counts: Record<string, number> = { all: 0, gmail: 0, telegram: 0, whatsapp: 0 };
      for (const cc of allChannelCounts) {
        if (cc.channel in counts) {
          counts[cc.channel] = cc._count;
        }
      }
      counts.all = Object.values(counts).reduce((sum, c) => sum + c, 0) - (counts.all || 0);

      // Fetch message templates
      const templates = await db.messageTemplate.findMany({
        where: {
          userId: user.id,
          channel: channel && channel !== 'all' ? channel : undefined,
        },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
      });

      const formattedTemplates = templates.map((t) => ({
        id: t.id,
        name: t.name,
        channel: t.channel,
        content: t.content,
        subject: t.subject,
        createdAt: t.createdAt.toISOString(),
      }));

      return NextResponse.json({
        conversations: formattedConversations,
        counts,
        accounts,
        templates: formattedTemplates,
      });
    } catch (error) {
      console.error('[API] Error fetching messaging data:', error);
      return NextResponse.json({
        conversations: [],
        counts: { all: 0, gmail: 0, telegram: 0, whatsapp: 0 },
        accounts: [],
        templates: [],
      }, { status: 500 });
    }
  });
}
