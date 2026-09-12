// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Broadcast Foundation Service
// Phase 10: Messaging Remediation — Campaign management, throttling, segmentation
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────

export type BroadcastChannel = 'whatsapp' | 'telegram' | 'email';
export type BroadcastStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface CreateBroadcastInput {
  userId: string;
  orgId?: string;
  name: string;
  channel: BroadcastChannel;
  audienceFilter: AudienceFilter;
  messageContent: string;
  templateId?: string;
  scheduledAt?: Date;
}

export interface AudienceFilter {
  tags?: string[];              // Lead tags to target
  stage?: string;               // Pipeline stage
  lastContactedBefore?: Date;   // Leads not contacted since
  lastContactedAfter?: Date;    // Leads contacted after
  minScore?: number;            // Minimum conversion score
  country?: string;             // Country filter
  niche?: string;               // Niche filter
  hasEmail?: boolean;           // Only leads with email
  hasPhone?: boolean;           // Only leads with phone
  hasWhatsapp?: boolean;        // Only leads with WhatsApp
}

export interface BroadcastDeliveryStats {
  broadcastId: string;
  totalTargets: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  respondedCount: number;
  failedCount: number;
  optedOutCount: number;
}

// ─── Throttle Constants ───────────────────────────────────────────

const CHANNEL_THROTTLE: Record<BroadcastChannel, {
  maxPerDay: number;
  maxPerMinute: number;
  description: string;
}> = {
  whatsapp: {
    maxPerDay: 1000,
    maxPerMinute: 20,
    description: 'WhatsApp Business API: 1000/day, 20/min',
  },
  telegram: {
    maxPerDay: 50000,
    maxPerMinute: 30,
    description: 'Telegram Bot API: 30 messages/min per chat',
  },
  email: {
    maxPerDay: 5000,
    maxPerMinute: 50,
    description: 'Email: 5000/day, 50/min',
  },
};

// In-memory throttle tracking
const throttleState = new Map<string, {
  sentToday: number;
  sentThisMinute: number;
  minuteStart: number;
  dayStart: number;
}>();

// ─── Core Service Functions ───────────────────────────────────────

/**
 * Create a new broadcast campaign
 */
export async function createBroadcast(input: CreateBroadcastInput): Promise<{
  success: boolean;
  broadcastId?: string;
  error?: string;
}> {
  try {
    // Validate message content
    if (!input.messageContent || input.messageContent.trim().length === 0) {
      return { success: false, error: 'Message content is required' };
    }

    // Check template if specified
    if (input.templateId) {
      const template = await db.messageTemplateApproval.findUnique({
        where: { id: input.templateId },
      });

      if (!template || template.userId !== input.userId) {
        return { success: false, error: 'Invalid template ID' };
      }

      if (template.status !== 'approved' && template.status !== 'active') {
        return { success: false, error: 'Template must be approved before use in broadcasts' };
      }
    }

    // Segment the audience (scoped to org if API key)
    const targetLeadIds = await segmentAudience(input.userId, input.audienceFilter, input.orgId);

    if (targetLeadIds.length === 0) {
      return { success: false, error: 'No leads match the audience filter criteria' };
    }

    // Create the broadcast
    const broadcast = await db.messageBroadcast.create({
      data: {
        userId: input.userId,
        ...(input.orgId ? { orgId: input.orgId } : {}),
        name: input.name,
        channel: input.channel,
        audienceFilter: JSON.stringify(input.audienceFilter),
        messageContent: input.messageContent,
        templateId: input.templateId,
        status: input.scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: input.scheduledAt,
        totalTargets: targetLeadIds.length,
        deliveredCount: 0,
        readCount: 0,
        respondedCount: 0,
      },
    });

    // Create broadcast targets for each lead
    const targetData = targetLeadIds.map(leadId => ({
      broadcastId: broadcast.id,
      leadId,
      status: 'pending',
    }));

    // Batch create targets (in chunks of 100 for SQLite)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < targetData.length; i += CHUNK_SIZE) {
      const chunk = targetData.slice(i, i + CHUNK_SIZE);
      await db.broadcastTarget.createMany({ data: chunk });
    }

    return { success: true, broadcastId: broadcast.id };
  } catch (error) {
    console.error('Broadcast creation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating broadcast',
    };
  }
}

/**
 * Segment audience by filter criteria
 */
export async function segmentAudience(
  userId: string,
  filter: AudienceFilter,
  orgId?: string
): Promise<string[]> {
  const where: Record<string, unknown> = {
    isActive: true,
    deletedAt: null,
    OR: [
      { userId },
      ...(orgId ? [{ orgId }] : []),
    ],
  };

  if (filter.tags && filter.tags.length > 0) {
    // Tags are stored as JSON array string; use contains for each tag
    where.tags = { in: filter.tags.map(t => JSON.stringify(t)) };
  }

  if (filter.stage) {
    where.stage = filter.stage;
  }

  if (filter.lastContactedBefore) {
    where.lastContactedAt = { lt: filter.lastContactedBefore };
  }

  if (filter.lastContactedAfter) {
    where.lastContactedAt = filter.lastContactedAfter;
  }

  if (filter.minScore) {
    where.conversionScore = { gte: filter.minScore };
  }

  if (filter.country) {
    where.country = filter.country;
  }

  if (filter.niche) {
    where.niche = filter.niche;
  }

  if (filter.hasEmail) {
    where.email = { not: null };
  }

  if (filter.hasPhone) {
    where.phone = { not: null };
  }

  if (filter.hasWhatsapp) {
    where.whatsapp = { not: null };
  }

  const leads = await db.lead.findMany({
    where,
    select: { id: true },
  });

  return leads.map(l => l.id);
}

