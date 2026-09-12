// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Analytics Service
// Phase 10: Messaging Remediation — Delivery, read, response metrics
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────

export interface ChannelDeliveryRates {
  channel: string;
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  period: string;
}

export interface ReadRateResult {
  channel: string;
  totalDelivered: number;
  totalRead: number;
  readRate: number;
  period: string;
}

export interface ResponseMetrics {
  channel: string;
  totalMessages: number;
  totalResponses: number;
  responseRate: number;
  avgResponseTimeMs: number;
  medianResponseTimeMs: number;
  period: string;
}

export interface MessageVolumePoint {
  date: string;
  channel: string;
  count: number;
}

export interface ChannelComparison {
  channel: string;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
  avgResponseTimeMs: number;
  volume: number;
  effectivenessScore: number; // composite: 0-100
}

export interface ConversationMetrics {
  totalConversations: number;
  avgLength: number;           // avg messages per conversation
  avgDurationMs: number;       // avg conversation duration
  resolutionRate: number;      // % of conversations that ended positively
  activeConversations: number;
  byChannel: Record<string, {
    count: number;
    avgLength: number;
    resolutionRate: number;
  }>;
}

export interface AnalyticsTimeRange {
  start: Date;
  end: Date;
}

// ─── Core Service Functions ───────────────────────────────────────

/**
 * Get delivery rates per channel (Telegram, WhatsApp)
 */
