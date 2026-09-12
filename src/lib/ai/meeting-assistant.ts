// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Meeting Assistant
// AI-powered meeting features using z-ai-web-dev-sdk:
//   - Agenda generation from meeting context
//   - Pre-meeting research on leads/companies
//   - Meeting transcript analysis (sentiment, objections)
//   - Follow-up email generation
//   - Action item extraction
// ═══════════════════════════════════════════════════════════════════

import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────

export interface MeetingAgendaItem {
  topic: string;
  duration: number;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface PreMeetingResearch {
  companyOverview: string;
  keyContacts: string[];
  recentNews: string[];
  industryInsights: string[];
  talkingPoints: string[];
}

export interface MeetingTranscript {
  meetingId: string;
  rawText: string;
  segments: TranscriptSegment[];
  duration: number;
  language: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative' | 'mixed';
  confidence: number;
  timeline: SentimentPoint[];
}

export interface SentimentPoint {
  timestamp: Date;
  sentiment: number; // -1 to 1
  context: string;
}

export interface ObjectionExtraction {
  objections: ObjectionItem[];
}

export interface ObjectionItem {
  text: string;
  type: 'price' | 'timing' | 'competitor' | 'authority' | 'need' | 'other';
  severity: 'high' | 'medium' | 'low';
  suggestedResponse: string;
}

export interface ActionItem {
  title: string;
  assignee: string;
  dueDate: Date;
  priority: 'high' | 'medium' | 'low';
  source: string; // 'transcript' | 'user' | 'ai'
  completed: boolean;
}

// ── Internal Helpers ────────────────────────────────────────────────

const LOG_PREFIX = '[AI Meeting Assistant]';

/**
 * Call z-ai-web-dev-sdk chat completions with a system + user prompt.
 * Returns the raw text content, or null on failure.
 */
async function callAI(systemPrompt: string, userPrompt: string): Promise<string | null> {
  try {
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant', // z-ai SDK maps system intent to assistant role
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const content = completion.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      console.warn(`${LOG_PREFIX} AI returned empty content`);
      return null;
    }
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} AI call failed: ${msg}`);
    return null;
  }
}

/**
 * Safely parse JSON from an AI response. AI may wrap JSON in markdown code blocks.
 * Returns the parsed object or null on failure.
 */
function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`${LOG_PREFIX} JSON parse failed: ${msg}`);
    // Attempt to extract JSON object from surrounding text
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
    } catch {
      // Give up
    }
    return null;
  }
}

// ── AI-Powered Implementations ─────────────────────────────────────

/**
 * Generate a meeting agenda based on meeting context.
 * Uses AI to create structured agenda items from the meeting title,
 * description, lead info, and deal info.
 */
export async function generateMeetingAgenda(meetingId: string): Promise<MeetingAgendaItem[]> {
  console.log(`${LOG_PREFIX} generateMeetingAgenda called for meeting ${meetingId}`);

  try {
    // Fetch meeting with related lead and deal context
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: true,
        deal: true,
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found`);
      return [];
    }

    const context = {
      meetingTitle: meeting.title,
      meetingDescription: meeting.description || '',
      meetingType: meeting.meetingType,
      platform: meeting.platform,
      durationMinutes: meeting.durationMinutes,
      status: meeting.status,
      startDateTime: meeting.startDateTime.toISOString(),
      attendees: meeting.attendees,
      existingAgenda: meeting.agenda || null,
      lead: meeting.lead
        ? {
            businessName: meeting.lead.businessName,
            ownerName: meeting.lead.ownerName || '',
            website: meeting.lead.website || '',
            email: meeting.lead.email || '',
            phone: meeting.lead.phone || '',
            city: meeting.lead.city || '',
            country: meeting.lead.country || '',
            niche: meeting.lead.niche || '',
            stage: meeting.lead.stage,
            notes: meeting.lead.notes || '',
            opportunityNotes: meeting.lead.opportunityNotes || '',
            digitalWeaknesses: meeting.lead.digitalWeaknesses || '',
          }
        : null,
      deal: meeting.deal
        ? {
            status: meeting.deal.status,
            projectType: meeting.deal.projectType || '',
            projectScope: meeting.deal.projectScope || '',
            proposedPrice: meeting.deal.proposedPrice,
            currency: meeting.deal.currency,
            notes: meeting.deal.notes || '',
          }
        : null,
    };

    const systemPrompt = `You are an expert meeting facilitator and sales strategist for AcquisitionOS, an M&A and business acquisition platform. Your task is to generate a structured meeting agenda.

Given meeting context (title, description, lead/company info, deal details), create a focused, professional agenda.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an array of objects with keys: "topic" (string), "duration" (number in minutes), "description" (string), "priority" ("high"|"medium"|"low").
- Total duration of all items should not exceed the meeting duration.
- Start with rapport-building, then move to business discussion.
- Prioritize topics relevant to the lead's stage and deal status.
- Include time for Q&A and next steps.
- Generate 3-7 agenda items depending on meeting length.
- Keep descriptions concise but actionable (1-2 sentences).`;

    const userPrompt = `Generate a meeting agenda for the following:

Meeting Details:
- Title: "${context.meetingTitle}"
- Description: "${context.meetingDescription}"
- Type: ${context.meetingType}
- Duration: ${context.durationMinutes} minutes
- Platform: ${context.platform}
- Attendees: ${context.attendees}
${context.existingAgenda ? `- Existing agenda notes: ${context.existingAgenda}` : ''}

${context.lead ? `Lead/Company Information:
- Business: ${context.lead.businessName}
- Owner: ${context.lead.ownerName}
- Location: ${context.lead.city}, ${context.lead.country}
- Industry/Niche: ${context.lead.niche}
- Stage: ${context.lead.stage}
- Notes: ${context.lead.notes}
- Opportunities: ${context.lead.opportunityNotes}
- Digital Weaknesses: ${context.lead.digitalWeaknesses}` : 'No lead associated with this meeting.'}

${context.deal ? `Deal Information:
- Status: ${context.deal.status}
- Project Type: ${context.deal.projectType}
- Scope: ${context.deal.projectScope}
- Proposed Price: ${context.deal.proposedPrice} ${context.deal.currency}
- Notes: ${context.deal.notes}` : 'No deal associated with this meeting.'}

Return a JSON array of agenda items.`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} generateMeetingAgenda: AI returned null for meeting ${meetingId}`);
      return [];
    }

    const parsed = safeParseJSON<MeetingAgendaItem[]>(rawResponse);
    if (!parsed || !Array.isArray(parsed)) {
      console.warn(`${LOG_PREFIX} generateMeetingAgenda: failed to parse agenda items for meeting ${meetingId}`);
      return [];
    }

    // Validate and sanitize parsed items
    const validItems: MeetingAgendaItem[] = parsed
      .filter(
        (item): item is MeetingAgendaItem =>
          typeof item.topic === 'string' &&
          typeof item.duration === 'number' &&
          typeof item.description === 'string' &&
          ['high', 'medium', 'low'].includes(item.priority)
      )
      .map((item) => ({
        topic: item.topic.trim(),
        duration: Math.max(1, Math.round(item.duration)),
        description: item.description.trim(),
        priority: item.priority as 'high' | 'medium' | 'low',
      }));

    console.log(`${LOG_PREFIX} generateMeetingAgenda: generated ${validItems.length} items for meeting ${meetingId}`);
    return validItems;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} generateMeetingAgenda error for meeting ${meetingId}: ${msg}`);
    return [];
  }
}

