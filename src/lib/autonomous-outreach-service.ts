// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Outreach Service
// Automates the full outreach lifecycle across three autonomy modes:
//   - manual:   Generate only, user must approve and send manually
//   - assisted: Generate + create draft, user reviews and clicks send
//   - autonomous: Generate + send automatically (rate-limited)
//
// Safety guards for autonomous mode:
//   - Max 50 autonomous sends per day per user
//   - Max 10 per hour
//   - Min 5 min cooldown between sends to same lead
//   - Never send to leads marked opted_out or do_not_contact
//   - Always record OutreachMessage with generatedByAI=true
//   - Trigger 'ai_completed' workflow event after sending
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { generateOutreach, type OutreachMessageOutput, type OutreachChannel, type OutreachTone } from '@/lib/ai/outreach-generator';
import { sendEmail as sendViaGmail, createDraft as createGmailDraft } from '@/lib/gmail-delivery-service';
import { sendEmail as sendViaSmtp } from '@/lib/email';
import { deductCredits, checkCreditSufficiency } from '@/lib/credit-service';
import { evaluateTrigger } from '@/lib/workflow-triggers';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

export type OutreachAutonomyMode = 'manual' | 'assisted' | 'autonomous';

export interface AutonomousOutreachParams {
  userId: string;
  leadId: string;
  channel: 'email' | 'whatsapp' | 'telegram';
  autonomyMode?: OutreachAutonomyMode;
  tone?: string;
  customInstructions?: string;
}

export interface AutonomousOutreachResult {
  success: boolean;
  action: 'generated' | 'drafted' | 'sent';
  messageId?: string;
  message?: OutreachMessageOutput;
  error?: string;
  creditsUsed?: number;
  autonomyMode: string;
}

export interface BatchOutreachParams {
  userId: string;
  leadIds: string[];
  channel: 'email';
  autonomyMode: 'assisted' | 'autonomous';
  maxPerHour?: number;
}

export interface BatchOutreachResult {
  total: number;
  generated: number;
  drafted: number;
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{ leadId: string; success: boolean; action: string; error?: string }>;
}

export interface OutreachAutonomyStatus {
  mode: OutreachAutonomyMode;
  dailyLimit: number;
  dailyUsed: number;
  hourlyLimit: number;
  hourlyUsed: number;
  remainingToday: number;
  remainingThisHour: number;
  canSendAutonomous: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & RATE LIMITS
// ═══════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[AutonomousOutreach]';

/** Default autonomy mode for new users */
const DEFAULT_AUTONOMY_MODE: OutreachAutonomyMode = 'manual';

/** Maximum autonomous sends per day per user */
const MAX_DAILY_AUTONOMOUS_SENDS = 50;

/** Maximum autonomous sends per hour per user */
const MAX_HOURLY_AUTONOMOUS_SENDS = 10;

/** Minimum cooldown period (ms) between sends to the same lead */
const SAME_LEAD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Credit cost for outreach generation (matches outreach-generator) */
const OUTREACH_CREDIT_COST = 2;

/** Credit cost for sending (when not already deducted by generator) */
const SEND_CREDIT_COST = 1;

// ═══════════════════════════════════════════════════════════════════
// 1. MAIN AUTONOMOUS OUTREACH FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute the full autonomous outreach lifecycle for a single lead.
 * Respects the user's outreach autonomy mode and all safety guards.
 */
export async function autonomousOutreach(
  params: AutonomousOutreachParams
): Promise<AutonomousOutreachResult> {
  const { userId, leadId, channel, tone, customInstructions } = params;

  try {
    // 1. Resolve autonomy mode
    const autonomyMode = params.autonomyMode || await getUserOutreachAutonomyMode(userId);

    console.log(
      `${LOG_PREFIX} Processing outreach for lead ${leadId}, channel=${channel}, mode=${autonomyMode}`
    );

    // 2. Validate lead eligibility
    const leadCheck = await validateLeadEligibility(leadId, userId);
    if (!leadCheck.eligible) {
      return {
        success: false,
        action: 'generated',
        error: leadCheck.reason,
        autonomyMode,
      };
    }

    // 3. For autonomous mode, check rate limits before generating
    if (autonomyMode === 'autonomous') {
      const rateLimitCheck = await checkRateLimits(userId, leadId);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          action: 'generated',
          error: rateLimitCheck.reason,
          autonomyMode,
        };
      }
    }

