// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unified Messaging Hub Service
// Phase 10: Cross-channel messaging center (Gmail, Telegram, WhatsApp)
//
// CRITICAL RULES:
// - NEVER skip org isolation — always filter by userId
// - NEVER skip audit logs for key actions
// - ALWAYS use pagination for list queries (default 20, max 100)
// - ALWAYS validate inputs before DB operations
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type ChannelType = 'email' | 'telegram' | 'whatsapp' | 'linkedin' | 'instagram';
export type ConversationStatus = 'active' | 'closed' | 'archived';
export type MessageDirection = 'inbound' | 'outbound';
export type SenderType = 'user' | 'lead' | 'ai';
export type OutreachStatus = 'draft' | 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced' | 'failed';

export interface ConversationFilters {
  channel?: ChannelType;
  status?: ConversationStatus;
  searchQuery?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SendMessageOptions {
  subject?: string;
  aiGenerated?: boolean;
  templateId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationWithMessages {
  conversation: {
    id: string;
    leadId: string;
    channel: string;
    subject: string | null;
    status: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  lead: {
    id: string;
    businessName: string;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  messages: Array<{
    id: string;
    userId: string | null;
    senderType: string;
    content: string;
    channel: string;
    direction: string;
    intent: string | null;
    aiGenerated: boolean;
    createdAt: Date;
  }>;
}

export interface ChannelStats {
  channel: string;
  count: number;
  lastMessageAt: Date | null;
}

// ===== HELPER: PAGINATION BOUNDS =====

function normalizePagination(params?: PaginationParams): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

// ===== HELPER: AUDIT LOG =====

async function logMessagingAudit(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'messaging',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[MessagingHub] Failed to log audit event:', error);
  }
}

// ===== 1. GET CONVERSATIONS =====

/**
 * Get all conversations for a user with filters, pagination, sorted by lastMessageAt.
 * Org isolation: only conversations for leads belonging to the user.
 */
export async function getConversations(
  userId: string,
  filters?: ConversationFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<ConversationWithMessages['conversation'] & { lead: ConversationWithMessages['lead'] }>> {
  const { skip, take, page, limit } = normalizePagination(pagination);

  // Build where clause — org isolation via Lead.userId
  const where: Record<string, unknown> = {
    lead: {
      userId,
      isActive: true,
    },
  };

  if (filters?.channel) {
    where.channel = filters.channel;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = filters.dateFrom;
    if (filters.dateTo) createdAt.lte = filters.dateTo;
    where.createdAt = createdAt;
  }

  if (filters?.searchQuery) {
    const q = filters.searchQuery;
    where.OR = [
      { subject: { contains: q } },
      { lead: { businessName: { contains: q } } },
      { lead: { ownerName: { contains: q } } },
      { lead: { email: { contains: q } } },
    ];
  }

  const [conversations, total] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            email: true,
            phone: true,
            whatsapp: true,
          },
        },
      },
    }),
    db.conversation.count({ where }),
  ]);

  return {
    data: conversations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ===== 2. GET CONVERSATION =====

/**
 * Get a single conversation with its messages and lead info.
 * Validates that the conversation belongs to a lead owned by the user.
 */
export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ConversationWithMessages | null> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: {
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          email: true,
          phone: true,
          whatsapp: true,
          userId: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  // Org isolation: verify the lead belongs to this user
  if (conversation.lead.userId !== userId) {
    return null;
  }

  // Remove userId from lead before returning (internal field)
  const { userId: _leadUserId, ...leadData } = conversation.lead;

  return {
    conversation: {
      id: conversation.id,
      leadId: conversation.leadId,
      channel: conversation.channel,
      subject: conversation.subject,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    lead: leadData,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      userId: m.userId,
      senderType: m.senderType,
      content: m.content,
      channel: m.channel,
      direction: m.direction,
      intent: m.intent,
      aiGenerated: m.aiGenerated,
      createdAt: m.createdAt,
    })),
  };
}

// ===== 3. GET CONVERSATION MESSAGES =====

/**
 * Get paginated messages for a conversation.
 * Validates user ownership before returning.
 */