/**
 * Generate pre-meeting research for a lead.
 * Fetches lead data from DB and uses AI to generate comprehensive research.
 */
export async function generatePreMeetingResearch(leadId: string): Promise<PreMeetingResearch | null> {
  console.log(`${LOG_PREFIX} generatePreMeetingResearch called for lead ${leadId}`);

  try {
    // Fetch lead data
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      console.warn(`${LOG_PREFIX} Lead ${leadId} not found`);
      return null;
    }

    const context = {
      businessName: lead.businessName,
      ownerName: lead.ownerName || '',
      website: lead.website || '',
      email: lead.email || '',
      phone: lead.phone || '',
      whatsapp: lead.whatsapp || '',
      linkedin: lead.linkedin || '',
      instagram: lead.instagram || '',
      facebook: lead.facebook || '',
      googleMapsListing: lead.googleMapsListing || '',
      reviews: lead.reviews || '',
      rating: lead.rating,
      city: lead.city || '',
      country: lead.country || '',
      niche: lead.niche || '',
      stage: lead.stage,
      hasWebsite: lead.hasWebsite,
      websiteQuality: lead.websiteQuality || '',
      digitalWeaknesses: lead.digitalWeaknesses || '',
      opportunityNotes: lead.opportunityNotes || '',
      bestContactPerson: lead.bestContactPerson || '',
      bestChannel: lead.bestChannel || '',
      bestTiming: lead.bestTiming || '',
      outreachStyle: lead.outreachStyle || '',
      notes: lead.notes || '',
      tags: lead.tags || '[]',
      techStack: lead.techStack || '[]',
      replyScore: lead.replyScore,
      conversionScore: lead.conversionScore,
      urgencyScore: lead.urgencyScore,
      scoreReasoning: lead.scoreReasoning || '',
    };

    const systemPrompt = `You are an expert business researcher and intelligence analyst for AcquisitionOS, an M&A and business acquisition platform. Your task is to generate comprehensive pre-meeting research for a lead company.

Given the company data below, generate a structured research report.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an object with exactly these keys:
  - "companyOverview" (string, 2-4 paragraphs summarizing the company)
  - "keyContacts" (array of strings, 3-5 key contacts or roles to know about)
  - "recentNews" (array of strings, 3-5 plausible recent developments/news items)
  - "industryInsights" (array of strings, 3-5 industry trends relevant to this company)
  - "talkingPoints" (array of strings, 5-8 strategic talking points for the meeting)
- Base your analysis on the provided data. If data is sparse, make reasonable professional inferences clearly marked as observations.
- Focus on what's actionable for an acquisition/business meeting.
- Keep talking points specific to this company, not generic.`;

    const userPrompt = `Generate pre-meeting research for this lead:

Company Profile:
- Business Name: ${context.businessName}
- Owner/Key Person: ${context.ownerName}
- Website: ${context.website}
- Location: ${context.city}, ${context.country}
- Industry/Niche: ${context.niche}
- Current Stage: ${context.stage}

Contact Information:
- Email: ${context.email}
- Phone: ${context.phone}
- LinkedIn: ${context.linkedin}
- Instagram: ${context.instagram}
- Facebook: ${context.facebook}
- WhatsApp: ${context.whatsapp}

Business Metrics:
- Google Maps Listing: ${context.googleMapsListing ? 'Yes' : 'No'}
- Reviews: ${context.reviews || 'None available'}
- Rating: ${context.rating || 'Not rated'}
- Has Website: ${context.hasWebsite ? 'Yes' : 'No'}
- Website Quality: ${context.websiteQuality}
- Tech Stack: ${context.techStack}

Analysis Scores:
- Reply Score: ${context.replyScore}/100
- Conversion Score: ${context.conversionScore}/100
- Urgency Score: ${context.urgencyScore}/100
- Score Reasoning: ${context.scoreReasoning}

Opportunity Assessment:
- Digital Weaknesses: ${context.digitalWeaknesses || 'None identified'}
- Opportunity Notes: ${context.opportunityNotes || 'None'}
- Best Contact Person: ${context.bestContactPerson || 'Not identified'}
- Best Channel: ${context.bestChannel || 'Not determined'}
- Best Timing: ${context.bestTiming || 'Not determined'}
- Outreach Style: ${context.outreachStyle || 'Not determined'}

Notes: ${context.notes || 'No additional notes'}
Tags: ${context.tags}

Return a JSON object with companyOverview, keyContacts, recentNews, industryInsights, and talkingPoints.`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} generatePreMeetingResearch: AI returned null for lead ${leadId}`);
      return null;
    }

    const parsed = safeParseJSON<PreMeetingResearch>(rawResponse);
    if (!parsed) {
      console.warn(`${LOG_PREFIX} generatePreMeetingResearch: failed to parse research for lead ${leadId}`);
      return null;
    }

    // Validate structure
    const result: PreMeetingResearch = {
      companyOverview: typeof parsed.companyOverview === 'string' ? parsed.companyOverview : '',
      keyContacts: Array.isArray(parsed.keyContacts) ? parsed.keyContacts.filter((c) => typeof c === 'string') : [],
      recentNews: Array.isArray(parsed.recentNews) ? parsed.recentNews.filter((n) => typeof n === 'string') : [],
      industryInsights: Array.isArray(parsed.industryInsights) ? parsed.industryInsights.filter((i) => typeof i === 'string') : [],
      talkingPoints: Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints.filter((t) => typeof t === 'string') : [],
    };

    console.log(
      `${LOG_PREFIX} generatePreMeetingResearch: generated research for lead ${leadId} (${result.talkingPoints.length} talking points)`
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} generatePreMeetingResearch error for lead ${leadId}: ${msg}`);
    return null;
  }
}