export async function getChannelDeliveryRates(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<ChannelDeliveryRates[]> {
  try {
    const channels = ['telegram', 'whatsapp', 'email'];
    const results: ChannelDeliveryRates[] = [];

    const dateFilter = timeRange
      ? { createdAt: { gte: timeRange.start, lte: timeRange.end } }
      : {};

    for (const channel of channels) {
      const [sent, delivered] = await Promise.all([
        db.outreachMessage.count({
          where: {
            userId,
            channel,
            status: { not: 'draft' },
            ...dateFilter,
          },
        }),
        db.outreachMessage.count({
          where: {
            userId,
            channel,
            status: { in: ['delivered', 'opened', 'replied'] },
            ...dateFilter,
          },
        }),
      ]);

      results.push({
        channel,
        totalSent: sent,
        totalDelivered: delivered,
        deliveryRate: sent > 0 ? delivered / sent : 0,
        period: timeRange
          ? `${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}`
          : 'all_time',
      });
    }

    return results;
  } catch (error) {
    console.error('Delivery rates fetch failed:', error);
    return [];
  }
}

/**
 * Get read rates per channel
 */
export async function getReadRates(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<ReadRateResult[]> {
  try {
    const channels = ['telegram', 'whatsapp', 'email'];
    const results: ReadRateResult[] = [];

    const dateFilter = timeRange
      ? { createdAt: { gte: timeRange.start, lte: timeRange.end } }
      : {};

    for (const channel of channels) {
      const [delivered, opened] = await Promise.all([
        db.outreachMessage.count({
          where: {
            userId,
            channel,
            status: { in: ['delivered', 'opened', 'replied'] },
            ...dateFilter,
          },
        }),
        db.outreachMessage.count({
          where: {
            userId,
            channel,
            status: { in: ['opened', 'replied'] },
            ...dateFilter,
          },
        }),
      ]);

      results.push({
        channel,
        totalDelivered: delivered,
        totalRead: opened,
        readRate: delivered > 0 ? opened / delivered : 0,
        period: timeRange
          ? `${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}`
          : 'all_time',
      });
    }

    return results;
  } catch (error) {
    console.error('Read rates fetch failed:', error);
    return [];
  }
}

/**
 * Get response rates and response times
 */
export async function getResponseMetrics(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<ResponseMetrics[]> {
  try {
    const channels = ['telegram', 'whatsapp', 'email'];
    const results: ResponseMetrics[] = [];

    const dateFilter = timeRange
      ? { createdAt: { gte: timeRange.start, lte: timeRange.end } }
      : {};

    for (const channel of channels) {
      const [totalMessages, responded] = await Promise.all([
        db.outreachMessage.count({
          where: {
            userId,
            channel,
            status: { not: 'draft' },
            ...dateFilter,
          },
        }),
        db.outreachMessage.findMany({
          where: {
            userId,
            channel,
            repliedAt: { not: null },
            sentAt: { not: null },
            ...dateFilter,
          },
          select: {
            sentAt: true,
            repliedAt: true,
          },
        }),
      ]);

      // Calculate response times
      const responseTimes = responded
        .filter(m => m.sentAt && m.repliedAt)
        .map(m => m.repliedAt!.getTime() - m.sentAt!.getTime())
        .filter(t => t > 0 && t < 30 * 24 * 60 * 60 * 1000); // Filter outliers > 30 days

      const avgResponseTimeMs = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      const medianResponseTimeMs = responseTimes.length > 0
        ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)]
        : 0;

      results.push({
        channel,
        totalMessages,
        totalResponses: responded.length,
        responseRate: totalMessages > 0 ? responded.length / totalMessages : 0,
        avgResponseTimeMs,
        medianResponseTimeMs,
        period: timeRange
          ? `${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}`
          : 'all_time',
      });
    }

    return results;
  } catch (error) {
    console.error('Response metrics fetch failed:', error);
    return [];
  }
}

/**
 * Get message volume over time (daily counts per channel)
 */
export async function getMessageVolume(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<MessageVolumePoint[]> {
  try {
    const startDate = timeRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = timeRange?.end || new Date();

    // Get all messages in the time range
    const messages = await db.outreachMessage.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'draft' },
      },
      select: {
        channel: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date and channel
    const volumeMap = new Map<string, Map<string, number>>();

    for (const msg of messages) {
      const dateKey = msg.createdAt.toISOString().split('T')[0];
      const channel = msg.channel;

      if (!volumeMap.has(dateKey)) {
        volumeMap.set(dateKey, new Map());
      }

      const channelMap = volumeMap.get(dateKey)!;
      channelMap.set(channel, (channelMap.get(channel) || 0) + 1);
    }

    // Convert to array
    const result: MessageVolumePoint[] = [];
    for (const [date, channelCounts] of volumeMap) {
      for (const [channel, count] of channelCounts) {
        result.push({ date, channel, count });
      }
    }

    return result;
  } catch (error) {
    console.error('Message volume fetch failed:', error);
    return [];
  }
}

/**
 * Compare channel effectiveness (composite score)
 */
export async function compareChannelEffectiveness(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<ChannelComparison[]> {
  try {
    const [deliveryRates, readRates, responseMetrics] = await Promise.all([
      getChannelDeliveryRates(userId, timeRange),
      getReadRates(userId, timeRange),
      getResponseMetrics(userId, timeRange),
    ]);

    const channels = ['telegram', 'whatsapp', 'email'];

    return channels.map(channel => {
      const delivery = deliveryRates.find(d => d.channel === channel);
      const read = readRates.find(r => r.channel === channel);
      const response = responseMetrics.find(r => r.channel === channel);

      const deliveryRate = delivery?.deliveryRate || 0;
      const readRate = read?.readRate || 0;
      const responseRate = response?.responseRate || 0;
      const avgResponseTimeMs = response?.avgResponseTimeMs || 0;
      const volume = delivery?.totalSent || 0;

      // Composite effectiveness score (0-100)
      // Weighted: delivery 30%, read 25%, response 30%, response time 15%
      const responseTimeScore = avgResponseTimeMs > 0
        ? Math.max(0, 100 - (avgResponseTimeMs / (60 * 60 * 1000)) * 10) // Deduct 10 pts per hour
        : 0;

      const effectivenessScore = Math.round(
        (deliveryRate * 30) +
        (readRate * 25) +
        (responseRate * 30) +
        (responseTimeScore * 0.15)
      );

      return {
        channel,
        deliveryRate,
        readRate,
        responseRate,
        avgResponseTimeMs,
        volume,
        effectivenessScore: Math.min(100, Math.max(0, effectivenessScore)),
      };
    });
  } catch (error) {
    console.error('Channel comparison failed:', error);
    return [];
  }
}

/**
 * Get conversation metrics (avg length, resolution rate)
 */
export async function getConversationMetrics(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<ConversationMetrics> {
  try {
    const dateFilter = timeRange
      ? { createdAt: { gte: timeRange.start, lte: timeRange.end } }
      : {};

    // Get conversations with message counts
    const conversations = await db.conversation.findMany({
      where: dateFilter,
      include: {
        messages: {
          select: {
            createdAt: true,
            intent: true,
            channel: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Calculate metrics
    const totalConversations = conversations.length;
    let totalMessages = 0;
    let resolvedConversations = 0;
    let totalDurationMs = 0;
    let durationCount = 0;
    const activeConversations = conversations.filter(c => c.status === 'active').length;

    const byChannel: Record<string, { count: number; totalMessages: number; resolved: number }> = {};

    for (const conv of conversations) {
      const msgCount = conv.messages.length;
      totalMessages += msgCount;

      // Check if resolved (positive intent in last message)
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg?.intent === 'positive') {
        resolvedConversations++;
      }

      // Calculate duration
      if (conv.messages.length > 1) {
        const firstMsg = conv.messages[0];
        const lastMsgTime = conv.messages[conv.messages.length - 1];
        const duration = lastMsgTime.createdAt.getTime() - firstMsg.createdAt.getTime();
        totalDurationMs += duration;
        durationCount++;
      }

      // Track by channel
      const channel = conv.channel;
      if (!byChannel[channel]) {
        byChannel[channel] = { count: 0, totalMessages: 0, resolved: 0 };
      }
      byChannel[channel].count++;
      byChannel[channel].totalMessages += msgCount;
      if (lastMsg?.intent === 'positive') {
        byChannel[channel].resolved++;
      }
    }

    const avgLength = totalConversations > 0 ? totalMessages / totalConversations : 0;
    const avgDurationMs = durationCount > 0 ? totalDurationMs / durationCount : 0;
    const resolutionRate = totalConversations > 0 ? resolvedConversations / totalConversations : 0;

    return {
      totalConversations,
      avgLength,
      avgDurationMs,
      resolutionRate,
      activeConversations,
      byChannel: Object.fromEntries(
        Object.entries(byChannel).map(([channel, data]) => [
          channel,
          {
            count: data.count,
            avgLength: data.count > 0 ? data.totalMessages / data.count : 0,
            resolutionRate: data.count > 0 ? data.resolved / data.count : 0,
          },
        ])
      ),
    };
  } catch (error) {
    console.error('Conversation metrics fetch failed:', error);
    return {
      totalConversations: 0,
      avgLength: 0,
      avgDurationMs: 0,
      resolutionRate: 0,
      activeConversations: 0,
      byChannel: {},
    };
  }
}

/**
 * Get comprehensive analytics summary for the user
 */
export async function getAnalyticsSummary(
  userId: string,
  timeRange?: AnalyticsTimeRange
): Promise<{
  deliveryRates: ChannelDeliveryRates[];
  readRates: ReadRateResult[];
  responseMetrics: ResponseMetrics[];
  messageVolume: MessageVolumePoint[];
  channelComparison: ChannelComparison[];
  conversationMetrics: ConversationMetrics;
}> {
  const [deliveryRates, readRates, responseMetrics, messageVolume, channelComparison, conversationMetrics] = await Promise.all([
    getChannelDeliveryRates(userId, timeRange),
    getReadRates(userId, timeRange),
    getResponseMetrics(userId, timeRange),
    getMessageVolume(userId, timeRange),
    compareChannelEffectiveness(userId, timeRange),
    getConversationMetrics(userId, timeRange),
  ]);

  return {
    deliveryRates,
    readRates,
    responseMetrics,
    messageVolume,
    channelComparison,
    conversationMetrics,
  };
}