    // 4. Check credit sufficiency (generation costs 2 credits)
    const creditCheck = await checkCreditSufficiency(userId, OUTREACH_CREDIT_COST);
    if (!creditCheck.sufficient) {
      return {
        success: false,
        action: 'generated',
        error: `Insufficient credits. Need ${OUTREACH_CREDIT_COST}, have ${creditCheck.balance}`,
        autonomyMode,
      };
    }

    // 5. Generate outreach message via AI
    const generateResult = await generateOutreach({
      leadId,
      userId,
      channel: channel as OutreachChannel,
      tone: (tone as OutreachTone) || 'professional',
      customInstructions,
    });

    if (!generateResult.success || !generateResult.message) {
      return {
        success: false,
        action: 'generated',
        error: generateResult.error || 'AI outreach generation failed',
        autonomyMode,
      };
    }

    const generatedMessage = generateResult.message;

    // 6. Handle based on autonomy mode
    switch (autonomyMode) {
      case 'manual':
        return handleManualMode(userId, leadId, generatedMessage, generateResult.creditsDeducted, autonomyMode);

      case 'assisted':
        return handleAssistedMode(userId, leadId, generatedMessage, channel, generateResult.creditsDeducted, autonomyMode);

      case 'autonomous':
        return handleAutonomousMode(userId, leadId, generatedMessage, channel, generateResult.creditsDeducted, autonomyMode);

      default:
        return handleManualMode(userId, leadId, generatedMessage, generateResult.creditsDeducted, autonomyMode);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in autonomousOutreach:`, error);
    return {
      success: false,
      action: 'generated',
      error: error instanceof Error ? error.message : 'Autonomous outreach failed',
      autonomyMode: params.autonomyMode || DEFAULT_AUTONOMY_MODE,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. BATCH OUTREACH
// ═══════════════════════════════════════════════════════════════════

/**
 * Process outreach for multiple leads in batch.
 * Respects hourly rate limits and processes leads sequentially with delays.
 */
export async function batchOutreach(
  params: BatchOutreachParams
): Promise<BatchOutreachResult> {
  const { userId, leadIds, channel, autonomyMode, maxPerHour } = params;

  console.log(
    `${LOG_PREFIX} Starting batch outreach: ${leadIds.length} leads, mode=${autonomyMode}`
  );

  const result: BatchOutreachResult = {
    total: leadIds.length,
    generated: 0,
    drafted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  const hourlyLimit = maxPerHour || MAX_HOURLY_AUTONOMOUS_SENDS;

  for (const leadId of leadIds) {
    // Check hourly rate limit before each send (for autonomous)
    if (autonomyMode === 'autonomous') {
      const hourlyUsed = await getHourlySendCount(userId);
      if (hourlyUsed >= hourlyLimit) {
        console.log(`${LOG_PREFIX} Hourly limit reached (${hourlyUsed}/${hourlyLimit}), skipping remaining`);
        // Mark remaining as skipped
        for (const remainingId of leadIds.slice(leadIds.indexOf(leadId))) {
          result.skipped++;
          result.results.push({
            leadId: remainingId,
            success: false,
            action: 'skipped',
            error: 'Hourly rate limit reached',
          });
        }
        break;
      }
    }

    // Process individual outreach
    const individualResult = await autonomousOutreach({
      userId,
      leadId,
      channel,
      autonomyMode,
    });

    result.results.push({
      leadId,
      success: individualResult.success,
      action: individualResult.action,
      error: individualResult.error,
    });

    if (individualResult.success) {
      switch (individualResult.action) {
        case 'generated':
          result.generated++;
          break;
        case 'drafted':
          result.drafted++;
          break;
        case 'sent':
          result.sent++;
          break;
      }
    } else if (individualResult.error?.includes('Rate limit') || individualResult.error?.includes('cooldown')) {
      result.skipped++;
    } else {
      result.failed++;
    }

    // Add a small delay between batch operations to avoid overwhelming APIs
    if (leadIds.indexOf(leadId) < leadIds.length - 1) {
      await sleep(500);
    }
  }

  console.log(
    `${LOG_PREFIX} Batch outreach complete: sent=${result.sent}, drafted=${result.drafted}, ` +
    `generated=${result.generated}, failed=${result.failed}, skipped=${result.skipped}`
  );

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 3. SET AUTONOMY MODE
// ═══════════════════════════════════════════════════════════════════

/**
 * Update a user's outreach autonomy mode.
 */
export async function setOutreachAutonomyMode(
  userId: string,
  mode: string
): Promise<void> {
  const validModes: OutreachAutonomyMode[] = ['manual', 'assisted', 'autonomous'];

  if (!validModes.includes(mode as OutreachAutonomyMode)) {
    throw new Error(`Invalid outreach autonomy mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
  }