/**
 * Analyze sentiment of a completed meeting transcript/notes.
 * Uses AI to analyze meeting notes and return a sentiment analysis.
 */
export async function analyzeMeetingSentiment(meetingId: string): Promise<SentimentAnalysis | null> {
  console.log(`${LOG_PREFIX} analyzeMeetingSentiment called for meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: true,
        deal: true,
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found`);
      return null;
    }

    // Gather all available text content from the meeting
    const meetingContext = {
      title: meeting.title,
      description: meeting.description || '',
      notes: meeting.notes || '',
      status: meeting.status,
      meetingType: meeting.meetingType,
      startDateTime: meeting.startDateTime.toISOString(),
      durationMinutes: meeting.durationMinutes,
      attendees: meeting.attendees,
      leadName: meeting.lead?.businessName || '',
      dealStatus: meeting.deal?.status || '',
    };

    // If there are no notes and minimal content, we can't analyze sentiment well
    const textToAnalyze = [
      meetingContext.notes,
      meetingContext.description,
      `Meeting: ${meetingContext.title}`,
    ].filter(Boolean).join('\n\n');

    if (textToAnalyze.trim().length < 20) {
      console.warn(`${LOG_PREFIX} analyzeMeetingSentiment: insufficient text content for meeting ${meetingId}`);
      return null;
    }

    const systemPrompt = `You are an expert sentiment analyst specializing in business meetings and sales conversations for AcquisitionOS. Your task is to analyze meeting content and provide sentiment analysis.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an object with exactly these keys:
  - "overall" (string: "positive"|"neutral"|"negative"|"mixed")
  - "confidence" (number: 0.0 to 1.0, how confident you are in the overall assessment)
  - "timeline" (array of objects, each with: "timestamp" (ISO 8601 string), "sentiment" (number -1.0 to 1.0), "context" (string describing what part of the meeting this relates to))
- Generate 2-5 timeline points representing key moments or shifts in the meeting.
- For timestamp, use reasonable offsets from the meeting start (since we don't have exact timestamps from notes, estimate them).
- Be objective and evidence-based — reference specific content from the meeting.
- confidence should reflect how much text you have to analyze — less text = lower confidence.`;

    const userPrompt = `Analyze the sentiment of this meeting:

Meeting Context:
- Title: "${meetingContext.title}"
- Type: ${meetingContext.meetingType}
- Duration: ${meetingContext.durationMinutes} minutes
- Status: ${meetingContext.status}
- Attendees: ${meetingContext.attendees}
- Lead/Company: ${meetingContext.leadName}
- Deal Status: ${meetingContext.dealStatus}
- Started at: ${meetingContext.startDateTime}

Meeting Content (notes/description):
${textToAnalyze}

Return a JSON object with overall sentiment, confidence score, and timeline of sentiment shifts.`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} analyzeMeetingSentiment: AI returned null for meeting ${meetingId}`);
      return null;
    }

    const parsed = safeParseJSON<{
      overall: string;
      confidence: number;
      timeline: Array<{ timestamp: string; sentiment: number; context: string }>;
    }>(rawResponse);

    if (!parsed || !['positive', 'neutral', 'negative', 'mixed'].includes(parsed.overall)) {
      console.warn(`${LOG_PREFIX} analyzeMeetingSentiment: failed to parse sentiment for meeting ${meetingId}`);
      return null;
    }

    const result: SentimentAnalysis = {
      overall: parsed.overall as 'positive' | 'neutral' | 'negative' | 'mixed',
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      timeline: Array.isArray(parsed.timeline)
        ? parsed.timeline
            .filter((t) => typeof t.context === 'string' && typeof t.sentiment === 'number')
            .map((t) => ({
              timestamp: t.timestamp ? new Date(t.timestamp) : new Date(),
              sentiment: Math.min(1, Math.max(-1, t.sentiment)),
              context: t.context,
            }))
        : [],
    };

    console.log(
      `${LOG_PREFIX} analyzeMeetingSentiment: ${result.overall} (confidence: ${result.confidence}) for meeting ${meetingId}`
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} analyzeMeetingSentiment error for meeting ${meetingId}: ${msg}`);
    return null;
  }
}