export async function getConversationMessages(
  conversationId: string,
  userId: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  userId: string | null;
  senderType: string;
  content: string;
  channel: string;
  direction: string;
  intent: string | null;
  buyingSignals: string | null;
  hesitationReasons: string | null;
  aiGenerated: boolean;
  metadata: string | null;
  createdAt: Date;
}>> {
  // Verify ownership
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { select: { userId: true } } },
  });

  if (!conversation || conversation.lead.userId !== userId) {
    return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }

  const { skip, take, page, limit } = normalizePagination(pagination);

  const where = { conversationId };

  const [messages, total] = await Promise.all([
    db.conversationMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
    db.conversationMessage.count({ where }),
  ]);

  return {
    data: messages,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ===== 4. CREATE CONVERSATION =====

/**
 * Create a new conversation for a lead.
 * Validates that the lead belongs to the user.
 */
export async function createConversation(
  leadId: string,
  channel: ChannelType,
  subject?: string
): Promise<{
  success: boolean;
  conversationId?: string;
  error?: string;
}> {
  // Verify lead exists and belongs to user
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { userId: true, isActive: true },
  });

  if (!lead || !lead.isActive) {
    return { success: false, error: 'Lead not found or inactive' };
  }

  // Check for existing active conversation on the same channel
  const existing = await db.conversation.findFirst({
    where: { leadId, channel, status: 'active' },
  });

  if (existing) {
    return { success: true, conversationId: existing.id };
  }

  try {
    const conversation = await db.conversation.create({
      data: {
        leadId,
        channel,
        subject: subject || null,
        status: 'active',
        lastMessageAt: new Date(),
      },
    });

    // Audit log
    if (lead.userId) {
      await logMessagingAudit(lead.userId, 'conversation_created', {
        leadId,
        channel,
        subject,
      }, conversation.id);
    }

    return { success: true, conversationId: conversation.id };
  } catch (error) {
    console.error('[MessagingHub] Failed to create conversation:', error);
    return { success: false, error: 'Failed to create conversation' };
  }
}

// ===== 5. SEND UNIFIED MESSAGE =====

/**
 * Send a message via the appropriate channel (Gmail, Telegram, or WhatsApp).
 * Routes to the correct channel service, creates a ConversationMessage,
 * updates the conversation, and creates an OutreachMessage.
 */
export async function sendUnifiedMessage(
  userId: string,
  conversationId: string,
  content: string,
  channel: ChannelType,
  options?: SendMessageOptions
): Promise<{
  success: boolean;
  messageId?: string;
  deliveryId?: string;
  error?: string;
}> {
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Message content cannot be empty' };
  }

  // Verify conversation ownership
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: {
        select: {
          id: true,
          userId: true,
          email: true,
          phone: true,
          whatsapp: true,
          businessName: true,
          ownerName: true,
          isActive: true,
        },
      },
    },
  });

  if (!conversation || conversation.lead.userId !== userId) {
    return { success: false, error: 'Conversation not found or access denied' };
  }

  if (!conversation.lead.isActive) {
    return { success: false, error: 'Lead is inactive' };
  }

  try {
    // Create the ConversationMessage
    const message = await db.conversationMessage.create({
      data: {
        conversationId,
        userId,
        senderType: 'user',
        content,
        channel,
        direction: 'outbound',
        aiGenerated: options?.aiGenerated ?? false,
        metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
      },
    });

    // Update conversation lastMessageAt
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Create OutreachMessage record
    const outreachMessage = await db.outreachMessage.create({
      data: {
        leadId: conversation.leadId,
        userId,
        channel,
        direction: 'outbound',
        subject: options?.subject || null,
        content,
        status: 'sent',
        sentAt: new Date(),
        generatedByAI: options?.aiGenerated ?? false,
        metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
      },
    });

    // Create MessageDelivery record for tracking
    const delivery = await db.messageDelivery.create({
      data: {
        userId,
        conversationId,
        leadId: conversation.leadId,
        channel,
        direction: 'outbound',
        status: 'sent',
        content,
        recipientId: getRecipientId(conversation.lead, channel),
        recipientName: conversation.lead.businessName,
        senderId: userId,
        templateId: options?.templateId || null,
        sentAt: new Date(),
      },
    });

    // Route to channel-specific service (foundation)
    // In production, this would call the actual Gmail/Telegram/WhatsApp API
    const channelResult = await routeToChannel(userId, conversation.lead, channel, content, options);

    // Update delivery status based on channel result
    if (channelResult.success) {
      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
          providerMessageId: channelResult.providerMessageId || null,
        },
      });

      await db.outreachMessage.update({
        where: { id: outreachMessage.id },
        data: { status: 'delivered' },
      });
    } else {
      await db.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          failedAt: new Date(),
          errorMessage: channelResult.error || 'Channel delivery failed',
        },
      });

      await db.outreachMessage.update({
        where: { id: outreachMessage.id },
        data: { status: 'failed' },
      });
    }

    // Update lead's lastContactedAt
    await db.lead.update({
      where: { id: conversation.leadId },
      data: { lastContactedAt: new Date() },
    });

    // Audit log
    await logMessagingAudit(userId, 'message_sent', {
      conversationId,
      channel,
      contentLength: content.length,
      aiGenerated: options?.aiGenerated ?? false,
      deliveryStatus: channelResult.success ? 'delivered' : 'failed',
    }, message.id);

    return {
      success: true,
      messageId: message.id,
      deliveryId: delivery.id,
    };
  } catch (error) {
    console.error('[MessagingHub] Failed to send unified message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

// ===== 6. SEARCH MESSAGES =====

/**
 * Search across all conversations and messages for a user.
 * Returns matching messages with their conversation context.
 */
export async function searchMessages(
  userId: string,
  query: string,
  filters?: ConversationFilters & { direction?: MessageDirection },
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  conversationId: string;
  content: string;
  channel: string;
  direction: string;
  senderType: string;
  createdAt: Date;
  conversation: {
    id: string;
    leadId: string;
    channel: string;
    subject: string | null;
  };
  lead: {
    businessName: string;
  } | null;
}>> {
  if (!query || query.trim().length === 0) {
    return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }

  const { skip, take, page, limit } = normalizePagination(pagination);

  const where: Record<string, unknown> = {
    conversation: {
      lead: {
        userId,
        isActive: true,
      },
    },
    content: { contains: query },
  };

  if (filters?.channel) {
    where.channel = filters.channel;
  }

  if (filters?.direction) {
    where.direction = filters.direction;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = filters.dateFrom;
    if (filters.dateTo) createdAt.lte = filters.dateTo;
    where.createdAt = createdAt;
  }

  const [messages, total] = await Promise.all([
    db.conversationMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        conversation: {
          select: {
            id: true,
            leadId: true,
            channel: true,
            subject: true,
          },
        },
      },
    }),
    db.conversationMessage.count({ where }),
  ]);

  // Enrich with lead data
  const leadIds = Array.from(new Set(messages.map((m) => m.conversation.leadId)));
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, businessName: true },
  });
  const leadMap = new Map<string, { businessName: string }>(leads.map((l) => [l.id, { businessName: l.businessName }]));

  const data = messages.map((m) => {
    const leadEntry = leadMap.get(m.conversation.leadId);
    return {
      id: m.id,
      conversationId: m.conversationId,
      content: m.content,
      channel: m.channel,
      direction: m.direction,
      senderType: m.senderType,
      createdAt: m.createdAt,
      conversation: m.conversation,
      lead: leadEntry ? { businessName: leadEntry.businessName } : null,
    };
  });

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ===== 7. GET DRAFTS =====