  // Upsert UserSettings with the new mode
  await db.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      outreachAutonomyMode: mode,
    },
    update: {
      outreachAutonomyMode: mode,
    },
  });

  console.log(`${LOG_PREFIX} Outreach autonomy mode updated for user ${userId}: ${mode}`);
}

// ═══════════════════════════════════════════════════════════════════
// 4. GET AUTONOMY STATUS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the current outreach autonomy status for a user, including rate limits.
 */
export async function getOutreachAutonomyStatus(
  userId: string
): Promise<OutreachAutonomyStatus> {
  const mode = await getUserOutreachAutonomyMode(userId);
  const dailyUsed = await getDailySendCount(userId);
  const hourlyUsed = await getHourlySendCount(userId);

  const canSendAutonomous =
    mode === 'autonomous' &&
    dailyUsed < MAX_DAILY_AUTONOMOUS_SENDS &&
    hourlyUsed < MAX_HOURLY_AUTONOMOUS_SENDS;

  return {
    mode,
    dailyLimit: MAX_DAILY_AUTONOMOUS_SENDS,
    dailyUsed,
    hourlyLimit: MAX_HOURLY_AUTONOMOUS_SENDS,
    hourlyUsed,
    remainingToday: Math.max(0, MAX_DAILY_AUTONOMOUS_SENDS - dailyUsed),
    remainingThisHour: Math.max(0, MAX_HOURLY_AUTONOMOUS_SENDS - hourlyUsed),
    canSendAutonomous,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MODE HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Manual mode: Generate only. The message is already stored as a draft
 * by the outreach generator. User must review and send manually.
 */
async function handleManualMode(
  userId: string,
  leadId: string,
  message: OutreachMessageOutput,
  creditsUsed?: number,
  autonomyMode: string
): Promise<AutonomousOutreachResult> {
  console.log(`${LOG_PREFIX} Manual mode: message generated for lead ${leadId}, awaiting user action`);

  return {
    success: true,
    action: 'generated',
    message,
    creditsUsed,
    autonomyMode,
  };
}

/**
 * Assisted mode: Generate + create email draft (Gmail or SMTP).
 * User reviews the draft in their inbox and clicks send.
 */
async function handleAssistedMode(
  userId: string,
  leadId: string,
  message: OutreachMessageOutput,
  channel: string,
  creditsUsed?: number,
  autonomyMode: string
): Promise<AutonomousOutreachResult> {
  console.log(`${LOG_PREFIX} Assisted mode: creating draft for lead ${leadId}`);

  if (channel !== 'email') {
    // For non-email channels, just return the generated message
    // (WhatsApp/Telegram drafts would need separate channel-specific handling)
    return {
      success: true,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
    };
  }

  try {
    // Get lead email
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { email: true },
    });

    if (!lead?.email) {
      return {
        success: true,
        action: 'generated',
        message,
        creditsUsed,
        autonomyMode,
        error: 'No email address found for lead — draft could not be created',
      };
    }

    // Try Gmail draft first, then fallback
    const draftResult = await attemptGmailDraft(userId, lead.email, message);

    if (draftResult.success) {
      // Update the OutreachMessage status to 'drafted'
      await updateOutreachMessageStatus(leadId, userId, 'draft');

      console.log(`${LOG_PREFIX} Gmail draft created for lead ${leadId}: ${draftResult.draftId}`);

      return {
        success: true,
        action: 'drafted',
        messageId: draftResult.draftId,
        message,
        creditsUsed,
        autonomyMode,
      };
    }

    // Gmail draft failed — return as generated (user can still send manually)
    console.warn(`${LOG_PREFIX} Gmail draft failed for lead ${leadId}: ${draftResult.error}`);

    return {
      success: true,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
      error: `Draft creation failed: ${draftResult.error}. Message available for manual review.`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating draft:`, error);
    return {
      success: true,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
      error: `Draft creation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Autonomous mode: Generate + send automatically.
 * All safety guards have been checked before this point.
 */
async function handleAutonomousMode(
  userId: string,
  leadId: string,
  message: OutreachMessageOutput,
  channel: string,
  creditsUsed?: number,
  autonomyMode: string
): Promise<AutonomousOutreachResult> {
  console.log(`${LOG_PREFIX} Autonomous mode: sending message for lead ${leadId}`);

  if (channel !== 'email') {
    // Non-email channels: return generated (channel-specific senders would handle this)
    return {
      success: true,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
      error: 'Autonomous sending only supported for email channel',
    };
  }

  try {
    // Get lead email
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { email: true },
    });

    if (!lead?.email) {
      return {
        success: false,
        action: 'generated',
        message,
        creditsUsed,
        autonomyMode,
        error: 'No email address found for lead — cannot send autonomously',
      };
    }

    // Attempt Gmail send first, then SMTP fallback
    const sendResult = await attemptSend(userId, leadId, lead.email, message);

    if (sendResult.success) {
      // Update OutreachMessage status
      await updateOutreachMessageStatus(leadId, userId, 'sent');

      // Update lead lastContactedAt
      await db.lead.update({
        where: { id: leadId },
        data: {
          emailStatus: 'sent',
          lastContactedAt: new Date(),
        },
      });

      // Fire workflow trigger
      try {
        await evaluateTrigger('ai_completed', {
          leadId,
          channelId: sendResult.messageId,
        }, userId);
      } catch (triggerError) {
        console.warn(`${LOG_PREFIX} Workflow trigger failed:`, triggerError);
      }

      console.log(`${LOG_PREFIX} Autonomous send successful for lead ${leadId}: ${sendResult.messageId}`);

      return {
        success: true,
        action: 'sent',
        messageId: sendResult.messageId,
        message,
        creditsUsed,
        autonomyMode,
      };
    }

    // Send failed — mark as failed
    await updateOutreachMessageStatus(leadId, userId, 'failed');

    console.error(`${LOG_PREFIX} Autonomous send failed for lead ${leadId}: ${sendResult.error}`);

    return {
      success: false,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
      error: `Send failed: ${sendResult.error}`,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in autonomous send:`, error);
    return {
      success: false,
      action: 'generated',
      message,
      creditsUsed,
      autonomyMode,
      error: error instanceof Error ? error.message : 'Autonomous send failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate that a lead is eligible for outreach.
 */
async function validateLeadEligibility(
  leadId: string,
  userId: string
): Promise<{ eligible: boolean; reason?: string }> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      isActive: true,
      stage: true,
      emailStatus: true,
      tags: true,
      userId: true,
    },
  });

  if (!lead) {
    return { eligible: false, reason: 'Lead not found' };
  }

  if (!lead.isActive) {
    return { eligible: false, reason: 'Lead is inactive' };
  }

  // Check ownership (or org-level access)
  if (lead.userId && lead.userId !== userId) {
    return { eligible: false, reason: 'Lead does not belong to this user' };
  }

  // Check for opted_out or do_not_contact tags
  const tags: string[] = [];
  try {
    tags.push(...JSON.parse(lead.tags || '[]'));
  } catch {
    // tags may not be valid JSON
  }

  if (tags.includes('opted_out')) {
    return { eligible: false, reason: 'Lead has opted out of communications' };
  }

  if (tags.includes('do_not_contact')) {
    return { eligible: false, reason: 'Lead is marked as do not contact' };
  }

  // Check email status for bounced or unsubscribed
  if (lead.emailStatus === 'bounced') {
    return { eligible: false, reason: 'Lead email has bounced — do not send' };
  }

  if (lead.emailStatus === 'unsubscribed') {
    return { eligible: false, reason: 'Lead has unsubscribed' };
  }

  return { eligible: true };
}

/**
 * Check all rate limits for autonomous sending.
 */
async function checkRateLimits(
  userId: string,
  leadId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // 1. Daily limit
  const dailyUsed = await getDailySendCount(userId);
  if (dailyUsed >= MAX_DAILY_AUTONOMOUS_SENDS) {
    return {
      allowed: false,
      reason: `Daily autonomous send limit reached (${dailyUsed}/${MAX_DAILY_AUTONOMOUS_SENDS}). Try again tomorrow.`,
    };
  }

  // 2. Hourly limit
  const hourlyUsed = await getHourlySendCount(userId);
  if (hourlyUsed >= MAX_HOURLY_AUTONOMOUS_SENDS) {
    return {
      allowed: false,
      reason: `Hourly autonomous send limit reached (${hourlyUsed}/${MAX_HOURLY_AUTONOMOUS_SENDS}). Try again in the next hour.`,
    };
  }

  // 3. Same-lead cooldown
  const cooldownOk = await checkSameLeadCooldown(leadId, userId);
  if (!cooldownOk) {
    return {
      allowed: false,
      reason: `Cooldown active. Minimum ${SAME_LEAD_COOLDOWN_MS / 60_000} minutes between messages to the same lead.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if enough time has passed since the last message to this lead.
 */
async function checkSameLeadCooldown(
  leadId: string,
  userId: string
): Promise<boolean> {
  const lastMessage = await db.outreachMessage.findFirst({
    where: {
      leadId,
      userId,
      status: 'sent',
      sentAt: { not: null },
    },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });

  if (!lastMessage?.sentAt) {
    return true; // No previous sent message — no cooldown needed
  }

  const timeSinceLastSend = Date.now() - new Date(lastMessage.sentAt).getTime();
  return timeSinceLastSend >= SAME_LEAD_COOLDOWN_MS;
}

// ═══════════════════════════════════════════════════════════════════
// SENDING HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Try to create a Gmail draft. Returns result even on failure.
 */
async function attemptGmailDraft(
  userId: string,
  recipientEmail: string,
  message: OutreachMessageOutput
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  try {
    // Find user's active Gmail account
    const emailAccount = await db.emailAccount.findFirst({
      where: {
        userId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!emailAccount) {
      return { success: false, error: 'No active Gmail account connected' };
    }

    const draftResult = await createGmailDraft(emailAccount.id, {
      to: recipientEmail,
      subject: message.subject || `Re: Outreach`,
      body: message.body,
      html: message.body, // Use same content as HTML for simplicity
    });

    if (draftResult.success) {
      return { success: true, draftId: draftResult.draftId };
    }

    return { success: false, error: draftResult.error || 'Gmail draft creation failed' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gmail draft error',
    };
  }
}

/**
 * Attempt to send via Gmail first, then fallback to SMTP.
 */
async function attemptSend(
  userId: string,
  leadId: string,
  recipientEmail: string,
  message: OutreachMessageOutput
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // 1. Try Gmail API first
  const gmailResult = await attemptGmailSend(userId, recipientEmail, message);
  if (gmailResult.success) {
    return gmailResult;
  }

  console.warn(`${LOG_PREFIX} Gmail send failed, trying SMTP fallback: ${gmailResult.error}`);

  // 2. Fallback to SMTP via email.ts
  const smtpResult = await attemptSmtpSend(recipientEmail, message);
  if (smtpResult.success) {
    return smtpResult;
  }

  console.error(`${LOG_PREFIX} SMTP send also failed: ${smtpResult.error}`);

  return {
    success: false,
    error: `Both Gmail and SMTP failed. Gmail: ${gmailResult.error}. SMTP: ${smtpResult.error}`,
  };
}

/**
 * Try to send via Gmail API.
 */
async function attemptGmailSend(
  userId: string,
  recipientEmail: string,
  message: OutreachMessageOutput
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const emailAccount = await db.emailAccount.findFirst({
      where: {
        userId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!emailAccount) {
      return { success: false, error: 'No active Gmail account connected' };
    }

    const sendResult = await sendViaGmail(emailAccount.id, {
      to: recipientEmail,
      subject: message.subject || `Re: Outreach`,
      body: message.body,
      html: message.body,
    });

    if (sendResult.success) {
      return { success: true, messageId: sendResult.gmailMessageId || sendResult.messageId };
    }

    return { success: false, error: sendResult.error || 'Gmail send failed' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gmail send error',
    };
  }
}

/**
 * Try to send via SMTP fallback.
 */
async function attemptSmtpSend(
  recipientEmail: string,
  message: OutreachMessageOutput
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const smtpResult = await sendViaSmtp({
      to: recipientEmail,
      subject: message.subject || `Re: Outreach`,
      html: message.body,
      text: message.body,
    });

    if (smtpResult.sent) {
      return {
        success: true,
        messageId: smtpResult.messageId || `smtp_${Date.now()}`,
      };
    }

    return { success: false, error: smtpResult.error || 'SMTP send failed' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMTP send error',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the user's outreach autonomy mode from settings.
 */
async function getUserOutreachAutonomyMode(userId: string): Promise<OutreachAutonomyMode> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { outreachAutonomyMode: true },
  });

  const mode = settings?.outreachAutonomyMode || DEFAULT_AUTONOMY_MODE;
  const validModes: OutreachAutonomyMode[] = ['manual', 'assisted', 'autonomous'];

  return validModes.includes(mode as OutreachAutonomyMode)
    ? (mode as OutreachAutonomyMode)
    : DEFAULT_AUTONOMY_MODE;
}

/**
 * Count autonomous sends for a user today.
 */
async function getDailySendCount(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return db.outreachMessage.count({
    where: {
      userId,
      status: 'sent',
      generatedByAI: true,
      sentAt: { gte: startOfDay },
    },
  });
}

/**
 * Count autonomous sends for a user in the last hour.
 */
async function getHourlySendCount(userId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  return db.outreachMessage.count({
    where: {
      userId,
      status: 'sent',
      generatedByAI: true,
      sentAt: { gte: oneHourAgo },
    },
  });
}

/**
 * Update the most recent draft OutreachMessage status for a lead.
 */
async function updateOutreachMessageStatus(
  leadId: string,
  userId: string,
  status: string
): Promise<void> {
  try {
    const latestMessage = await db.outreachMessage.findFirst({
      where: {
        leadId,
        userId,
        generatedByAI: true,
        status: 'draft',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (latestMessage) {
      const updateData: Record<string, unknown> = { status };
      if (status === 'sent') {
        updateData.sentAt = new Date();
      }

      await db.outreachMessage.update({
        where: { id: latestMessage.id },
        data: updateData,
      });
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to update outreach message status:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Sleep helper for batch delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