/**
 * Extract objections from a completed meeting transcript/notes.
 * Uses AI to identify and categorize objections with suggested responses.
 */
export async function extractObjections(meetingId: string): Promise<ObjectionExtraction | null> {
  console.log(`${LOG_PREFIX} extractObjections called for meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: true,
        deal: true,
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found`);
      return null;
    }

    const textToAnalyze = [
      meeting.notes,
      meeting.description,
      `Meeting: ${meeting.title}`,
    ].filter(Boolean).join('\n\n');

    if (textToAnalyze.trim().length < 20) {
      console.warn(`${LOG_PREFIX} extractObjections: insufficient text content for meeting ${meetingId}`);
      return null;
    }

    const meetingContext = {
      title: meeting.title,
      description: meeting.description || '',
      notes: meeting.notes || '',
      status: meeting.status,
      meetingType: meeting.meetingType,
      durationMinutes: meeting.durationMinutes,
      attendees: meeting.attendees,
      leadName: meeting.lead?.businessName || '',
      leadOwner: meeting.lead?.ownerName || '',
      leadStage: meeting.lead?.stage || '',
      dealStatus: meeting.deal?.status || '',
      dealProjectType: meeting.deal?.projectType || '',
      dealProposedPrice: meeting.deal?.proposedPrice || null,
    };

    const systemPrompt = `You are an expert sales objection analyst for AcquisitionOS, an M&A and business acquisition platform. Your task is to identify, categorize, and provide responses to objections raised during a business meeting.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an object with key "objections" (array of objects).
- Each objection object must have:
  - "text" (string: the objection as stated or inferred)
  - "type" (string: "price"|"timing"|"competitor"|"authority"|"need"|"other")
  - "severity" (string: "high"|"medium"|"low")
  - "suggestedResponse" (string: a professional, empathetic response to address this objection)
- If no objections are found, return {"objections": []}
- Be specific — quote or closely paraphrase the actual objection.
- Severity: "high" = deal-breaker, "medium" = needs addressing, "low" = minor concern.
- Suggested responses should be practical, empathetic, and solution-oriented.`;

    const userPrompt = `Extract objections from this meeting:

Meeting Context:
- Title: "${meetingContext.title}"
- Type: ${meetingContext.meetingType}
- Duration: ${meetingContext.durationMinutes} minutes
- Attendees: ${meetingContext.attendees}

Lead/Company: ${meetingContext.leadName}
Contact: ${meetingContext.leadOwner}
Stage: ${meetingContext.leadStage}

${meetingContext.dealStatus ? `Deal: ${meetingContext.dealStatus} — ${meetingContext.dealProjectType}${meetingContext.dealProposedPrice ? ` ($${meetingContext.dealProposedPrice})` : ''}` : 'No deal yet.'}

Meeting Content:
${textToAnalyze}

Return a JSON object with an "objections" array.`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} extractObjections: AI returned null for meeting ${meetingId}`);
      return null;
    }

    const parsed = safeParseJSON<ObjectionExtraction>(rawResponse);
    if (!parsed || !Array.isArray(parsed.objections)) {
      console.warn(`${LOG_PREFIX} extractObjections: failed to parse objections for meeting ${meetingId}`);
      return null;
    }

    const validTypes = ['price', 'timing', 'competitor', 'authority', 'need', 'other'];
    const validSeverities = ['high', 'medium', 'low'];

    const result: ObjectionExtraction = {
      objections: parsed.objections
        .filter(
          (obj): obj is ObjectionItem =>
            typeof obj.text === 'string' &&
            validTypes.includes(obj.type) &&
            validSeverities.includes(obj.severity) &&
            typeof obj.suggestedResponse === 'string'
        )
        .map((obj) => ({
          text: obj.text.trim(),
          type: obj.type as 'price' | 'timing' | 'competitor' | 'authority' | 'need' | 'other',
          severity: obj.severity as 'high' | 'medium' | 'low',
          suggestedResponse: obj.suggestedResponse.trim(),
        })),
    };

    console.log(
      `${LOG_PREFIX} extractObjections: found ${result.objections.length} objections for meeting ${meetingId}`
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} extractObjections error for meeting ${meetingId}: ${msg}`);
    return null;
  }
}

