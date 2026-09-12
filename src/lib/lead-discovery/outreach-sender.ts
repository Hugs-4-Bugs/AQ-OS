// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Email Sender
// Automated outreach email generation and sending.
//
// Flow:
// 1. Load Lead + user profile + research data from DB
// 2. If no email → mark "no_contact", return early
// 3. Generate personalized email via existing Z-AI infrastructure
// 4. Send via existing email service (sendEmail from email.ts)
// 5. Update Lead status, create LeadActivity, AuditLog
// 6. Dispatch notifications (in-app + Telegram)
//
// Uses:
// - executeAICompletion from ai-provider (same as lead-analysis-engine)
// - sendEmail from email.ts (Resend → SMTP → Microservice → Console)
// - deductCredits from credit-service
// - sendNotification + sendTelegramNotification from notification-engine
// - logAuditEvent from lead-audit
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, type AICompletionRequest } from '@/lib/ai/ai-provider';
import { logAIAudit } from '@/lib/ai/ai-audit';
import {
  deductCredits,
  checkCreditSufficiency,
  refundCredits,
  type CreditAction,
} from '@/lib/credit-service';
import { sendEmail, type EmailPayload, type EmailResult } from '@/lib/email';
import { logAuditEvent } from '@/lib/lead-audit';
import {
  sendNotification,
  sendTelegramNotification,
} from '@/lib/notification-engine';

// ===== TYPES =====

export interface OutreachResult {
  success: boolean;
  emailId?: string;
  subject?: string;
  error?: string;
  creditsDeducted?: number;
  newCreditBalance?: number;
}

interface GeneratedEmail {
  subject: string;
  body: string;
}

/** Research data stored in lead metadata by company-researcher.ts */
interface ResearchMetadata {
  companyDescription?: string;
  challenges?: Array<{ challenge: string; solution: string; value: string }>;
  approachAngle?: string;
  personalizedPitch?: string;
  websiteScore?: {
    overallScore: number;
    seoScore: number;
    gaps: string[];
  };
  userProfile?: {
    name: string;
    services: string;
  };
  researchedAt?: string;
  aiProvider?: string;
}

// ===== CREDIT COST =====

const OUTREACH_CREDIT_COST = 2;
const OUTREACH_ACTION: CreditAction = 'outreach_message';

// ===== MAIN EXPORT =====

/**
 * Generate a personalized outreach email using AI and send it.
 *
 * @param leadId - The ID of the Lead to send outreach to
 * @param userId - The ID of the User sending the outreach
 * @returns OutreachResult with success status, email ID, and subject
 */
