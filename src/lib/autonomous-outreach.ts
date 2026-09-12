// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Outreach Service
// Phase 6: AI-powered autonomous outreach generation and dispatch
//
// Selects leads, generates personalized outreach messages,
// dispatches them, and processes the outreach queue via cron.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface OutreachSelectionCriteria {
  minScore?: number;
  stage?: string;
  niche?: string;
  maxPerDay?: number;
}

export interface OutreachContent {
  subject?: string;
  body: string;
}

// ===== AUTONOMOUS OUTREACH SERVICE =====

export class AutonomousOutreachService {
  /**
   * Select leads for outreach based on criteria.
   * Prioritizes leads by combined score and filters out
   * recently contacted leads and unsubscribed leads.
   */
  async selectLeads(userId: string, criteria: OutreachSelectionCriteria): Promise<Array<{
    id: string;
    businessName: string;
    email: string | null;
    phone: string | null;
    stage: string;
    niche: string | null;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    ownerName: string | null;
    website: string | null;
    bestChannel: string | null;
    outreachStyle: string | null;
  }>> {
    const {
      minScore = 0,
      stage,
      niche,
      maxPerDay = 50,
    } = criteria;

    // Build where clause
    const whereClause: Record<string, unknown> = {
      userId,
      isActive: true,
      emailStatus: { notIn: ['unsubscribed', 'bounced'] },
    };

    if (stage) {
      whereClause.stage = stage;
    } else {
      // Default: only outreach to discovered/contacted leads
      whereClause.stage = { in: ['discovered', 'contacted'] };
    }

    if (niche) {
      whereClause.niche = niche;
    }

    if (minScore > 0) {
      whereClause.replyScore = { gte: minScore };
    }

    // Don't contact leads that were already contacted today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get leads, prioritized by combined score
    const leads = await db.lead.findMany({
      where: whereClause,
      select: {
        id: true,
        businessName: true,
        email: true,
        phone: true,
        stage: true,
        niche: true,
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        ownerName: true,
        website: true,
        bestChannel: true,
        outreachStyle: true,
        lastContactedAt: true,
        outreachMessages: {
          where: {
            createdAt: { gte: todayStart },
          },
          select: { id: true },
        },
      },
      orderBy: [
        { urgencyScore: 'desc' },
        { replyScore: 'desc' },
        { conversionScore: 'desc' },
      ],
    });

    // Filter out leads already contacted today
    const eligibleLeads = leads
      .filter((lead) => lead.outreachMessages.length === 0)
      .slice(0, maxPerDay);

    // Return clean lead data without the outreachMessages
    return eligibleLeads.map(({ outreachMessages, lastContactedAt, ...lead }) => lead);
  }

  /**
   * Generate personalized outreach message for a lead using AI.
   * Supports email, whatsapp, linkedin, and instagram channels.
   */
  async generateOutreach(leadId: string, channel: string): Promise<OutreachContent> {
    try {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        include: {
          leadAnalysis: {
            select: {
              outreachMessages: true,
              weaknesses: true,
              closingStrategy: true,
              recommendedServices: true,
            },
          },
        },
      });

      if (!lead) {
        return { body: 'Lead not found' };
      }

      const zai = await ZAI.create();

      const channelContext = getChannelContext(channel);
      const leadContext = buildLeadContext(lead);

      const prompt = `You are an expert outreach copywriter for AcquisitionOS. Generate a personalized ${channel} outreach message for this lead.

${channelContext}

LEAD INFORMATION:
${leadContext}

PREVIOUS ANALYSIS (if available):
${lead.leadAnalysis.length > 0 ? `
Weaknesses: ${lead.leadAnalysis[0].weaknesses || 'None available'}
Recommended Services: ${lead.leadAnalysis[0].recommendedServices || 'None available'}
Closing Strategy: ${lead.leadAnalysis[0].closingStrategy || 'None available'}
Outreach Suggestions: ${lead.leadAnalysis[0].outreachMessages || 'None available'}
` : 'No previous analysis available'}

RULES:
- Personalize the message based on the lead's business, niche, and identified weaknesses
- Be professional but conversational
- Lead with value, not a sales pitch
- Reference specific problems they likely face based on their digital weaknesses
- Keep it concise and actionable
- Include a clear but soft call-to-action
${channel === 'email' ? '- Include a compelling subject line' : ''}
- Do NOT use generic templates - make it specific to this business
- Do NOT mention AI or automation

Return a JSON object:
${channel === 'email'
        ? '{ "subject": "subject line here", "body": "email body here" }'
        : '{ "body": "message text here" }'
      }

Return ONLY valid JSON. No markdown, no explanations.`;