/**
 * Generate a follow-up email based on meeting context.
 * Uses AI to craft a professional follow-up email.
 */
export async function generateFollowUpEmail(meetingId: string): Promise<{ subject: string; body: string } | null> {
  console.log(`${LOG_PREFIX} generateFollowUpEmail called for meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: true,
        deal: true,
        user: {
          select: { name: true, email: true, company: true },
        },
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found`);
      return null;
    }

    const context = {
      title: meeting.title,
      description: meeting.description || '',
      notes: meeting.notes || '',
      status: meeting.status,
      meetingType: meeting.meetingType,
      durationMinutes: meeting.durationMinutes,
      startDateTime: meeting.startDateTime.toISOString(),
      attendees: meeting.attendees,
      platform: meeting.platform,
      followUpActions: meeting.followUpActions || '',
      userName: meeting.user?.name || '',
      userEmail: meeting.user?.email || '',
      userCompany: meeting.user?.company || 'AcquisitionOS',
      leadBusinessName: meeting.lead?.businessName || '',
      leadOwnerName: meeting.lead?.ownerName || '',
      leadEmail: meeting.lead?.email || '',
      leadStage: meeting.lead?.stage || '',
      dealStatus: meeting.deal?.status || '',
      dealProjectType: meeting.deal?.projectType || '',
      dealProposedPrice: meeting.deal?.proposedPrice || null,
    };

    // Need enough content to generate a meaningful email
    if (!context.notes && !context.description && !context.followUpActions) {
      console.warn(`${LOG_PREFIX} generateFollowUpEmail: insufficient content for meeting ${meetingId}`);
      return null;
    }

    const systemPrompt = `You are an expert business communication specialist for AcquisitionOS, an M&A and business acquisition platform. Your task is to generate a professional follow-up email after a business meeting.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an object with exactly these keys:
  - "subject" (string: concise, professional email subject line)
  - "body" (string: the full email body in plain text format)
- The email should:
  - Be warm but professional
  - Reference specific topics discussed in the meeting
  - Summarize key takeaways or decisions
  - Include next steps and any action items
  - Have a clear call to action
  - Be personalized to the recipient and meeting context
  - Be concise (under 300 words for the body)
- Do NOT include placeholders like [Name] — use the actual names from context.`;

    const userPrompt = `Generate a follow-up email for this meeting:

Meeting Details:
- Title: "${context.title}"
- Description: "${context.description}"
- Type: ${context.meetingType}
- Duration: ${context.durationMinutes} minutes
- Date: ${context.startDateTime}
- Platform: ${context.platform}
- Status: ${context.status}

Meeting Notes:
${context.notes || 'No detailed notes recorded.'}

${context.followUpActions ? `Follow-up Actions Discussed: ${context.followUpActions}` : ''}

Sender Info:
- Name: ${context.userName}
- Email: ${context.userEmail}
- Company: ${context.userCompany}

Recipient:
- Company: ${context.leadBusinessName}
- Contact: ${context.leadOwnerName}
- Email: ${context.leadEmail}
- Stage: ${context.leadStage}

${context.dealStatus ? `Deal Context: ${context.dealStatus} — ${context.dealProjectType}${context.dealProposedPrice ? ` ($${context.dealProposedPrice})` : ''}` : ''}

Attendees: ${context.attendees}

Return a JSON object with "subject" and "body".`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} generateFollowUpEmail: AI returned null for meeting ${meetingId}`);
      return null;
    }

    const parsed = safeParseJSON<{ subject: string; body: string }>(rawResponse);
    if (!parsed || typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
      console.warn(`${LOG_PREFIX} generateFollowUpEmail: failed to parse email for meeting ${meetingId}`);
      return null;
    }

    const result = {
      subject: parsed.subject.trim(),
      body: parsed.body.trim(),
    };

    console.log(
      `${LOG_PREFIX} generateFollowUpEmail: generated email "${result.subject}" for meeting ${meetingId}`
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} generateFollowUpEmail error for meeting ${meetingId}: ${msg}`);
    return null;
  }
}

