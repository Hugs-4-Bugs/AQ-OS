// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Analytics Service
// Phase 9: Gmail Fixes — Aggregate metrics, rates, trends, best time
//
// Aggregates email metrics, calculates rates, tracks trends over time,
// and analyzes the best send times for optimal engagement.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface EmailMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

export interface EmailRates {
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  clickToOpenRate: number; // clicks / opens
}

export interface MetricsOverTime {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
}

export interface TemplateAnalytics {
  templateName: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export interface SequenceAnalytics {
  sequenceId: string;
  sequenceName: string;
  enrolled: number;
  completed: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  replyRate: number;
}

export interface BestSendTime {
  hour: number;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  openRate: number;
  clickRate: number;
  replyRate: number;
  sampleSize: number;
}

export interface AnalyticsResult {
  metrics: EmailMetrics;
  rates: EmailRates;
  metricsOverTime: MetricsOverTime[];
  templateAnalytics: TemplateAnalytics[];
  sequenceAnalytics: SequenceAnalytics[];
  bestSendTimes: BestSendTime[];
}

// ===== CORE FUNCTIONS =====

/**
 * Get raw email metrics for a user within a date range.
 */
export async function getEmailMetrics(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<EmailMetrics> {
  try {
    const dateFilter: Record<string, unknown> = {};
    if (options?.startDate) dateFilter.gte = options.startDate;
    if (options?.endDate) dateFilter.lte = options.endDate;

    const where: Record<string, unknown> = { userId };
    if (options?.startDate || options?.endDate) {
      where.createdAt = dateFilter;
    }

    // Get all outreach messages for the user
    const messages = await db.outreachMessage.findMany({
      where,
      select: { status: true, channel: true, sentAt: true, openedAt: true, repliedAt: true, bouncedAt: true },
    });

    const emailMessages = messages.filter(m => m.channel === 'email');

    const sent = emailMessages.filter(m => ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'].includes(m.status)).length;
    const delivered = emailMessages.filter(m => ['delivered', 'opened', 'clicked', 'replied'].includes(m.status)).length;
    const opened = emailMessages.filter(m => m.openedAt !== null).length;
    const clicked = emailMessages.filter(m => ['clicked', 'replied'].includes(m.status)).length;
    const replied = emailMessages.filter(m => m.repliedAt !== null).length;
    const bounced = emailMessages.filter(m => m.status === 'bounced' || m.bouncedAt !== null).length;

    return { sent, delivered, opened, clicked, replied, bounced };
  } catch (error) {
    console.error('[EmailAnalytics] Failed to get metrics:', error);
    return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
  }
}

/**
 * Calculate rates from raw metrics.
 */
export function calculateRates(metrics: EmailMetrics): EmailRates {
  const sent = metrics.sent || 1; // Avoid division by zero
  const opened = metrics.opened || 1;

  return {
    openRate: metrics.opened / sent,
    clickRate: metrics.clicked / sent,
    replyRate: metrics.replied / sent,
    bounceRate: metrics.bounced / sent,
    clickToOpenRate: metrics.clicked / opened,
  };
}

/**
 * Get email metrics broken down by time period (daily, weekly, monthly).
 */
export async function getMetricsOverTime(
  userId: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  options?: { startDate?: Date; endDate?: Date }
): Promise<MetricsOverTime[]> {
  try {
    const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
    const endDate = options?.endDate || new Date();

    const messages = await db.outreachMessage.findMany({
      where: {
        userId,
        channel: 'email',
        sentAt: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { status: true, sentAt: true, openedAt: true, repliedAt: true, bouncedAt: true, createdAt: true },
    });

    // Group by period
    const grouped = new Map<string, EmailMetrics>();

    for (const msg of messages) {
      const date = msg.sentAt || msg.createdAt;
      if (!date) continue;

      const dateKey = getPeriodKey(date, period);

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });
      }

      const metrics = grouped.get(dateKey)!;

      if (['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'].includes(msg.status)) {
        metrics.sent++;
      }
      if (['delivered', 'opened', 'clicked', 'replied'].includes(msg.status)) {
        metrics.delivered++;
      }
      if (msg.openedAt) metrics.opened++;
      if (['clicked', 'replied'].includes(msg.status)) metrics.clicked++;
      if (msg.repliedAt) metrics.replied++;
      if (msg.status === 'bounced' || msg.bouncedAt) metrics.bounced++;
    }

    // Convert to sorted array
    return Array.from(grouped.entries())
      .map(([date, metrics]) => ({ date, ...metrics }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('[EmailAnalytics] Failed to get metrics over time:', error);
    return [];
  }
}

/**
 * Get per-template analytics.
 * Uses the sequence step template or outreach message metadata.
 */
export async function getTemplateAnalytics(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<TemplateAnalytics[]> {
  try {
    // Group outreach messages by sequence step (which represents a template)
    const messages = await db.outreachMessage.findMany({
      where: {
        userId,
        channel: 'email',
        sequenceStepId: { not: null },
        ...(options?.startDate || options?.endDate
          ? { createdAt: { gte: options.startDate, lte: options.endDate } }
          : {}),
      },
      select: {
        sequenceStepId: true,
        status: true,
        openedAt: true,
        repliedAt: true,
        bouncedAt: true,
      },
    });

    // Group by sequenceStepId
    const byTemplate = new Map<string, { sent: number; opened: number; clicked: number; replied: number; bounced: number }>();

    for (const msg of messages) {
      const key = msg.sequenceStepId || 'unknown';
      if (!byTemplate.has(key)) {
        byTemplate.set(key, { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });
      }
      const stats = byTemplate.get(key)!;
      stats.sent++;
      if (msg.openedAt) stats.opened++;
      if (['clicked', 'replied'].includes(msg.status)) stats.clicked++;
      if (msg.repliedAt) stats.replied++;
      if (msg.status === 'bounced' || msg.bouncedAt) stats.bounced++;
    }

    // Look up template names
    const stepIds = Array.from(byTemplate.keys()).filter(k => k !== 'unknown');
    const steps = stepIds.length > 0
      ? await db.sequenceStep.findMany({
          where: { id: { in: stepIds } },
          select: { id: true, template: true },
        })
      : [];

    const stepMap = new Map(steps.map(s => [s.id, s.template]));

    return Array.from(byTemplate.entries()).map(([stepId, stats]) => ({
      templateName: stepMap.get(stepId) || `Step ${stepId.substring(0, 8)}...`,
      ...stats,
      openRate: stats.sent > 0 ? stats.opened / stats.sent : 0,
      clickRate: stats.sent > 0 ? stats.clicked / stats.sent : 0,
      replyRate: stats.sent > 0 ? stats.replied / stats.sent : 0,
    }));
  } catch (error) {
    console.error('[EmailAnalytics] Failed to get template analytics:', error);
    return [];
  }
}

/**
 * Get per-sequence analytics.
 */
export async function getSequenceAnalytics(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<SequenceAnalytics[]> {
  try {
    // Get user's sequences
    const sequences = await db.outreachSequence.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const results: SequenceAnalytics[] = [];

    for (const seq of sequences) {
      // Get enrollments
      const enrollments = await db.sequenceEnrollment.findMany({
        where: { sequenceId: seq.id },
        select: { status: true },
      });

      // Get messages for this sequence
      const steps = await db.sequenceStep.findMany({
        where: { sequenceId: seq.id },
        select: { id: true },
      });

      const stepIds = steps.map(s => s.id);

      const messages = stepIds.length > 0
        ? await db.outreachMessage.findMany({
            where: {
              sequenceStepId: { in: stepIds },
              ...(options?.startDate || options?.endDate
                ? { createdAt: { gte: options.startDate, lte: options.endDate } }
                : {}),
            },
            select: { status: true, openedAt: true, repliedAt: true, bouncedAt: true },
          })
        : [];

      const enrolled = enrollments.length;
      const completed = enrollments.filter(e => e.status === 'completed').length;
      const opened = messages.filter(m => m.openedAt).length;
      const clicked = messages.filter(m => ['clicked', 'replied'].includes(m.status)).length;
      const replied = messages.filter(m => m.repliedAt).length;
      const bounced = messages.filter(m => m.status === 'bounced' || m.bouncedAt).length;
      const totalSent = messages.filter(m => ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'].includes(m.status)).length;

      results.push({
        sequenceId: seq.id,
        sequenceName: seq.name,
        enrolled,
        completed,
        opened,
        clicked,
        replied,
        bounced,
        openRate: totalSent > 0 ? opened / totalSent : 0,
        replyRate: totalSent > 0 ? replied / totalSent : 0,
      });
    }

    return results;
  } catch (error) {
    console.error('[EmailAnalytics] Failed to get sequence analytics:', error);
    return [];
  }
}

/**
 * Analyze the best send times based on open and reply rates.
 * Groups sent emails by hour and day of week, then calculates
 * engagement rates for each combination.
 */
export async function analyzeBestSendTime(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<BestSendTime[]> {
  try {
    const messages = await db.outreachMessage.findMany({
      where: {
        userId,
        channel: 'email',
        sentAt: { not: null },
        ...(options?.startDate || options?.endDate
          ? { createdAt: { gte: options.startDate, lte: options.endDate } }
          : {}),
      },
      select: { sentAt: true, openedAt: true, status: true, repliedAt: true },
    });

    if (messages.length === 0) return [];

    // Group by (hour, dayOfWeek)
    const timeSlots = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();

    for (const msg of messages) {
      if (!msg.sentAt) continue;

      const date = new Date(msg.sentAt);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const key = `${hour}-${dayOfWeek}`;

      if (!timeSlots.has(key)) {
        timeSlots.set(key, { sent: 0, opened: 0, clicked: 0, replied: 0 });
      }

      const slot = timeSlots.get(key)!;
      slot.sent++;
      if (msg.openedAt) slot.opened++;
      if (['clicked', 'replied'].includes(msg.status)) slot.clicked++;
      if (msg.repliedAt) slot.replied++;
    }

    // Convert to array and calculate rates
    return Array.from(timeSlots.entries())
      .map(([key, stats]) => {
        const [hour, dayOfWeek] = key.split('-').map(Number);
        return {
          hour,
          dayOfWeek,
          openRate: stats.sent > 0 ? stats.opened / stats.sent : 0,
          clickRate: stats.sent > 0 ? stats.clicked / stats.sent : 0,
          replyRate: stats.sent > 0 ? stats.replied / stats.sent : 0,
          sampleSize: stats.sent,
        };
      })
      .filter(slot => slot.sampleSize >= 3) // Require at least 3 samples
      .sort((a, b) => (b.openRate + b.replyRate) - (a.openRate + a.replyRate))
      .slice(0, 20);
  } catch (error) {
    console.error('[EmailAnalytics] Failed to analyze best send time:', error);
    return [];
  }
}

// ===== HELPER FUNCTIONS =====

function getPeriodKey(date: Date, period: 'daily' | 'weekly' | 'monthly'): string {
  const d = new Date(date);

  switch (period) {
    case 'daily':
      return d.toISOString().split('T')[0]; // "2024-01-15"
    case 'weekly': {
      // Get the Monday of the week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().split('T')[0];
    }
    case 'monthly':
      return d.toISOString().substring(0, 7); // "2024-01"
    default:
      return d.toISOString().split('T')[0];
  }
}