export async function generateAndSendOutreach(
  leadId: string,
  userId: string
): Promise<OutreachResult> {
  console.log(`[OutreachSender] Starting outreach for leadId=${leadId}, userId=${userId}`);

  // ── STEP 1: Load data ────────────────────────────────────────────

  // 1a. Fetch the Lead
  const lead = await db.lead.findUnique({
    where: { id: leadId, isActive: true },
  });

  if (!lead) {
    console.warn(`[OutreachSender] Lead not found: ${leadId}`);
    return { success: false, error: 'Lead not found' };
  }

  // 1b. Load user profile / settings
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      settings: {
        select: {
          companyName: true,
          targetNiches: true,
          targetChannels: true,
          telegramConnected: true,
        },
      },
    },
  });

  if (!user) {
    console.warn(`[OutreachSender] User not found: ${userId}`);
    return { success: false, error: 'User not found' };
  }

  const userName = user.name || user.settings?.companyName || 'Your Business';
  const userBusiness = user.settings?.companyName || user.company || '';
  const userServices = parseServicesFromSettings(user.settings?.targetNiches, user.settings?.targetChannels);

  // 1c. Load research results from lead metadata (stored in techStack by company-researcher)
  let researchData: ResearchMetadata = {};
  try {
    if (lead.techStack) {
      researchData = JSON.parse(lead.techStack) as ResearchMetadata;
    }
  } catch {
    console.warn(`[OutreachSender] Could not parse research data from lead ${leadId}`);
  }

  // 1d. Extract key data for prompt
  const topGap = researchData.websiteScore?.gaps?.[0]
    || lead.digitalWeaknesses?.split(',')[0]?.trim()
    || 'improving their online presence';
  const companyDescription = researchData.companyDescription || lead.opportunityNotes || `${lead.businessName} is a business in the ${lead.niche || 'local'} niche.`;
  const personalizedPitch = researchData.personalizedPitch || lead.opportunityNotes || '';
  const approachAngle = researchData.approachAngle || 'competitive advantage';

  // ── STEP 1 (early exit): No email → mark no_contact ─────────────

  if (!lead.email || lead.email.trim() === '') {
    console.log(`[OutreachSender] Lead ${leadId} has no email — marking as no_contact`);

    try {
      await db.lead.update({
        where: { id: leadId },
        data: { stage: 'no_contact' },
      });

      await db.leadActivity.create({
        data: {
          leadId,
          type: 'no_contact',
          description: 'Outreach skipped — no email address on file',
          metadata: JSON.stringify({ reason: 'no_email' }),
        },
      });
    } catch (dbErr) {
      console.error('[OutreachSender] Failed to mark lead as no_contact:', dbErr);
    }

    return { success: false, error: 'Lead has no email address' };
  }

  // ── STEP 2: Generate personalized email using Z-AI ──────────────

  // 2a. Check credit sufficiency
  const sufficiency = await checkCreditSufficiency(userId, OUTREACH_CREDIT_COST);
  if (!sufficiency.sufficient) {
    console.warn(`[OutreachSender] Insufficient credits: need ${OUTREACH_CREDIT_COST}, have ${sufficiency.balance}`);
    return {
      success: false,
      error: `Insufficient credits. Need ${OUTREACH_CREDIT_COST}, have ${sufficiency.balance}`,
    };
  }

  // 2b. Deduct credits atomically
  const deduction = await deductCredits({
    userId,
    action: OUTREACH_ACTION,
    cost: OUTREACH_CREDIT_COST,
    referenceId: leadId,
  });

  if (!deduction.success) {
    console.error(`[OutreachSender] Credit deduction failed: ${deduction.error}`);
    return { success: false, error: deduction.error || 'Failed to deduct credits' };
  }

  // 2c. Build AI prompt
  const prompt = buildOutreachPrompt({
    userName,
    companyName: lead.businessName,
    companyDescription,
    topGap,
    personalizedPitch,
    approachAngle,
    niche: lead.niche || 'local business',
    website: lead.website || '',
  });

  // 2d. Execute AI completion via existing Z-AI infrastructure
  const startTime = Date.now();

  const completionRequest: AICompletionRequest = {
    messages: [
      {
        role: 'system',
        content:
          'You are a cold outreach email copywriter. Write concise, personalized emails that sound human. Always return valid JSON. No markdown formatting.',
      },
      { role: 'user', content: prompt },
    ],
    config: {
      provider: 'z-ai' as const,
      maxTokens: 1024,
      temperature: 0.8,
      timeout: 30000,
      retries: 2,
    },
  };

  const aiResult = await executeAICompletion(completionRequest, userId, 'outreach_generation');
  const latencyMs = Date.now() - startTime;

  // 2e. Parse AI response
  let generatedEmail: GeneratedEmail;

  if (!aiResult.success || !aiResult.content) {
    console.error(`[OutreachSender] AI completion failed: ${aiResult.error}`);
    // Refund credits on AI failure
    await refundCredits({
      userId,
      amount: OUTREACH_CREDIT_COST,
      originalAction: OUTREACH_ACTION,
      referenceId: leadId,
    });

    // Use fallback email
    generatedEmail = buildFallbackEmail(lead.businessName, topGap, userName);
  } else {
    try {
      generatedEmail = parseEmailFromAI(aiResult.content, lead.businessName, topGap, userName);
    } catch (parseError) {
      console.error('[OutreachSender] JSON parse failed, using fallback:', parseError);
      generatedEmail = buildFallbackEmail(lead.businessName, topGap, userName);
    }
  }

  console.log(`[OutreachSender] Generated email: subject="${generatedEmail.subject}" (${latencyMs}ms)`);

  // ── STEP 3: Send the email ───────────────────────────────────────

  // Try user's connected email account first, otherwise system default
  const emailAccount = await db.emailAccount.findFirst({
    where: { userId, status: 'active' },
    select: { gmailEmail: true },
  });

  const fromAddress = emailAccount?.gmailEmail
    || process.env.EMAIL_FROM
    || process.env.SMTP_FROM
    || 'AcquisitionOS <noreply@acquisitionos.com>';

  const emailPayload: EmailPayload = {
    to: lead.email,
    subject: generatedEmail.subject,
    html: buildOutreachHtml(generatedEmail.body, userName, userBusiness),
    text: generatedEmail.body,
  };

  // FIX (2026-09-09): Send a copy of the outreach email to the user
  // (the sender) via BCC so they have a record of what was sent to the
  // lead. We only BCC when the user's email differs from the lead's email
  // (avoids duplicate delivery when they happen to match).
  if (user.email && user.email.toLowerCase().trim() !== lead.email.toLowerCase().trim()) {
    emailPayload.bcc = user.email;
    console.log(`[OutreachSender] BCCing sender copy to ${user.email}`);
  }

  let emailResult: EmailResult;
  let sendSucceeded = false;

  try {
    emailResult = await sendEmail(emailPayload);
    sendSucceeded = emailResult.sent;

    if (sendSucceeded) {
      console.log(`[OutreachSender] ✓ Email sent to ${lead.email} (id: ${emailResult.messageId})`);
    } else {
      console.error(`[OutreachSender] ✗ Email send failed: ${emailResult.error}`);
    }
  } catch (sendErr) {
    emailResult = { sent: false, error: sendErr instanceof Error ? sendErr.message : 'Unknown send error' };
    sendSucceeded = false;
    console.error('[OutreachSender] Email send exception:', sendErr);
  }

  // FIX (2026-09-09): Send a separate, clearly-labeled confirmation
  // email to the user so they have an explicit "you sent this outreach"
  // record in their inbox (in addition to the BCC copy above). This is
  // the "copy/confirmation email of the outreach message" requested.
  if (sendSucceeded && user.email && user.email.toLowerCase().trim() !== lead.email.toLowerCase().trim()) {
    try {
      const confirmationHtml = buildOutreachConfirmationHtml({
        recipientName: userName,
        leadBusinessName: lead.businessName,
        leadEmail: lead.email,
        subject: generatedEmail.subject,
        body: generatedEmail.body,
        sentAt: new Date().toISOString(),
      });
      await sendEmail({
        to: user.email,
        subject: `✉️ Outreach sent to ${lead.businessName} — copy for your records`,
        html: confirmationHtml,
        text: `You sent the following outreach to ${lead.businessName} (${lead.email}) at ${new Date().toISOString()}.\n\nSubject: ${generatedEmail.subject}\n\n${generatedEmail.body}`,
      });
      console.log(`[OutreachSender] ✓ Confirmation copy delivered to ${user.email}`);
    } catch (confErr) {
      // Non-fatal — the primary send already succeeded.
      console.warn('[OutreachSender] Confirmation email failed (non-fatal):', confErr instanceof Error ? confErr.message : confErr);
    }
  }

  // Log the send attempt regardless of success or failure
  console.log(`[OutreachSender] Send attempt logged: leadId=${leadId} success=${sendSucceeded}`);

  // ── STEP 4: After sending ────────────────────────────────────────

  const now = new Date();

  // 4a. Update Lead status
  try {
    const currentMetadata = researchData;
    const updatedMetadata = {
      ...currentMetadata,
      lastOutreachEmail: {
        subject: generatedEmail.subject,
        body: generatedEmail.body,
        sentAt: now.toISOString(),
        sendSucceeded,
        fromAddress,
        emailId: emailResult.messageId || null,
      },
    };

    await db.lead.update({
      where: { id: leadId },
      data: {
        stage: sendSucceeded ? 'outreach_sent' : lead.stage,
        emailStatus: sendSucceeded ? 'sent' : (lead.emailStatus || 'none'),
        lastContactedAt: sendSucceeded ? now : lead.lastContactedAt,
        techStack: JSON.stringify(updatedMetadata),
      },
    });

    console.log(`[OutreachSender] Updated lead ${leadId}: stage=${sendSucceeded ? 'outreach_sent' : lead.stage}`);
  } catch (dbErr) {
    console.error('[OutreachSender] Failed to update lead:', dbErr);
  }

  // 4b. Create LeadActivity: type "email_sent"
  try {
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'email_sent',
        description: generatedEmail.subject,
        metadata: JSON.stringify({
          subject: generatedEmail.subject,
          bodyPreview: generatedEmail.body.substring(0, 200),
          sendSucceeded,
          emailId: emailResult.messageId || null,
          fromAddress,
          latencyMs,
        }),
      },
    });

    console.log(`[OutreachSender] Created LeadActivity for lead ${leadId}`);
  } catch (activityErr) {
    console.error('[OutreachSender] Failed to create LeadActivity:', activityErr);
  }

  // 4c. Create AuditLog entry
  await logAuditEvent(userId, 'email_sent', {
    leadId,
    leadName: lead.businessName,
    subject: generatedEmail.subject,
    sendSucceeded,
    emailId: emailResult.messageId,
    channel: 'email',
  });

  await logAIAudit({
    userId,
    action: 'ai_outreach_generated',
    resource: 'lead',
    resourceId: leadId,
    details: {
      type: 'outreach_email',
      provider: aiResult.provider,
      latencyMs,
      creditsDeducted: OUTREACH_CREDIT_COST,
      balance: deduction.newBalance,
      sendSucceeded,
    },
  });

  // ── STEP 5: Send notification to user ────────────────────────────

  const notificationTitle = 'Outreach Sent';
  const notificationMessage = `Outreach sent to ${lead.businessName} — ${generatedEmail.subject}`;

  // 5a. In-app notification via existing notification engine
  try {
    await sendNotification({
      userId,
      type: 'ai_outreach_complete',
      title: notificationTitle,
      message: notificationMessage,
      actionUrl: `/leads/${leadId}`,
      metadata: {
        leadId,
        subject: generatedEmail.subject,
        sendSucceeded,
      },
    });

    console.log(`[OutreachSender] In-app notification sent to user ${userId}`);
  } catch (notifErr) {
    console.error('[OutreachSender] Failed to send in-app notification:', notifErr);
  }

  // 5b. Telegram notification if user has Telegram connected
  try {
    const telegramConfig = await db.telegramConfig.findUnique({
      where: { userId },
      select: { isConnected: true, chatId: true, isPaused: true },
    });

    if (telegramConfig?.isConnected && telegramConfig.chatId && !telegramConfig.isPaused) {
      await sendTelegramNotification(userId, {
        title: notificationTitle,
        message: notificationMessage,
        type: 'ai_outreach_complete',
      });

      console.log(`[OutreachSender] Telegram notification sent to user ${userId}`);
    } else {
      console.log(`[OutreachSender] Telegram not connected for user ${userId}, skipping`);
    }
  } catch (telegramErr) {
    console.error('[OutreachSender] Telegram notification failed:', telegramErr);
  }

  // ── RETURN ───────────────────────────────────────────────────────

  return {
    success: sendSucceeded,
    emailId: emailResult.messageId || '',
    subject: generatedEmail.subject,
    creditsDeducted: OUTREACH_CREDIT_COST,
    newCreditBalance: deduction.newBalance,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════

interface OutreachPromptData {
  userName: string;
  companyName: string;
  companyDescription: string;
  topGap: string;
  personalizedPitch: string;
  approachAngle: string;
  niche: string;
  website: string;
}

/**
 * Build the structured AI prompt for cold outreach email generation.
 */
function buildOutreachPrompt(data: OutreachPromptData): string {
  return `Write a cold outreach email from ${data.userName} to ${data.companyName}.

Context:
- Their business: ${data.companyDescription}
- Key gap we identified: ${data.topGap}
- How we help: ${data.personalizedPitch}
- Approach angle: ${data.approachAngle}
- Niche: ${data.niche}
- Website: ${data.website || 'No website'}

Email rules:
- Subject line: specific to their gap, not generic
- Max 150 words in body
- No buzzwords like 'synergy' or 'leverage'
- End with a soft CTA: ask for a 15-minute call, not a sale
- Sound human, not like a template
- First line must reference something specific about their business

Return ONLY JSON:
{ "subject": string, "body": string }`;
}

// ═══════════════════════════════════════════════════════════════════
// AI RESPONSE PARSER
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse the AI response to extract subject and body.
 * Handles markdown-wrapped JSON gracefully.
 */
function parseEmailFromAI(
  content: string,
  companyName: string,
  topGap: string,
  userName: string
): GeneratedEmail {
  // Clean markdown wrapping if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Try to extract JSON from the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const subject = typeof parsed.subject === 'string' && parsed.subject.trim()
    ? parsed.subject.trim()
    : `Helping ${companyName} with ${topGap}`;

  const body = typeof parsed.body === 'string' && parsed.body.trim()
    ? parsed.body.trim()
    : buildFallbackBody(companyName, topGap, userName);

  return { subject, body };
}

// ═══════════════════════════════════════════════════════════════════
// FALLBACK EMAIL BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a fallback email when AI generation fails.
 * Template-based, still references the specific gap and company.
 */
function buildFallbackEmail(
  companyName: string,
  topGap: string,
  userName: string
): GeneratedEmail {
  const subject = `Helping ${companyName} with ${topGap}`;
  const body = buildFallbackBody(companyName, topGap, userName);

  return { subject, body };
}

/**
 * Build a fallback email body.
 */
function buildFallbackBody(
  companyName: string,
  topGap: string,
  userName: string
): string {
  return `Hi ${companyName} team,

I noticed that ${topGap.toLowerCase()} could be holding back your growth — businesses in your space often see a real difference once that's addressed.

I've helped companies like yours solve exactly this kind of challenge. Would you be open to a quick 15-minute call this week to explore if it makes sense for you?

Best,
${userName}`;
}

// ═══════════════════════════════════════════════════════════════════
// HTML EMAIL BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a professional HTML email for the outreach body.
 * Keeps the email looking personal (not like marketing).
 */
function buildOutreachHtml(body: string, userName: string, userBusiness: string): string {
  // Simple, personal email format — no heavy branding
  // Cold outreach should look like a regular email, not a marketing blast
  const signature = userBusiness
    ? `${userName}<br />${userBusiness}`
    : userName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#1e293b; line-height:1.6;">
  <div style="max-width:600px; margin:0 auto; padding:20px;">
    <div style="font-size:15px; line-height:24px; color:#1e293b; white-space:pre-line;">${escapeHtml(body)}</div>
    <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:14px; color:#64748b;">
      ${signature}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br />');
}

/**
 * Build a confirmation-copy HTML email sent to the user (sender) after
 * a successful outreach send. Clearly labeled as a copy for records.
 */
function buildOutreachConfirmationHtml(params: {
  recipientName: string;
  leadBusinessName: string;
  leadEmail: string;
  subject: string;
  body: string;
  sentAt: string;
}): string {
  const sentAtFormatted = new Date(params.sentAt).toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#1e293b; line-height:1.6;">
  <div style="max-width:600px; margin:0 auto; padding:20px;">
    <div style="background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:16px 18px; margin-bottom:20px;">
      <p style="margin:0 0 8px 0; font-size:14px; color:#1e40af; font-weight:600;">
        ✉️ Outreach sent — this is a copy for your records
      </p>
      <p style="margin:0; font-size:13px; color:#475569;">
        You sent an outreach email to <strong>${escapeHtml(params.leadBusinessName)}</strong>
        (${escapeHtml(params.leadEmail)}) on ${escapeHtml(sentAtFormatted)}.
      </p>
    </div>
    <div style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:18px 20px;">
      <p style="margin:0 0 12px 0; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
        Subject
      </p>
      <p style="margin:0 0 16px 0; font-size:15px; font-weight:600; color:#0f172a;">
        ${escapeHtml(params.subject)}
      </p>
      <div style="height:1px; background:#e2e8f0; margin:0 0 16px 0;"></div>
      <p style="margin:0 0 8px 0; font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">
        Message
      </p>
      <div style="font-size:15px; line-height:24px; color:#1e293b; white-space:pre-line;">${escapeHtml(params.body)}</div>
    </div>
    <p style="margin:16px 0 0 0; font-size:12px; color:#94a3b8; text-align:center;">
      This is an automated confirmation from AcquisitionOS. No action is required.
    </p>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse user services from settings JSON fields.
 * Tries to extract a readable list from targetNiches and targetChannels.
 */
function parseServicesFromSettings(
  targetNiches?: string | null,
  targetChannels?: string | null
): string {
  const parts: string[] = [];

  try {
    if (targetNiches) {
      const niches = JSON.parse(targetNiches) as string[];
      if (Array.isArray(niches) && niches.length > 0) {
        parts.push(...niches);
      }
    }
  } catch {
    // Ignore parse errors
  }

  try {
    if (targetChannels) {
      const channels = JSON.parse(targetChannels) as string[];
      if (Array.isArray(channels) && channels.length > 0) {
        parts.push(...channels);
      }
    }
  } catch {
    // Ignore parse errors
  }

  if (parts.length === 0) {
    return 'digital services and solutions';
  }

  return parts.join(', ');
}