/**
 * Generate action items from a completed meeting.
 * Uses AI to extract action items from meeting notes/context.
 */
export async function generateActionItems(meetingId: string): Promise<ActionItem[]> {
  console.log(`${LOG_PREFIX} generateActionItems called for meeting ${meetingId}`);

  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: true,
        deal: true,
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (!meeting) {
      console.warn(`${LOG_PREFIX} Meeting ${meetingId} not found`);
      return [];
    }

    const textToAnalyze = [
      meeting.notes,
      meeting.description,
      meeting.followUpActions,
      `Meeting: ${meeting.title}`,
    ].filter(Boolean).join('\n\n');

    if (textToAnalyze.trim().length < 20) {
      console.warn(`${LOG_PREFIX} generateActionItems: insufficient text content for meeting ${meetingId}`);
      return [];
    }

    const context = {
      title: meeting.title,
      description: meeting.description || '',
      notes: meeting.notes || '',
      status: meeting.status,
      meetingType: meeting.meetingType,
      startDateTime: meeting.startDateTime.toISOString(),
      attendees: meeting.attendees,
      followUpActions: meeting.followUpActions || '',
      userName: meeting.user?.name || '',
      leadBusinessName: meeting.lead?.businessName || '',
      leadOwnerName: meeting.lead?.ownerName || '',
      leadStage: meeting.lead?.stage || '',
      dealStatus: meeting.deal?.status || '',
      dealProjectType: meeting.deal?.projectType || '',
    };

    const systemPrompt = `You are an expert project manager and sales operations specialist for AcquisitionOS. Your task is to extract and generate action items from a completed business meeting.

RULES:
- Return ONLY valid JSON — no markdown, no commentary outside JSON.
- The JSON must be an array of objects, each with exactly these keys:
  - "title" (string: clear, actionable description of the task)
  - "assignee" (string: name of the person responsible, or "Unassigned")
  - "dueDate" (string: ISO 8601 date string — set reasonable deadlines based on task urgency)
  - "priority" (string: "high"|"medium"|"low")
  - "source" (string: always "ai")
  - "completed" (boolean: always false for newly extracted items)
- Generate 2-8 action items based on the meeting content.
- Each item should be a concrete, actionable task — not vague goals.
- Infer assignees from attendee list and context where possible.
- Set due dates relative to the meeting date (e.g., 1-3 days for urgent items, 1-2 weeks for standard).
- If no action items can be identified, return an empty array.`;

    const userPrompt = `Extract action items from this meeting:

Meeting Details:
- Title: "${context.title}"
- Type: ${context.meetingType}
- Date: ${context.startDateTime}
- Status: ${context.status}
- Attendees: ${context.attendees}

Our Team Member: ${context.userName}
Lead/Company: ${context.leadBusinessName}
Contact Person: ${context.leadOwnerName}
Lead Stage: ${context.leadStage}
${context.dealStatus ? `Deal: ${context.dealStatus} — ${context.dealProjectType}` : ''}

Meeting Notes:
${context.notes}

${context.followUpActions ? `Existing Follow-up Actions: ${context.followUpActions}` : ''}

Return a JSON array of action items.`;

    const rawResponse = await callAI(systemPrompt, userPrompt);
    if (!rawResponse) {
      console.warn(`${LOG_PREFIX} generateActionItems: AI returned null for meeting ${meetingId}`);
      return [];
    }

    const parsed = safeParseJSON<
      Array<{
        title: string;
        assignee: string;
        dueDate?: string;
        priority: string;
        source?: string;
        completed?: boolean;
      }>
    >(rawResponse);

    if (!parsed || !Array.isArray(parsed)) {
      console.warn(`${LOG_PREFIX} generateActionItems: failed to parse action items for meeting ${meetingId}`);
      return [];
    }

    const validPriorities = ['high', 'medium', 'low'];

    const result: ActionItem[] = parsed
      .filter(
        (item) =>
          typeof item.title === 'string' &&
          typeof item.assignee === 'string' &&
          validPriorities.includes(item.priority)
      )
      .map((item) => {
        let dueDate: Date;
        try {
          dueDate = item.dueDate ? new Date(item.dueDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          // If date parsing resulted in Invalid Date, use default
          if (isNaN(dueDate.getTime())) {
            dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          }
        } catch {
          dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        }

        return {
          title: item.title.trim(),
          assignee: item.assignee.trim(),
          dueDate,
          priority: item.priority as 'high' | 'medium' | 'low',
          source: 'ai' as const,
          completed: false,
        };
      });

    console.log(
      `${LOG_PREFIX} generateActionItems: extracted ${result.length} action items for meeting ${meetingId}`
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} generateActionItems error for meeting ${meetingId}: ${msg}`);
    return [];
  }
}
