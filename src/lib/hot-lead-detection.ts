// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Hot Lead Detection Service
// Phase 7: Detect hot leads based on scoring and activity,
// generate alerts, and provide a dashboard feed
//
// Hot lead criteria:
// - Lead score > 70 (avg of replyScore + conversionScore +
//   urgencyScore + revenuePotentialScore)
// - Recent reply with positive sentiment
// - Meeting scheduled
// - Multiple email opens
// - Lead stage progression (moved to interested/meeting_scheduled)
// - High urgency score
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface HotLeadDetection {
  leadId: string;
  score: number;
  reasons: string[];
  urgency: 'high' | 'critical';
}

export interface HotLeadFeedEntry {
  lead: {
    id: string;
    businessName: string;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    niche: string | null;
    stage: string;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
  };
  score: number;
  reasons: string[];
  detectedAt: Date;
}

// ===== CONSTANTS =====

const HOT_LEAD_SCORE_THRESHOLD = 70;
const CRITICAL_LEAD_SCORE_THRESHOLD = 85;
const RECENT_REPLY_HOURS = 48;
const RECENT_STAGE_CHANGE_HOURS = 72;

// ===== HOT LEAD DETECTION SERVICE =====

export class HotLeadDetectionService {
  /**
   * Detect hot leads for a user based on scoring and activity.
   * Returns leads that meet any of the hot lead criteria.
   */
  async detectHotLeads(userId: string): Promise<HotLeadDetection[]> {
    const detections: HotLeadDetection[] = [];
    const now = new Date();
    const recentReplyCutoff = new Date(now.getTime() - RECENT_REPLY_HOURS * 60 * 60 * 1000);

    try {
      // Get all active leads for the user with their recent activity
      const leads = await db.lead.findMany({
        where: {
          userId,
          isActive: true,
          stage: { notIn: ['lost', 'closed_lost'] },
        },
        select: {
          id: true,
          businessName: true,
          replyScore: true,
          conversionScore: true,
          urgencyScore: true,
          revenuePotentialScore: true,
          stage: true,
          emailStatus: true,
          lastContactedAt: true,
          outreachMessages: {
            where: {
              status: 'opened',
              openedAt: { gte: recentReplyCutoff },
            },
            select: { id: true },
          },
        },
      });

      for (const lead of leads) {
        const reasons: string[] = [];
        let urgency: 'high' | 'critical' = 'high';

        // Calculate composite score
        const compositeScore = Math.round(
          (lead.replyScore + lead.conversionScore + lead.urgencyScore + lead.revenuePotentialScore) / 4
        );

        // Criterion 1: High composite score
        if (compositeScore >= HOT_LEAD_SCORE_THRESHOLD) {
          reasons.push(`High composite score (${compositeScore}/100)`);
        }

        // Criterion 2: Recent reply with positive sentiment (from conversation messages)
        const recentInboundMessages = await db.conversationMessage.findMany({
          where: {
            conversation: { leadId: lead.id },
            direction: 'inbound',
            createdAt: { gte: recentReplyCutoff },
            intent: { in: ['interested', 'meeting_request', 'need_more_info'] },
          },
          select: { id: true, intent: true },
          take: 5,
        });

        if (recentInboundMessages.length > 0) {
          reasons.push(`Recent positive reply (${recentInboundMessages.length} message${recentInboundMessages.length > 1 ? 's' : ''})`);
          if (recentInboundMessages.some(m => m.intent === 'meeting_request')) {
            urgency = 'critical';
          }
        }

        // Criterion 3: Meeting scheduled
        if (lead.stage === 'meeting_scheduled') {
          reasons.push('Meeting scheduled');
          urgency = 'critical';
        }

        // Criterion 4: Multiple email opens
        if (lead.outreachMessages.length >= 2) {
          reasons.push(`Multiple email opens (${lead.outreachMessages.length} opens)`);
        }

        // Criterion 5: Lead stage progression
        if (['interested', 'meeting_scheduled', 'proposal_sent', 'negotiation'].includes(lead.stage)) {
          reasons.push(`Advanced pipeline stage (${lead.stage})`);
        }

        // Criterion 6: High urgency score
        if (lead.urgencyScore >= 75) {
          reasons.push(`High urgency score (${lead.urgencyScore})`);
          if (lead.urgencyScore >= 90) {
            urgency = 'critical';
          }
        }

        // Only include if they meet at least one hot lead criterion
        if (reasons.length > 0) {
          // If composite score is critical, upgrade urgency
          if (compositeScore >= CRITICAL_LEAD_SCORE_THRESHOLD) {
            urgency = 'critical';
          }

          detections.push({
            leadId: lead.id,
            score: compositeScore,
            reasons,
            urgency,
          });
        }
      }

      // Sort by score descending
      detections.sort((a, b) => b.score - a.score);

      return detections;
    } catch (error) {
      console.error('[HotLeadDetection] Detection failed:', error);
      return [];
    }
  }

  /**
   * Generate alert notifications for hot leads.
   * Creates Notification records for each hot lead that doesn't
   * already have an unread hot_lead notification.
   */
  async generateAlerts(userId: string): Promise<number> {
    try {
      const detections = await this.detectHotLeads(userId);
      let alertCount = 0;

      for (const detection of detections) {
        // Check if there's already an unread hot lead notification for this lead
        const existingNotification = await db.notification.findFirst({
          where: {
            userId,
            type: 'hot_lead_detected',
            read: false,
            metadata: { contains: detection.leadId },
          },
        });

        if (existingNotification) {
          continue; // Skip - already notified
        }

        // Get lead details for the notification
        const lead = await db.lead.findUnique({
          where: { id: detection.leadId },
          select: { businessName: true },
        });

        await db.notification.create({
          data: {
            userId,
            type: 'hot_lead_detected',
            title: `${detection.urgency === 'critical' ? '🔥' : '⭐'} Hot Lead Detected!`,
            message: `${lead?.businessName || 'Unknown'} - Score: ${detection.score}/100. Reasons: ${detection.reasons.join(', ')}`,
            actionUrl: `/leads/${detection.leadId}`,
            metadata: JSON.stringify({
              leadId: detection.leadId,
              score: detection.score,
              reasons: detection.reasons,
              urgency: detection.urgency,
              detectedAt: new Date().toISOString(),
            }),
          },
        });

        alertCount++;
      }

      return alertCount;
    } catch (error) {
      console.error('[HotLeadDetection] Alert generation failed:', error);
      return 0;
    }
  }

  /**
   * Get hot leads feed for dashboard display.
   * Returns the most recently detected hot leads with full details.
   */
  async getHotLeadsFeed(userId: string, limit: number = 20): Promise<HotLeadFeedEntry[]> {
    try {
      const detections = await this.detectHotLeads(userId);

      // Limit results
      const limitedDetections = detections.slice(0, limit);

      // Fetch lead details for each detection
      const feed: HotLeadFeedEntry[] = [];

      for (const detection of limitedDetections) {
        const lead = await db.lead.findUnique({
          where: { id: detection.leadId },
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            email: true,
            phone: true,
            website: true,
            niche: true,
            stage: true,
            replyScore: true,
            conversionScore: true,
            urgencyScore: true,
            revenuePotentialScore: true,
          },
        });

        if (lead) {
          feed.push({
            lead,
            score: detection.score,
            reasons: detection.reasons,
            detectedAt: new Date(),
          });
        }
      }

      return feed;
    } catch (error) {
      console.error('[HotLeadDetection] Feed generation failed:', error);
      return [];
    }
  }
}

// ===== EXPORTED SINGLETON =====

export const hotLeadDetectionService = new HotLeadDetectionService();