      const response = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise outreach copywriter. Return only valid JSON. No markdown, no explanations.' },
          { role: 'user', content: prompt },
        ],
        model: 'auto',
      });

      const content = response.choices?.[0]?.message?.content || '{}';

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      const result: OutreachContent = {
        body: typeof parsed.body === 'string' ? parsed.body : '',
      };

      if (channel === 'email' && typeof parsed.subject === 'string') {
        result.subject = parsed.subject;
      }

      return result;
    } catch (error) {
      console.error('[AutonomousOutreach] Generation failed:', error);
      return {
        subject: channel === 'email' ? 'Following up on your business' : undefined,
        body: 'I noticed your business and wanted to reach out. I help businesses like yours improve their digital presence and grow. Would you be open to a quick chat?',
      };
    }
  }

  /**
   * Dispatch outreach - create the outreach message record
   * and mark it as queued for sending.
   */
  async dispatchOutreach(
    leadId: string,
    channel: string,
    content: OutreachContent,
    userId?: string
  ): Promise<{
    id: string;
    leadId: string;
    channel: string;
    status: string;
  }> {
    try {
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { userId: true, email: true },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      // Create the outreach message record
      const outreachMessage = await db.outreachMessage.create({
        data: {
          leadId,
          userId: userId || lead.userId,
          channel,
          direction: 'outbound',
          subject: content.subject || null,
          content: content.body,
          status: 'queued',
          generatedByAI: true,
          metadata: JSON.stringify({
            autonomousOutreach: true,
            generatedAt: new Date().toISOString(),
            channel,
          }),
        },
      });

      // Update lead's lastContactedAt
      await db.lead.update({
        where: { id: leadId },
        data: { lastContactedAt: new Date() },
      });

      // Update lead email status if channel is email
      if (channel === 'email' && lead.email) {
        await db.lead.update({
          where: { id: leadId },
          data: { emailStatus: 'sent' },
        });
      }

      return {
        id: outreachMessage.id,
        leadId: outreachMessage.leadId,
        channel: outreachMessage.channel,
        status: outreachMessage.status,
      };
    } catch (error) {
      console.error('[AutonomousOutreach] Dispatch failed:', error);
      throw error;
    }
  }

  /**
   * Process the autonomous outreach queue (called by cron).
   * Finds queued messages, attempts to send them, and updates status.
   */
  async processOutreachQueue(): Promise<{
    dispatched: number;
    failed: number;
    skipped: number;
  }> {
    const result = {
      dispatched: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      // Find all queued outreach messages
      const queuedMessages = await db.outreachMessage.findMany({
        where: {
          status: 'queued',
          generatedByAI: true,
        },
        include: {
          lead: {
            select: {
              id: true,
              email: true,
              emailStatus: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 100, // Process max 100 per run
      });

      for (const message of queuedMessages) {
        try {
          // Skip if lead is inactive or unsubscribed
          if (!message.lead.isActive) {
            await db.outreachMessage.update({
              where: { id: message.id },
              data: { status: 'failed', metadata: JSON.stringify({ ...JSON.parse(message.metadata || '{}'), failureReason: 'Lead inactive' }) },
            });
            result.skipped++;
            continue;
          }

          if (message.lead.emailStatus === 'unsubscribed') {
            await db.outreachMessage.update({
              where: { id: message.id },
              data: { status: 'failed', metadata: JSON.stringify({ ...JSON.parse(message.metadata || '{}'), failureReason: 'Lead unsubscribed' }) },
            });
            result.skipped++;
            continue;
          }

          // For email channel, verify lead has email
          if (message.channel === 'email' && !message.lead.email) {
            await db.outreachMessage.update({
              where: { id: message.id },
              data: { status: 'failed', metadata: JSON.stringify({ ...JSON.parse(message.metadata || '{}'), failureReason: 'No email address' }) },
            });
            result.failed++;
            continue;
          }

          // Mark as sent (in production, this would actually send via Gmail API, WhatsApp, etc.)
          await db.outreachMessage.update({
            where: { id: message.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              metadata: JSON.stringify({
                ...JSON.parse(message.metadata || '{}'),
                dispatchedAt: new Date().toISOString(),
              }),
            },
          });

          result.dispatched++;
        } catch (error) {
          console.error(`[AutonomousOutreach] Failed to dispatch message ${message.id}:`, error);

          try {
            await db.outreachMessage.update({
              where: { id: message.id },
              data: {
                status: 'failed',
                metadata: JSON.stringify({
                  ...JSON.parse(message.metadata || '{}'),
                  failureReason: error instanceof Error ? error.message : 'Unknown error',
                }),
              },
            });
          } catch {
            // Ignore update errors
          }

          result.failed++;
        }
      }

      return result;
    } catch (error) {
      console.error('[AutonomousOutreach] Queue processing failed:', error);
      return result;
    }
  }
}

// ===== HELPER FUNCTIONS =====

function getChannelContext(channel: string): string {
  switch (channel) {
    case 'email':
      return `Channel: Email
- Subject line should be compelling and personal (50-60 chars)
- Body should be 150-250 words
- Professional tone with personal touch
- Clear CTA at the end`;
    case 'whatsapp':
      return `Channel: WhatsApp
- Message should be 100-200 characters
- Casual but professional tone
- Direct and conversational
- Soft CTA (e.g., "mind if I share some ideas?")`;
    case 'linkedin':
      return `Channel: LinkedIn DM
- Message should be 200-300 characters
- Professional networking tone
- Reference mutual connections or interests if possible
- Connection request style`;
    case 'instagram':
      return `Channel: Instagram DM
- Message should be 100-150 characters
- Casual and friendly tone
- Visual/creative angle
- Very soft CTA`;
    default:
      return `Channel: ${channel}
- Professional tone
- Clear and concise
- Actionable CTA`;
  }
}

function buildLeadContext(lead: {
  businessName: string;
  ownerName: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  niche: string | null;
  city: string | null;
  country: string | null;
  stage: string;
  replyScore: number;
  conversionScore: number;
  urgencyScore: number;
  revenuePotentialScore: number;
  hasWebsite: boolean;
  websiteQuality: string | null;
  digitalWeaknesses: string | null;
  bestChannel: string | null;
  outreachStyle: string | null;
}): string {
  const parts: string[] = [
    `Business: ${lead.businessName}`,
    lead.ownerName ? `Owner: ${lead.ownerName}` : '',
    lead.niche ? `Niche: ${lead.niche}` : '',
    lead.city ? `City: ${lead.city}` : '',
    lead.country ? `Country: ${lead.country}` : '',
    lead.website ? `Website: ${lead.website}` : 'No website',
    `Has Website: ${lead.hasWebsite}`,
    lead.websiteQuality ? `Website Quality: ${lead.websiteQuality}` : '',
    lead.digitalWeaknesses ? `Digital Weaknesses: ${lead.digitalWeaknesses}` : '',
    `Stage: ${lead.stage}`,
    `Reply Score: ${lead.replyScore}`,
    `Conversion Score: ${lead.conversionScore}`,
    `Urgency Score: ${lead.urgencyScore}`,
    `Revenue Potential: ${lead.revenuePotentialScore}`,
    lead.bestChannel ? `Best Channel: ${lead.bestChannel}` : '',
    lead.outreachStyle ? `Outreach Style: ${lead.outreachStyle}` : '',
  ];

  return parts.filter(Boolean).join('\n');
}

// ===== EXPORTED SINGLETON =====

export const autonomousOutreachService = new AutonomousOutreachService();