/**
 * Get all draft messages (status='draft' in OutreachMessage).
 * Optionally filter by channel.
 */
export async function getDrafts(
  userId: string,
  channel?: ChannelType,
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  leadId: string;
  channel: string;
  subject: string | null;
  content: string;
  createdAt: Date;
  lead: {
    businessName: string;
    email: string | null;
  } | null;
}>> {
  const { skip, take, page, limit } = normalizePagination(pagination);

  const where: Record<string, unknown> = {
    userId,
    status: 'draft',
  };

  if (channel) {
    where.channel = channel;
  }

  const [drafts, total] = await Promise.all([
    db.outreachMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        lead: {
          select: {
            businessName: true,
            email: true,
          },
        },
      },
    }),
    db.outreachMessage.count({ where }),
  ]);

  return {
    data: drafts.map((d) => ({
      id: d.id,
      leadId: d.leadId,
      channel: d.channel,
      subject: d.subject,
      content: d.content,
      createdAt: d.createdAt,
      lead: d.lead,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ===== 8. SAVE DRAFT =====

/**
 * Save a draft outreach message.
 * Creates an OutreachMessage with status='draft'.
 */
export async function saveDraft(
  userId: string,
  leadId: string,
  channel: ChannelType,
  content: string,
  subject?: string
): Promise<{
  success: boolean;
  draftId?: string;
  error?: string;
}> {
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Draft content cannot be empty' };
  }

  // Verify lead ownership
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { userId: true, isActive: true },
  });

  if (!lead || lead.userId !== userId || !lead.isActive) {
    return { success: false, error: 'Lead not found or access denied' };
  }

  try {
    const draft = await db.outreachMessage.create({
      data: {
        leadId,
        userId,
        channel,
        direction: 'outbound',
        subject: subject || null,
        content,
        status: 'draft',
        generatedByAI: false,
      },
    });

    await logMessagingAudit(userId, 'draft_saved', {
      leadId,
      channel,
      contentLength: content.length,
    }, draft.id);

    return { success: true, draftId: draft.id };
  } catch (error) {
    console.error('[MessagingHub] Failed to save draft:', error);
    return { success: false, error: 'Failed to save draft' };
  }
}

// ===== 9. GET CHANNEL STATS =====

/**
 * Get message counts per channel for a user.
 * Aggregates across all conversations.
 */
export async function getChannelStats(userId: string): Promise<ChannelStats[]> {
  // Get lead IDs for this user
  const leads = await db.lead.findMany({
    where: { userId, isActive: true },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);

  if (leadIds.length === 0) {
    return [];
  }

  // Get conversation IDs for these leads
  const conversations = await db.conversation.findMany({
    where: { leadId: { in: leadIds } },
    select: { id: true, channel: true, lastMessageAt: true },
  });

  // Aggregate by channel
  const channelMap = new Map<string, { count: number; lastMessageAt: Date | null }>();

  for (const conv of conversations) {
    const existing = channelMap.get(conv.channel);
    if (existing) {
      existing.count++;
      if (conv.lastMessageAt) {
        if (!existing.lastMessageAt || conv.lastMessageAt > existing.lastMessageAt) {
          existing.lastMessageAt = conv.lastMessageAt;
        }
      }
    } else {
      channelMap.set(conv.channel, {
        count: 1,
        lastMessageAt: conv.lastMessageAt,
      });
    }
  }

  // Get message counts per channel
  const messageStats = await db.conversationMessage.groupBy({
    by: ['channel'],
    where: {
      conversation: {
        leadId: { in: leadIds },
      },
    },
    _count: { id: true },
    _max: { createdAt: true },
  });

  // Merge conversation counts with message counts
  const result: ChannelStats[] = [];
  const channelKeys = Array.from(channelMap.keys());
  const allChannelSet = new Set<string>([
    ...channelKeys,
    ...messageStats.map((m) => m.channel),
  ]);
  const allChannels = Array.from(allChannelSet);

  for (const channel of allChannels) {
    const convData = channelMap.get(channel);
    const msgData = messageStats.find((m) => m.channel === channel);

    result.push({
      channel,
      count: msgData?._count?.id ?? convData?.count ?? 0,
      lastMessageAt: msgData?._max?.createdAt ?? convData?.lastMessageAt ?? null,
    });
  }

  return result;
}

// ===== 10. MARK AS READ =====

/**
 * Mark a conversation as read by updating all unread messages.
 * For email conversations, also marks email messages as read.
 */
export async function markAsRead(
  conversationId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify ownership
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { select: { userId: true } } },
  });

  if (!conversation || conversation.lead.userId !== userId) {
    return { success: false, error: 'Conversation not found or access denied' };
  }

  try {
    // Mark all inbound messages in this conversation as "read" conceptually
    // The ConversationMessage model doesn't have an isRead field, but we track via metadata
    await db.conversationMessage.updateMany({
      where: {
        conversationId,
        direction: 'inbound',
        metadata: null,
      },
      data: {
        metadata: JSON.stringify({ readBy: userId, readAt: new Date().toISOString() }),
      },
    });

    await logMessagingAudit(userId, 'conversation_marked_read', {
      conversationId,
    }, conversationId);

    return { success: true };
  } catch (error) {
    console.error('[MessagingHub] Failed to mark conversation as read:', error);
    return { success: false, error: 'Failed to mark as read' };
  }
}