/**
 * Schedule a broadcast for sending
 */
export async function scheduleBroadcast(
  broadcastId: string,
  userId: string,
  scheduledAt: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) {
      return { success: false, error: 'Broadcast not found or not authorized' };
    }

    if (broadcast.status !== 'draft') {
      return { success: false, error: 'Only draft broadcasts can be scheduled' };
    }

    if (scheduledAt <= new Date()) {
      return { success: false, error: 'Scheduled time must be in the future' };
    }

    await db.messageBroadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'scheduled',
        scheduledAt,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Scheduling failed',
    };
  }
}

/**
 * Throttle broadcast sends per channel
 * Returns true if the send is allowed, false if throttled
 */
export function throttleBroadcast(channel: BroadcastChannel): {
  allowed: boolean;
  waitMs: number;
  reason?: string;
} {
  const throttle = CHANNEL_THROTTLE[channel];
  const now = Date.now();

  let state = throttleState.get(channel);
  if (!state) {
    state = {
      sentToday: 0,
      sentThisMinute: 0,
      minuteStart: now,
      dayStart: now,
    };
    throttleState.set(channel, state);
  }

  // Reset minute counter
  if (now - state.minuteStart > 60000) {
    state.sentThisMinute = 0;
    state.minuteStart = now;
  }

  // Reset day counter
  if (now - state.dayStart > 86400000) {
    state.sentToday = 0;
    state.dayStart = now;
  }

  // Check minute limit
  if (state.sentThisMinute >= throttle.maxPerMinute) {
    const waitMs = 60000 - (now - state.minuteStart);
    return {
      allowed: false,
      waitMs,
      reason: `Minute rate limit reached for ${channel}: ${throttle.maxPerMinute}/min. Wait ${Math.ceil(waitMs / 1000)}s`,
    };
  }

  // Check daily limit
  if (state.sentToday >= throttle.maxPerDay) {
    const waitMs = 86400000 - (now - state.dayStart);
    return {
      allowed: false,
      waitMs,
      reason: `Daily rate limit reached for ${channel}: ${throttle.maxPerDay}/day. Wait ${Math.ceil(waitMs / 60000)}min`,
    };
  }

  // Increment counters
  state.sentThisMinute++;
  state.sentToday++;

  return { allowed: true, waitMs: 0 };
}

/**
 * Track broadcast delivery status
 * Updates the broadcast and target record with delivery status
 */
