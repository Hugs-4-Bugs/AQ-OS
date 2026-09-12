// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Reply Intelligence Service
// Phase 5: End-to-end Gmail reply processing with intelligence
//
// Processes Gmail replies:
// 1. Analyzes the reply using ReplyIntelligenceService
// 2. Creates notifications for important replies
// 3. Updates lead scores based on analysis
// 4. Moves leads in pipeline stages
// 5. Recommends meetings for high-intent replies
// 6. Creates ConversationMessage records with analysis metadata
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { replyIntelligenceService, type ReplyAnalysis } from '@/lib/reply-intelligence';

// ===== TYPES =====

export interface GmailReplyInput {
  messageId: string;
  threadId: string;
  fromEmail: string;
  subject: string;
  body: string;
}

export interface GmailReplyResult {
  analysis: ReplyAnalysis;
  notifications: number;
  scoreUpdated: boolean;
  pipelineUpdated: boolean;
  meetingRecommended: boolean;
}

// ===== GMAIL REPLY INTELLIGENCE SERVICE =====

export class GmailReplyIntelligenceService {
  /**
   * Process a Gmail reply end-to-end.
   * Takes a raw Gmail message, finds or creates the associated lead,
   * runs reply intelligence, and triggers all downstream actions.
   */
  async processGmailReply(userId: string, emailMessage: GmailReplyInput): Promise<GmailReplyResult> {
    const result: GmailReplyResult = {
      analysis: {
        sentiment: 'neutral',
        intent: 'neutral',
        buyingSignals: [],
        objections: [],
        urgency: 'low',
        recommendedAction: 'Review the reply manually',
        leadQualification: 'cold',
        shouldAutoRespond: false,
      },
      notifications: 0,
      scoreUpdated: false,
      pipelineUpdated: false,
      meetingRecommended: false,
    };

    try {
      // 1. Find the lead associated with this email
      const lead = await this.findLeadByEmail(emailMessage.fromEmail);

      if (!lead) {
        // No lead found - still analyze but limited actions
        const analysis = await replyIntelligenceService.analyzeReply(
          emailMessage.messageId,
          emailMessage.body,
          { source: 'gmail', subject: emailMessage.subject, fromEmail: emailMessage.fromEmail }
        );
        result.analysis = analysis;

        // Create a notification about an unlinked reply
        if (shouldNotifyForUnlinked(analysis)) {
          await db.notification.create({
            data: {
              userId,
              type: 'unlinked_reply',
              title: 'Reply from Unknown Lead',
              message: `Received a ${analysis.sentiment} reply from ${emailMessage.fromEmail} (Subject: ${emailMessage.subject}) but no matching lead was found.`,
              metadata: JSON.stringify({
                messageId: emailMessage.messageId,
                threadId: emailMessage.threadId,
                fromEmail: emailMessage.fromEmail,
                intent: analysis.intent,
                sentiment: analysis.sentiment,
              }),
            },
          });
          result.notifications = 1;
        }

        return result;
      }

      // 2. Store or update the email message record
      const emailThread = await this.findOrCreateEmailThread(
        userId,
        lead.id,
        emailMessage.threadId,
        emailMessage.subject
      );

      await db.emailMessage.create({
        data: {
          threadId: emailThread.id,
          gmailMessageId: emailMessage.messageId,
          fromEmail: emailMessage.fromEmail,
          toEmail: '', // Would be the user's Gmail address
          subject: emailMessage.subject,
          bodyPlain: emailMessage.body,
          direction: 'inbound',
          isRead: false,
          leadId: lead.id,
        },
      });

      // 3. Run full reply intelligence analysis
      const analysis = await replyIntelligenceService.analyzeReply(
        emailMessage.messageId,
        emailMessage.body,
        {
          businessName: lead.businessName,
          stage: lead.stage,
          emailStatus: lead.emailStatus,
          replyScore: lead.replyScore,
          conversionScore: lead.conversionScore,
          urgencyScore: lead.urgencyScore,
          revenuePotentialScore: lead.revenuePotentialScore,
          niche: lead.niche,
          source: 'gmail',
          subject: emailMessage.subject,
        }
      );
      result.analysis = analysis;

      // 4. Update lead scores based on analysis
      const scoreUpdate = computeGmailScoreUpdate(analysis);
      if (scoreUpdate.replyScoreDelta !== 0 || scoreUpdate.conversionScoreDelta !== 0 || scoreUpdate.urgencyScoreDelta !== 0) {
        await db.lead.update({
          where: { id: lead.id },
          data: {
            replyScore: Math.min(100, Math.max(0, lead.replyScore + scoreUpdate.replyScoreDelta)),
            conversionScore: Math.min(100, Math.max(0, lead.conversionScore + scoreUpdate.conversionScoreDelta)),
            urgencyScore: Math.min(100, Math.max(0, lead.urgencyScore + scoreUpdate.urgencyScoreDelta)),
            emailStatus: 'replied',
            lastContactedAt: new Date(),
          },
        });
        result.scoreUpdated = true;
      } else {
        // At least update emailStatus
        await db.lead.update({
          where: { id: lead.id },
          data: { emailStatus: 'replied', lastContactedAt: new Date() },
        });
      }

      // 5. Move lead in pipeline based on intent
      const newStage = computeGmailStageUpdate(lead.stage, analysis);
      if (newStage) {
        await db.lead.update({
          where: { id: lead.id },
          data: { stage: newStage },
        });
        result.pipelineUpdated = true;
      }

      // 6. Recommend meetings for high-intent replies
      if (analysis.intent === 'meeting_request' || (analysis.leadQualification === 'hot' && analysis.intent === 'interested')) {
        result.meetingRecommended = true;
      }

      // 7. Create notifications for important replies
      const notificationCount = await this.createGmailNotifications(
        userId,
        lead.id,
        lead.businessName,
        emailMessage,
        analysis
      );
      result.notifications = notificationCount;

      // 8. Create ConversationMessage with analysis metadata
      const conversation = await this.findOrCreateConversation(lead.id);
      await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          userId,
          senderType: 'lead',
          content: emailMessage.body,
          channel: 'email',
          direction: 'inbound',
          intent: analysis.intent,
          buyingSignals: JSON.stringify(analysis.buyingSignals),
          hesitationReasons: JSON.stringify(analysis.objections),
          metadata: JSON.stringify({
            gmailMessageId: emailMessage.messageId,
            gmailThreadId: emailMessage.threadId,
            fromEmail: emailMessage.fromEmail,
            subject: emailMessage.subject,
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            leadQualification: analysis.leadQualification,
            recommendedAction: analysis.recommendedAction,
            shouldAutoRespond: analysis.shouldAutoRespond,
            suggestedResponse: analysis.suggestedResponse,
            meetingRecommended: result.meetingRecommended,
          }),
        },
      });

      // 9. If meeting recommended, create a meeting notification
      if (result.meetingRecommended) {
        await db.notification.create({
          data: {
            userId,
            type: 'meeting_recommended',
            title: 'Meeting Recommended',
            message: `Lead ${lead.businessName} is ready for a meeting. ${analysis.recommendedAction}`,
            actionUrl: `/leads/${lead.id}`,
            metadata: JSON.stringify({
              leadId: lead.id,
              intent: analysis.intent,
              leadQualification: analysis.leadQualification,
              gmailThreadId: emailMessage.threadId,
            }),
          },
        });
        result.notifications++;
      }

      return result;
    } catch (error) {
      console.error('[GmailReplyIntelligence] Processing failed:', error);
      return result;
    }
  }

  // ===== PRIVATE HELPERS =====

  private async findLeadByEmail(fromEmail: string): Promise<{
    id: string;
    userId: string | null;
    businessName: string;
    stage: string;
    emailStatus: string | null;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    niche: string | null;
  } | null> {
    // Try to find lead by email
    const lead = await db.lead.findFirst({
      where: {
        email: fromEmail,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        businessName: true,
        stage: true,
        emailStatus: true,
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        niche: true,
      },
    });

    return lead;
  }

  private async findOrCreateEmailThread(
    userId: string,
    leadId: string,
    gmailThreadId: string,
    subject: string | null
  ): Promise<{ id: string }> {
    // Find the user's email account
    const emailAccount = await db.emailAccount.findFirst({
      where: { userId, status: 'active' },
    });

    if (!emailAccount) {
      // Create a minimal thread without email account link
      const existing = await db.emailThread.findFirst({
        where: { gmailThreadId },
      });
      if (existing) return existing;

      // We need an email account for the thread FK, so create one if needed
      // For now, try to find any thread with this gmailThreadId
      throw new Error('No active email account found for user');
    }

    // Find or create thread
    let thread = await db.emailThread.findFirst({
      where: { gmailThreadId, emailAccountId: emailAccount.id },
    });

    if (!thread) {
      thread = await db.emailThread.create({
        data: {
          emailAccountId: emailAccount.id,
          gmailThreadId,
          leadId,
          subject,
          lastMessageAt: new Date(),
          messageCount: 1,
          isRead: false,
        },
      });
    } else {
      await db.emailThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          messageCount: { increment: 1 },
          isRead: false,
        },
      });
    }

    return thread;
  }

  private async findOrCreateConversation(leadId: string): Promise<{ id: string }> {
    const existing = await db.conversation.findFirst({
      where: { leadId, channel: 'email', status: 'active' },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (existing) {
      await db.conversation.update({
        where: { id: existing.id },
        data: { lastMessageAt: new Date() },
      });
      return existing;
    }

    return db.conversation.create({
      data: {
        leadId,
        channel: 'email',
        status: 'active',
        lastMessageAt: new Date(),
      },
    });
  }

  private async createGmailNotifications(
    userId: string,
    leadId: string,
    businessName: string,
    emailMessage: GmailReplyInput,
    analysis: ReplyAnalysis
  ): Promise<number> {
    let count = 0;

    // Hot lead reply
    if (analysis.leadQualification === 'hot') {
      await db.notification.create({
        data: {
          userId,
          type: 'hot_lead_reply',
          title: 'Hot Lead Replied via Gmail!',
          message: `${businessName} replied with ${analysis.sentiment} sentiment. Buying signals: ${analysis.buyingSignals.join(', ') || 'none detected'}`,
          actionUrl: `/leads/${leadId}`,
          metadata: JSON.stringify({
            leadId,
            gmailThreadId: emailMessage.threadId,
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            leadQualification: analysis.leadQualification,
          }),
        },
      });
      count++;
    }

    // Urgent reply
    if (analysis.urgency === 'critical' || analysis.urgency === 'high') {
      await db.notification.create({
        data: {
          userId,
          type: 'urgent_reply',
          title: analysis.urgency === 'critical' ? 'Critical Gmail Reply!' : 'Urgent Gmail Reply',
          message: `${businessName}: ${analysis.recommendedAction}`,
          actionUrl: `/leads/${leadId}`,
          metadata: JSON.stringify({
            leadId,
            gmailThreadId: emailMessage.threadId,
            urgency: analysis.urgency,
          }),
        },
      });
      count++;
    }

    // Objection handling
    if (analysis.intent === 'objection' && analysis.objections.length > 0) {
      await db.notification.create({
        data: {
          userId,
          type: 'objection_reply',
          title: 'Lead Raised Objections',
          message: `${businessName} raised objections: ${analysis.objections.join(', ')}`,
          actionUrl: `/leads/${leadId}`,
          metadata: JSON.stringify({
            leadId,
            gmailThreadId: emailMessage.threadId,
            objections: analysis.objections,
          }),
        },
      });
      count++;
    }

    // Unsubscribe
    if (analysis.intent === 'unsubscribe') {
      await db.notification.create({
        data: {
          userId,
          type: 'unsubscribe',
          title: 'Lead Unsubscribed',
          message: `${businessName} has unsubscribed from your emails.`,
          actionUrl: `/leads/${leadId}`,
          metadata: JSON.stringify({
            leadId,
            fromEmail: emailMessage.fromEmail,
          }),
        },
      });
      count++;
    }

    // Meeting request
    if (analysis.intent === 'meeting_request') {
      await db.notification.create({
        data: {
          userId,
          type: 'meeting_request',
          title: 'Meeting Request via Gmail',
          message: `${businessName} requested a meeting. ${analysis.recommendedAction}`,
          actionUrl: `/leads/${leadId}`,
          metadata: JSON.stringify({
            leadId,
            gmailThreadId: emailMessage.threadId,
          }),
        },
      });
      count++;
    }

    return count;
  }
}

// ===== HELPER FUNCTIONS =====

function computeGmailScoreUpdate(analysis: ReplyAnalysis): {
  replyScoreDelta: number;
  conversionScoreDelta: number;
  urgencyScoreDelta: number;
} {
  let replyScoreDelta = 0;
  let conversionScoreDelta = 0;
  let urgencyScoreDelta = 0;

  switch (analysis.intent) {
    case 'interested':
      replyScoreDelta += 15;
      conversionScoreDelta += 10;
      break;
    case 'meeting_request':
      replyScoreDelta += 20;
      conversionScoreDelta += 20;
      break;
    case 'need_more_info':
      replyScoreDelta += 10;
      conversionScoreDelta += 5;
      break;
    case 'referral':
      replyScoreDelta += 15;
      conversionScoreDelta += 15;
      break;
    case 'objection':
      replyScoreDelta += 5;
      break;
    case 'not_interested':
      conversionScoreDelta -= 15;
      break;
    case 'unsubscribe':
      replyScoreDelta -= 10;
      conversionScoreDelta -= 20;
      break;
    case 'spam':
      replyScoreDelta -= 20;
      conversionScoreDelta -= 20;
      break;
    default:
      break;
  }

  switch (analysis.sentiment) {
    case 'positive':
      replyScoreDelta += 5;
      conversionScoreDelta += 5;
      break;
    case 'negative':
      replyScoreDelta -= 5;
      conversionScoreDelta -= 5;
      break;
    default:
      break;
  }

  replyScoreDelta += Math.min(10, analysis.buyingSignals.length * 3);
  conversionScoreDelta += Math.min(10, analysis.buyingSignals.length * 2);

  switch (analysis.urgency) {
    case 'critical':
      urgencyScoreDelta += 20;
      break;
    case 'high':
      urgencyScoreDelta += 10;
      break;
    case 'medium':
      urgencyScoreDelta += 5;
      break;
    default:
      break;
  }

  return { replyScoreDelta, conversionScoreDelta, urgencyScoreDelta };
}

function computeGmailStageUpdate(currentStage: string, analysis: ReplyAnalysis): string | null {
  switch (analysis.intent) {
    case 'meeting_request':
      return 'meeting_scheduled';
    case 'interested':
      if (['discovered', 'contacted'].includes(currentStage)) {
        return 'interested';
      }
      return null;
    case 'need_more_info':
      if (currentStage === 'discovered') {
        return 'contacted';
      }
      return null;
    case 'not_interested':
    case 'unsubscribe':
      return 'lost';
    default:
      if (analysis.leadQualification === 'hot') {
        if (currentStage === 'discovered') return 'contacted';
        if (currentStage === 'contacted') return 'interested';
      }
      return null;
  }
}

function shouldNotifyForUnlinked(analysis: ReplyAnalysis): boolean {
  return (
    analysis.leadQualification === 'hot' ||
    analysis.intent === 'meeting_request' ||
    analysis.urgency === 'critical' ||
    analysis.urgency === 'high'
  );
}

// ===== EXPORTED SINGLETON =====

export const gmailReplyIntelligenceService = new GmailReplyIntelligenceService();