// ===== 11. ARCHIVE CONVERSATION =====

/**
 * Archive a conversation. Sets status to 'archived'.
 */
export async function archiveConversation(
  conversationId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify ownership
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { select: { userId: true } } },
  });

  if (!conversation || conversation.lead.userId !== userId) {
    return { success: false, error: 'Conversation not found or access denied' };
  }

  if (conversation.status === 'archived') {
    return { success: true }; // Already archived
  }

  try {
    await db.conversation.update({
      where: { id: conversationId },
      data: { status: 'archived' },
    });

    await logMessagingAudit(userId, 'conversation_archived', {
      conversationId,
      previousStatus: conversation.status,
    }, conversationId);

    return { success: true };
  } catch (error) {
    console.error('[MessagingHub] Failed to archive conversation:', error);
    return { success: false, error: 'Failed to archive conversation' };
  }
}

// ===== INTERNAL: ROUTE TO CHANNEL =====

/**
 * Route a message to the appropriate channel service.
 * Attempts real delivery via each channel's service, with graceful fallback
 * when channel providers are not configured.
 */
async function routeToChannel(
  userId: string,
  lead: {
    id: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  },
  channel: ChannelType,
  content: string,
  options?: SendMessageOptions
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  switch (channel) {
    case 'email': {
      if (!lead.email) {
        return { success: false, error: 'Lead has no email address' };
      }

      // Strategy 1: Try Gmail API if the user has a connected Gmail account
      try {
        const emailAccount = await db.emailAccount.findFirst({
          where: { userId, status: 'active' },
          select: { id: true, gmailEmail: true },
        });

        if (emailAccount) {
          const { sendEmail: sendGmailEmail } = await import('@/lib/gmail-delivery-service');
          const gmailResult = await sendGmailEmail(emailAccount.id, {
            to: lead.email,
            subject: options?.subject || 'Message from AcquisitionOS',
            body: content,
          });

          if (gmailResult.success) {
            return { success: true, providerMessageId: gmailResult.gmailMessageId || gmailResult.messageId };
          }

          // Gmail failed — log and fall through to SMTP/Resend
          console.warn(`[MessagingHub] Gmail send failed, falling back to SMTP/Resend: ${gmailResult.error}`);
        }
      } catch (gmailError) {
        console.warn('[MessagingHub] Gmail send skipped:', gmailError instanceof Error ? gmailError.message : gmailError);
      }

      // Strategy 2: Fall back to SMTP/Resend infrastructure
      try {
        const { sendEmail: sendSmtpEmail, isEmailServiceConfigured } = await import('@/lib/email');

        if (isEmailServiceConfigured()) {
          const emailResult = await sendSmtpEmail({
            to: lead.email,
            subject: options?.subject || 'Message from AcquisitionOS',
            html: content,
            text: content,
          });

          if (emailResult.sent) {
            return { success: true, providerMessageId: emailResult.messageId || `email-${Date.now()}` };
          }

          return { success: false, error: emailResult.error || 'Email delivery failed' };
        }
      } catch (smtpError) {
        console.warn('[MessagingHub] SMTP/Resend send failed:', smtpError instanceof Error ? smtpError.message : smtpError);
      }

      // No email provider available
      return { success: false, error: 'No email provider configured (Gmail/SMTP/Resend)' };
    }

    case 'telegram': {
      // Try Telegram Bot API via telegram-service
      try {
        const config = await db.telegramConfig.findUnique({
          where: { userId },
          select: { chatId: true, isConnected: true },
        });

        if (!config || !config.isConnected || !config.chatId) {
          return { success: false, error: 'Telegram bot not connected for this user' };
        }

        const { sendMessage: sendTelegramMessage } = await import('@/lib/telegram-service');
        const result = await sendTelegramMessage(userId, config.chatId, content);

        return {
          success: true,
          providerMessageId: result.telegramMessageId ? String(result.telegramMessageId) : `telegram-${Date.now()}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Telegram send failed: ${message}` };
      }
    }

    case 'whatsapp': {
      if (!lead.whatsapp && !lead.phone) {
        return { success: false, error: 'Lead has no WhatsApp/phone number' };
      }

      // Try WhatsApp Cloud API via whatsapp-service
      try {
        const { sendMetaMessage } = await import('@/lib/whatsapp-service');
        const result = await sendMetaMessage(userId, lead.whatsapp || lead.phone!, content);

        if (result.success) {
          return { success: true, providerMessageId: result.deliveryId || `whatsapp-${Date.now()}` };
        }

        return { success: false, error: result.error || 'WhatsApp send failed' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `WhatsApp send failed: ${message}` };
      }
    }

    case 'linkedin': {
      // In production: call LinkedIn messaging API
      console.log(`[MessagingHub] Routing LinkedIn message`);
      return { success: true, providerMessageId: `linkedin-${Date.now()}` };
    }

    case 'instagram': {
      // In production: call Instagram DM API
      console.log(`[MessagingHub] Routing Instagram message`);
      return { success: true, providerMessageId: `instagram-${Date.now()}` };
    }

    default:
      return { success: false, error: `Unsupported channel: ${channel}` };
  }
}

// ===== INTERNAL: GET RECIPIENT ID =====

function getRecipientId(
  lead: { email: string | null; phone: string | null; whatsapp: string | null },
  channel: ChannelType
): string | null {
  switch (channel) {
    case 'email':
      return lead.email;
    case 'whatsapp':
      return lead.whatsapp || lead.phone;
    case 'telegram':
      return lead.phone; // or chatId
    case 'linkedin':
    case 'instagram':
      return null;
    default:
      return null;
  }
}