export async function trackBroadcastDelivery(
  broadcastId: string,
  targetId: string,
  status: 'sent' | 'delivered' | 'read' | 'responded' | 'failed',
  timestamp?: Date
): Promise<{ success: boolean }> {
  try {
    const now = timestamp || new Date();

    // Update the target
    const updateData: Record<string, unknown> = { status };
    if (status === 'sent') updateData.sentAt = now;
    if (status === 'delivered') updateData.deliveredAt = now;
    if (status === 'read') updateData.readAt = now;
    if (status === 'responded') updateData.respondedAt = now;

    await db.broadcastTarget.update({
      where: { id: targetId },
      data: updateData,
    });

    // Update broadcast counters
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (broadcast) {
      const counterUpdate: Record<string, number> = {};

      if (status === 'delivered') counterUpdate.deliveredCount = broadcast.deliveredCount + 1;
      if (status === 'read') counterUpdate.readCount = broadcast.readCount + 1;
      if (status === 'responded') counterUpdate.respondedCount = broadcast.respondedCount + 1;

      if (Object.keys(counterUpdate).length > 0) {
        await db.messageBroadcast.update({
          where: { id: broadcastId },
          data: counterUpdate,
        });
      }

      // Check if broadcast is complete
      const pendingTargets = await db.broadcastTarget.count({
        where: {
          broadcastId,
          status: 'pending',
        },
      });

      if (pendingTargets === 0) {
        await db.messageBroadcast.update({
          where: { id: broadcastId },
          data: { status: 'completed' },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Delivery tracking failed:', error);
    return { success: false };
  }
}

/**
 * Handle opt-out/unsubscribe during broadcast
 */
export async function handleBroadcastOptOut(
  leadId: string,
  channel: BroadcastChannel,
  broadcastId?: string
): Promise<{ success: boolean }> {
  try {
    // Create email unsubscribe record (reuse for all channels)
    const token = `optout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await db.emailUnsubscribe.create({
      data: {
        email: `broadcast_optout_${leadId}_${channel}`,
        leadId,
        token,
        reason: `Opted out of ${channel} broadcast${broadcastId ? ` ${broadcastId}` : ''}`,
      },
    });

    // If broadcast specified, mark all pending targets for this lead as opted out
    if (broadcastId) {
      await db.broadcastTarget.updateMany({
        where: {
          broadcastId,
          leadId,
          status: 'pending',
        },
        data: { status: 'failed' },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Opt-out handling failed:', error);
    return { success: false };
  }
}

/**
 * Get broadcast delivery statistics
 */
export async function getBroadcastDeliveryStats(
  broadcastId: string,
  userId: string
): Promise<BroadcastDeliveryStats | null> {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) return null;

    const [
      sentCount,
      deliveredCount,
      readCount,
      respondedCount,
      failedCount,
      optedOutCount,
    ] = await Promise.all([
      db.broadcastTarget.count({ where: { broadcastId, status: 'sent' } }),
      db.broadcastTarget.count({ where: { broadcastId, status: 'delivered' } }),
      db.broadcastTarget.count({ where: { broadcastId, status: 'read' } }),
      db.broadcastTarget.count({ where: { broadcastId, status: 'responded' } }),
      db.broadcastTarget.count({ where: { broadcastId, status: 'failed' } }),
      db.broadcastTarget.count({ where: { broadcastId, status: 'opted_out' } }),
    ]);

    return {
      broadcastId,
      totalTargets: broadcast.totalTargets,
      sentCount,
      deliveredCount: deliveredCount + broadcast.deliveredCount,
      readCount: readCount + broadcast.readCount,
      respondedCount: respondedCount + broadcast.respondedCount,
      failedCount,
      optedOutCount,
    };
  } catch (error) {
    console.error('Broadcast stats failed:', error);
    return null;
  }
}

/**
 * List broadcasts for a user
 */
export async function listBroadcasts(
  userId: string,
  status?: BroadcastStatus,
  page: number = 1,
  limit: number = 20,
  orgId?: string
): Promise<{
  broadcasts: Array<{
    id: string;
    name: string;
    channel: string;
    status: string;
    totalTargets: number;
    deliveredCount: number;
    readCount: number;
    respondedCount: number;
    scheduledAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const where: Record<string, unknown> = { userId };
  if (orgId) where.orgId = orgId;
  if (status) where.status = status;

  const [broadcasts, total] = await Promise.all([
    db.messageBroadcast.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.messageBroadcast.count({ where }),
  ]);

  return {
    broadcasts: broadcasts.map(b => ({
      id: b.id,
      name: b.name,
      channel: b.channel,
      status: b.status,
      totalTargets: b.totalTargets,
      deliveredCount: b.deliveredCount,
      readCount: b.readCount,
      respondedCount: b.respondedCount,
      scheduledAt: b.scheduledAt,
      createdAt: b.createdAt,
    })),
    total,
  };
}

/**
 * Get a single broadcast by ID
 */
export async function getBroadcast(broadcastId: string, userId: string) {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) return null;

    return {
      ...broadcast,
      audienceFilter: broadcast.audienceFilter ? JSON.parse(broadcast.audienceFilter) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Start a broadcast (change status from draft/scheduled to running)
 */
export async function startBroadcast(
  broadcastId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) {
      return { success: false, error: 'Broadcast not found or not authorized' };
    }

    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled' && broadcast.status !== 'paused') {
      return { success: false, error: `Cannot start broadcast in "${broadcast.status}" status` };
    }

    await db.messageBroadcast.update({
      where: { id: broadcastId },
      data: { status: 'running' },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start broadcast',
    };
  }
}

/**
 * Pause a running broadcast
 */
export async function pauseBroadcast(
  broadcastId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) {
      return { success: false, error: 'Broadcast not found or not authorized' };
    }

    if (broadcast.status !== 'running') {
      return { success: false, error: 'Only running broadcasts can be paused' };
    }

    await db.messageBroadcast.update({
      where: { id: broadcastId },
      data: { status: 'paused' },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause broadcast',
    };
  }
}

/**
 * Cancel a broadcast
 */
export async function cancelBroadcast(
  broadcastId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const broadcast = await db.messageBroadcast.findUnique({
      where: { id: broadcastId },
    });

    if (!broadcast || broadcast.userId !== userId) {
      return { success: false, error: 'Broadcast not found or not authorized' };
    }

    if (broadcast.status === 'completed' || broadcast.status === 'cancelled') {
      return { success: false, error: 'Cannot cancel a completed or already cancelled broadcast' };
    }

    // Cancel the broadcast
    await db.messageBroadcast.update({
      where: { id: broadcastId },
      data: { status: 'cancelled' },
    });

    // Mark all pending targets as failed
    await db.broadcastTarget.updateMany({
      where: {
        broadcastId,
        status: 'pending',
      },
      data: { status: 'failed' },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel broadcast',
    };
  }
}

/**
 * Get channel throttle configuration
 */
export function getChannelThrottleConfig(channel: BroadcastChannel) {
  return CHANNEL_THROTTLE[channel];
}
