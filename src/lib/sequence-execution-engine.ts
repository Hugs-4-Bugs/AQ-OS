// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sequence Execution Engine
// Phase: Outreach Sequence Automation
//
// CRITICAL RULES:
// - NEVER execute steps for paused/completed sequences
// - NEVER send to leads who have unsubscribed, bounced, or opted out
// - NEVER skip credit deduction — 1 credit per step execution
// - NEVER skip audit logging for every step execution
// - ALWAYS check for replies before sending the next step
// - ALWAYS handle template variable substitution
// - ALWAYS set nextStepAt after processing a step
// - Fire-and-forget notifications — never block the main execution loop
// - Graceful error handling — one enrollment failure must not block others
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notification-engine';
import { logAuditEvent } from '@/lib/lead-audit';
import { deductCredits } from '@/lib/credit-service';

// ═══════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════

export interface SequenceEnrollmentInput {
  sequenceId: string;
  leadId: string;
  userId: string;
  startAt?: Date;
  variables?: Record<string, string>; // Template variables like {{businessName}}
}

export interface StepExecutionResult {
  enrollmentId: string;
  stepId: string;
  stepOrder: number;
  channel: string;
  status: 'sent' | 'skipped' | 'failed' | 'paused';
  messageId?: string;
  error?: string;
  nextStepAt?: Date;
}

export interface SequenceExecutionResult {
  totalProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
  paused: number;
  completed: number;
  results: StepExecutionResult[];
}

export interface SequenceAnalyticsStepResult {
  stepOrder: number;
  stepId: string;
  channel: string;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
}

export interface SequenceAnalyticsResult {
  sequenceId: string;
  sequenceName: string;
  status: string;
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  pausedEnrollments: number;
  optedOutEnrollments: number;
  completionRate: number;
  totalMessagesSent: number;
  totalOpens: number;
  totalReplies: number;
  totalBounces: number;
  overallOpenRate: number;
  overallReplyRate: number;
  overallBounceRate: number;
  steps: SequenceAnalyticsStepResult[];
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const STEP_CREDIT_COST = 1;
const CREDIT_ACTION = 'sequence_step';

const CHANNEL_EMAIL = 'email';
const CHANNEL_WHATSAPP = 'whatsapp';
const CHANNEL_LINKEDIN = 'linkedin';
const CHANNEL_INSTAGRAM = 'instagram';
const CHANNEL_DELAY = 'delay';
const CHANNEL_AI = 'ai';

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE VARIABLE SUBSTITUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Replace {{variable}} placeholders in a template with actual values.
 * Variables come from the enrollment's variables map plus lead data.
 */
function substituteTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in variables && variables[key] !== undefined && variables[key] !== null) {
      return String(variables[key]);
    }
    // Return the original placeholder if no variable found
    return match;
  });
}

/**
 * Build template variables from lead data merged with enrollment variables.
 * Enrollment variables take precedence over lead data.
 */
function buildTemplateVariables(
  lead: {
    businessName: string | null;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    niche: string | null;
    website: string | null;
  },
  enrollmentVariables: Record<string, string> = {}
): Record<string, string> {
  const leadVars: Record<string, string> = {};

  if (lead.businessName) leadVars['businessName'] = lead.businessName;
  if (lead.ownerName) leadVars['ownerName'] = lead.ownerName;
  if (lead.email) leadVars['email'] = lead.email;
  if (lead.phone) leadVars['phone'] = lead.phone;
  if (lead.city) leadVars['city'] = lead.city;
  if (lead.country) leadVars['country'] = lead.country;
  if (lead.niche) leadVars['niche'] = lead.niche;
  if (lead.website) leadVars['website'] = lead.website;

  // Enrollment variables override lead data
  return { ...leadVars, ...enrollmentVariables };
}

// ═══════════════════════════════════════════════════════════════════
// PRE-SEND VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a lead can receive messages on a given channel.
 * Returns { canSend: true } or { canSend: false, reason: string }.
 */
async function canSendToLead(
  leadId: string,
  channel: string,
  userId: string
): Promise<{ canSend: boolean; reason?: string }> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      email: true,
      phone: true,
      whatsapp: true,
      emailStatus: true,
      isActive: true,
    },
  });

  if (!lead || !lead.isActive) {
    return { canSend: false, reason: 'Lead not found or inactive' };
  }

  // Channel-specific checks
  if (channel === CHANNEL_EMAIL) {
    if (!lead.email) {
      return { canSend: false, reason: 'Lead has no email address' };
    }
    if (lead.emailStatus === 'bounced') {
      return { canSend: false, reason: 'Lead email has bounced' };
    }
    if (lead.emailStatus === 'unsubscribed') {
      return { canSend: false, reason: 'Lead has unsubscribed' };
    }

    // Check EmailUnsubscribe table
    const unsubscribed = await db.emailUnsubscribe.findUnique({
      where: { email: lead.email },
    });
    if (unsubscribed) {
      return { canSend: false, reason: 'Lead email is in unsubscribe list' };
    }

    // Check for hard bounces
    const hardBounce = await db.emailBounce.findFirst({
      where: {
        leadId,
        bounceType: 'hard',
      },
    });
    if (hardBounce) {
      return { canSend: false, reason: 'Lead has a hard bounce recorded' };
    }
  }

  if (channel === CHANNEL_WHATSAPP) {
    if (!lead.whatsapp && !lead.phone) {
      return { canSend: false, reason: 'Lead has no WhatsApp/phone number' };
    }
  }

  if (channel === CHANNEL_LINKEDIN) {
    // LinkedIn is always a manual action, so we can always "log" it
    return { canSend: true };
  }

  if (channel === CHANNEL_INSTAGRAM) {
    // Instagram DM is manual for now
    return { canSend: true };
  }

  return { canSend: true };
}

/**
 * Check if a lead has replied to any message in the sequence.
 * If so, the enrollment should be paused.
 */
async function hasLeadRepliedInSequence(
  leadId: string,
  sequenceId: string
): Promise<boolean> {
  // Get all step IDs for this sequence
  const steps = await db.sequenceStep.findMany({
    where: { sequenceId },
    select: { id: true },
  });

  const stepIds = steps.map((s) => s.id);

  if (stepIds.length === 0) return false;

  // Check if any outreach message for this lead + sequence steps has been replied
  const repliedMessage = await db.outreachMessage.findFirst({
    where: {
      leadId,
      sequenceStepId: { in: stepIds },
      status: 'replied',
    },
  });

  return !!repliedMessage;
}

// ═══════════════════════════════════════════════════════════════════
// CHANNEL-SPECIFIC SEND FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Send an email step via Gmail API.
 * Uses the gmail-delivery-service pattern.
 */
async function sendEmailStep(params: {
  userId: string;
  leadId: string;
  toEmail: string;
  subject: string;
  body: string;
  htmlBody?: string;
  stepId: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Find the user's active Gmail account
    const emailAccount = await db.emailAccount.findFirst({
      where: {
        userId: params.userId,
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!emailAccount) {
      return { success: false, error: 'No active Gmail account found. Connect Gmail first.' };
    }

    // Use gmail-delivery-service to send
    const { sendEmail } = await import('@/lib/gmail-delivery-service');

    const result = await sendEmail(emailAccount.id, {
      to: params.toEmail,
      subject: params.subject,
      body: params.body,
      html: params.htmlBody,
    });

    // Update the OutreachMessage to link it to the sequence step
    if (result.success && result.gmailMessageId) {
      // Find the most recent outreach message for this lead and update it
      const recentMessage = await db.outreachMessage.findFirst({
        where: {
          leadId: params.leadId,
          userId: params.userId,
          channel: 'email',
          status: 'sent',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentMessage && !recentMessage.sequenceStepId) {
        await db.outreachMessage.update({
          where: { id: recentMessage.id },
          data: {
            sequenceStepId: params.stepId,
            trackingPixelId: `seq_${params.stepId}_${Date.now()}`,
          },
        });
      }
    }

    return {
      success: result.success,
      messageId: result.gmailMessageId || result.messageId,
      error: result.success ? undefined : 'Gmail send failed',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error sending email';
    console.error('[SequenceEngine] Email step failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Send a WhatsApp step via WhatsApp service.
 */
async function sendWhatsAppStep(params: {
  userId: string;
  leadId: string;
  toPhone: string;
  body: string;
  stepId: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get WhatsApp config for this user
    const whatsappConfig = await db.whatsappConfig.findUnique({
      where: { userId: params.userId },
    });

    if (!whatsappConfig || !whatsappConfig.isConnected || whatsappConfig.isPaused) {
      return { success: false, error: 'WhatsApp not connected or paused' };
    }

    let sendResult: { success: boolean; deliveryId: string; providerMessageId?: string; error?: string };

    if (whatsappConfig.provider === 'meta') {
      const { sendMetaMessage } = await import('@/lib/whatsapp-service');
      sendResult = await sendMetaMessage(params.userId, params.toPhone, params.body);
    } else if (whatsappConfig.provider === 'twilio') {
      const { sendTwilioMessage } = await import('@/lib/whatsapp-service');
      sendResult = await sendTwilioMessage(params.userId, params.toPhone, params.body);
    } else {
      return { success: false, error: `Unsupported WhatsApp provider: ${whatsappConfig.provider}` };
    }

    if (sendResult.success) {
      // Create OutreachMessage record for this WhatsApp send
      await db.outreachMessage.create({
        data: {
          leadId: params.leadId,
          userId: params.userId,
          channel: 'whatsapp',
          direction: 'outbound',
          content: params.body,
          status: 'sent',
          sentAt: new Date(),
          sequenceStepId: params.stepId,
          metadata: JSON.stringify({
            providerMessageId: sendResult.providerMessageId,
            deliveryId: sendResult.deliveryId,
          }),
        },
      });

      // Update lead's last contacted
      await db.lead.update({
        where: { id: params.leadId },
        data: { lastContactedAt: new Date() },
      });
    }

    return {
      success: sendResult.success,
      messageId: sendResult.providerMessageId || sendResult.deliveryId,
      error: sendResult.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error sending WhatsApp';
    console.error('[SequenceEngine] WhatsApp step failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Log a LinkedIn step as a manual action needed.
 * LinkedIn outreach requires manual execution.
 */
async function logLinkedInStep(params: {
  userId: string;
  leadId: string;
  body: string;
  stepId: string;
  subject?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  try {
    // Create OutreachMessage record with 'draft' status (manual action needed)
    const outreachMessage = await db.outreachMessage.create({
      data: {
        leadId: params.leadId,
        userId: params.userId,
        channel: 'linkedin',
        direction: 'outbound',
        subject: params.subject || 'LinkedIn outreach',
        content: params.body,
        status: 'draft', // Needs manual action
        sequenceStepId: params.stepId,
        generatedByAI: false,
        metadata: JSON.stringify({
          actionRequired: true,
          actionType: 'linkedin_message',
          note: 'Manual LinkedIn action required — automatic sending is not supported',
        }),
      },
    });

    // Send notification to user about manual action needed
    await sendNotification({
      userId: params.userId,
      type: 'workflow_step_complete',
      title: 'LinkedIn Action Required',
      message: `A LinkedIn message needs to be sent manually for lead. Check your outreach queue.`,
      actionUrl: `/leads/${params.leadId}`,
      metadata: {
        leadId: params.leadId,
        stepId: params.stepId,
        channel: 'linkedin',
      },
    });

    return { success: true, messageId: outreachMessage.id };
  } catch (error) {
    console.error('[SequenceEngine] LinkedIn step logging failed:', error);
    return { success: false };
  }
}

/**
 * Log an Instagram step as a manual action needed.
 */
async function logInstagramStep(params: {
  userId: string;
  leadId: string;
  body: string;
  stepId: string;
  subject?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  try {
    const outreachMessage = await db.outreachMessage.create({
      data: {
        leadId: params.leadId,
        userId: params.userId,
        channel: 'instagram',
        direction: 'outbound',
        subject: params.subject || 'Instagram outreach',
        content: params.body,
        status: 'draft',
        sequenceStepId: params.stepId,
        generatedByAI: false,
        metadata: JSON.stringify({
          actionRequired: true,
          actionType: 'instagram_dm',
          note: 'Manual Instagram action required — automatic sending is not supported',
        }),
      },
    });

    await sendNotification({
      userId: params.userId,
      type: 'workflow_step_complete',
      title: 'Instagram Action Required',
      message: `An Instagram DM needs to be sent manually for lead. Check your outreach queue.`,
      actionUrl: `/leads/${params.leadId}`,
      metadata: {
        leadId: params.leadId,
        stepId: params.stepId,
        channel: 'instagram',
      },
    });

    return { success: true, messageId: outreachMessage.id };
  } catch (error) {
    console.error('[SequenceEngine] Instagram step logging failed:', error);
    return { success: false };
  }
}

/**
 * Execute an AI step — generate personalized content using AI provider,
 * then send via the appropriate channel.
 */
async function executeAIStep(params: {
  userId: string;
  leadId: string;
  leadData: {
    businessName: string | null;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    niche: string | null;
    website: string | null;
  };
  template: string;
  subject?: string;
  channel: string;
  stepId: string;
  variables: Record<string, string>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { executeAICompletion } = await import('@/lib/ai/ai-provider');

    // Build context from lead data
    const contextLines: string[] = [];
    if (params.leadData.businessName) contextLines.push(`Business: ${params.leadData.businessName}`);
    if (params.leadData.ownerName) contextLines.push(`Owner: ${params.leadData.ownerName}`);
    if (params.leadData.city) contextLines.push(`City: ${params.leadData.city}`);
    if (params.leadData.country) contextLines.push(`Country: ${params.leadData.country}`);
    if (params.leadData.niche) contextLines.push(`Niche: ${params.leadData.niche}`);
    if (params.leadData.website) contextLines.push(`Website: ${params.leadData.website}`);

    const systemPrompt = `You are an AI outreach assistant for AcquisitionOS. Generate a personalized outreach message based on the template and lead context provided. Keep the tone professional and engaging. Do not include any placeholders — fill in all details. Output only the message body, no additional commentary.`;

    const userPrompt = `Lead context:\n${contextLines.join('\n')}\n\nTemplate to personalize:\n${params.template}\n\nGenerate a personalized version of this message for the lead described above. Channel: ${params.channel}.`;

    const result = await executeAICompletion(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: {
          provider: 'z-ai',
          maxTokens: 1024,
          temperature: 0.7,
        },
      },
      params.userId,
      'sequence_ai_step'
    );

    if (!result.success || !result.content) {
      return { success: false, error: result.error || 'AI content generation failed' };
    }

    const personalizedContent = result.content.trim();

    // Now send via the appropriate channel
    const sendChannel = params.channel === CHANNEL_AI ? CHANNEL_EMAIL : params.channel;

    if (sendChannel === CHANNEL_EMAIL && params.leadData.email) {
      return sendEmailStep({
        userId: params.userId,
        leadId: params.leadId,
        toEmail: params.leadData.email,
        subject: substituteTemplateVariables(params.subject || 'Outreach', params.variables),
        body: personalizedContent,
        stepId: params.stepId,
      });
    }

    if (sendChannel === CHANNEL_WHATSAPP) {
      const phone = params.leadData.phone || params.leadData.phone;
      if (!phone) {
        return { success: false, error: 'No phone number for WhatsApp' };
      }
      return sendWhatsAppStep({
        userId: params.userId,
        leadId: params.leadId,
        toPhone: phone,
        body: personalizedContent,
        stepId: params.stepId,
      });
    }

    // Default: create OutreachMessage record
    const outreachMessage = await db.outreachMessage.create({
      data: {
        leadId: params.leadId,
        userId: params.userId,
        channel: sendChannel,
        direction: 'outbound',
        subject: substituteTemplateVariables(params.subject || 'AI Outreach', params.variables),
        content: personalizedContent,
        status: 'draft',
        sequenceStepId: params.stepId,
        generatedByAI: true,
        metadata: JSON.stringify({
          aiGenerated: true,
          tokensUsed: result.tokensUsed,
          model: result.model,
          provider: result.provider,
        }),
      },
    });

    return { success: true, messageId: outreachMessage.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI step execution failed';
    console.error('[SequenceEngine] AI step failed:', message);
    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLE STEP EXECUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute a single step for an enrollment.
 * This is the core step execution logic.
 */
async function executeStep(params: {
  enrollment: {
    id: string;
    sequenceId: string;
    leadId: string;
    currentStep: number;
    status: string;
  };
  step: {
    id: string;
    order: number;
    channel: string;
    subject: string | null;
    template: string;
    delayDays: number;
    delayHours: number;
  };
  lead: {
    id: string;
    businessName: string | null;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    city: string | null;
    country: string | null;
    niche: string | null;
    website: string | null;
    emailStatus: string | null;
  };
  userId: string;
  variables: Record<string, string>;
}): Promise<StepExecutionResult> {
  const { enrollment, step, lead, userId, variables } = params;

  const baseResult: StepExecutionResult = {
    enrollmentId: enrollment.id,
    stepId: step.id,
    stepOrder: step.order,
    channel: step.channel,
    status: 'failed',
  };

  // Check if lead can receive on this channel
  const sendCheck = await canSendToLead(lead.id, step.channel, userId);
  if (!sendCheck.canSend) {
    console.log(`[SequenceEngine] Skipping step ${step.id} for lead ${lead.id}: ${sendCheck.reason}`);
    return { ...baseResult, status: 'skipped', error: sendCheck.reason };
  }

  // Check if lead has replied — if so, pause enrollment
  const hasReplied = await hasLeadRepliedInSequence(lead.id, enrollment.sequenceId);
  if (hasReplied) {
    console.log(`[SequenceEngine] Lead ${lead.id} has replied — pausing enrollment ${enrollment.id}`);

    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'paused' },
    });

    // Notify user about the reply
    await sendNotification({
      userId,
      type: 'workflow_step_complete',
      title: 'Sequence Paused — Lead Replied',
      message: `A lead has replied during sequence execution. The enrollment has been paused automatically.`,
      actionUrl: `/leads/${lead.id}`,
      metadata: {
        enrollmentId: enrollment.id,
        leadId: lead.id,
        sequenceId: enrollment.sequenceId,
        reason: 'lead_replied',
      },
    });

    // Update lead stage to "replied"
    await db.lead.update({
      where: { id: lead.id },
      data: { emailStatus: 'replied' },
    });

    // Log audit event
    await logAuditEvent(userId, 'lead_enriched', {
      action: 'sequence_paused_reply',
      enrollmentId: enrollment.id,
      leadId: lead.id,
      sequenceId: enrollment.sequenceId,
      stepId: step.id,
    });

    return { ...baseResult, status: 'paused', error: 'Lead replied — enrollment paused' };
  }

  // Substitute template variables
  const allVariables = buildTemplateVariables(lead, variables);
  const renderedSubject = step.subject
    ? substituteTemplateVariables(step.subject, allVariables)
    : undefined;
  const renderedBody = substituteTemplateVariables(step.template, allVariables);

  // Execute based on channel type
  let sendResult: { success: boolean; messageId?: string; error?: string };

  switch (step.channel) {
    case CHANNEL_EMAIL: {
      if (!lead.email) {
        return { ...baseResult, status: 'skipped', error: 'Lead has no email address' };
      }
      sendResult = await sendEmailStep({
        userId,
        leadId: lead.id,
        toEmail: lead.email,
        subject: renderedSubject || 'Outreach',
        body: renderedBody,
        stepId: step.id,
      });
      break;
    }

    case CHANNEL_WHATSAPP: {
      const phone = lead.whatsapp || lead.phone;
      if (!phone) {
        return { ...baseResult, status: 'skipped', error: 'Lead has no WhatsApp/phone number' };
      }
      sendResult = await sendWhatsAppStep({
        userId,
        leadId: lead.id,
        toPhone: phone,
        body: renderedBody,
        stepId: step.id,
      });
      break;
    }

    case CHANNEL_LINKEDIN: {
      sendResult = await logLinkedInStep({
        userId,
        leadId: lead.id,
        body: renderedBody,
        stepId: step.id,
        subject: renderedSubject,
      });
      break;
    }

    case CHANNEL_INSTAGRAM: {
      sendResult = await logInstagramStep({
        userId,
        leadId: lead.id,
        body: renderedBody,
        stepId: step.id,
        subject: renderedSubject,
      });
      break;
    }

    case CHANNEL_DELAY: {
      // Delay step — just advance, no message sent
      sendResult = { success: true };
      break;
    }

    case CHANNEL_AI: {
      sendResult = await executeAIStep({
        userId,
        leadId: lead.id,
        leadData: lead,
        template: step.template,
        subject: step.subject || undefined,
        channel: CHANNEL_EMAIL, // Default AI to email
        stepId: step.id,
        variables: allVariables,
      });
      break;
    }

    default: {
      sendResult = { success: false, error: `Unsupported channel: ${step.channel}` };
    }
  }

  if (!sendResult.success) {
    return {
      ...baseResult,
      status: 'failed',
      error: sendResult.error || 'Send failed',
    };
  }

  return {
    ...baseResult,
    status: 'sent',
    messageId: sendResult.messageId,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Enroll a lead in an outreach sequence.
 *
 * - Validates the sequence exists and is active
 * - Checks the lead is not already enrolled
 * - Creates a SequenceEnrollment record
 * - Sets nextStepAt (now for immediate first step, or calculated delay)
 */
export async function enrollLeadInSequence(
  input: SequenceEnrollmentInput
): Promise<{ success: boolean; enrollmentId?: string; error?: string }> {
  try {
    const { sequenceId, leadId, userId, startAt, variables } = input;

    // Validate sequence exists and is active (or draft — draft sequences can accept enrollments)
    const sequence = await db.outreachSequence.findFirst({
      where: {
        id: sequenceId,
        userId,
        status: { in: ['active', 'draft'] },
      },
      include: {
        sequenceSteps: {
          orderBy: { order: 'asc' },
          take: 1,
        },
      },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found or not active' };
    }

    if (sequence.sequenceSteps.length === 0) {
      return { success: false, error: 'Sequence has no steps defined' };
    }

    // Check if lead exists
    const lead = await db.lead.findFirst({
      where: { id: leadId, userId, isActive: true },
    });

    if (!lead) {
      return { success: false, error: 'Lead not found or inactive' };
    }

    // Check for existing active enrollment (prevent duplicates)
    const existingEnrollment = await db.sequenceEnrollment.findFirst({
      where: {
        sequenceId,
        leadId,
        status: { in: ['active', 'paused'] },
      },
    });

    if (existingEnrollment) {
      return { success: false, error: 'Lead is already enrolled in this sequence' };
    }

    // Calculate nextStepAt
    const firstStep = sequence.sequenceSteps[0];
    let nextStepAt: Date;

    if (startAt) {
      nextStepAt = startAt;
    } else if (firstStep.delayDays === 0 && firstStep.delayHours === 0) {
      // First step with no delay — execute immediately
      nextStepAt = new Date();
    } else {
      // Apply delay from first step
      const delayMs = (firstStep.delayDays * 24 * 60 + firstStep.delayHours * 60) * 60 * 1000;
      nextStepAt = new Date(Date.now() + delayMs);
    }

    // Create enrollment
    const enrollment = await db.sequenceEnrollment.create({
      data: {
        sequenceId,
        leadId,
        currentStep: 0,
        nextSendAt: nextStepAt,
        status: 'active',
      },
    });

    // If the sequence was draft, activate it
    if (sequence.status === 'draft') {
      await db.outreachSequence.update({
        where: { id: sequenceId },
        data: { status: 'active' },
      });
    }

    // Audit log
    await logAuditEvent(userId, 'lead_imported', {
      action: 'sequence_enrollment_created',
      enrollmentId: enrollment.id,
      sequenceId,
      leadId,
      nextStepAt: nextStepAt.toISOString(),
      variables: variables || {},
    });

    console.log(
      `[SequenceEngine] Lead ${leadId} enrolled in sequence ${sequenceId}, enrollment: ${enrollment.id}, nextStepAt: ${nextStepAt.toISOString()}`
    );

    return { success: true, enrollmentId: enrollment.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error enrolling lead';
    console.error('[SequenceEngine] enrollLeadInSequence failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Enroll multiple leads in a sequence.
 * Returns counts of enrolled, skipped, and errors.
 */
export async function enrollMultipleLeads(
  sequenceId: string,
  leadIds: string[],
  userId: string
): Promise<{ enrolled: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let enrolled = 0;
  let skipped = 0;

  for (const leadId of leadIds) {
    try {
      const result = await enrollLeadInSequence({
        sequenceId,
        leadId,
        userId,
      });

      if (result.success) {
        enrolled++;
      } else {
        skipped++;
        errors.push(`Lead ${leadId}: ${result.error}`);
      }
    } catch (error) {
      skipped++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Lead ${leadId}: ${message}`);
    }
  }

  // Notify user about batch enrollment
  await sendNotification({
    userId,
    type: 'workflow_step_complete',
    title: 'Batch Enrollment Complete',
    message: `Enrolled ${enrolled} leads in sequence. ${skipped} skipped.`,
    metadata: {
      sequenceId,
      enrolled,
      skipped,
      errorCount: errors.length,
    },
  });

  return { enrolled, skipped, errors };
}

/**
 * Process all pending sequence steps.
 * This is the main execution loop called by the cron API route.
 *
 * Flow:
 * 1. Find all enrollments where nextStepAt <= now AND status = 'active'
 * 2. For each enrollment, get the current step
 * 3. Execute the step (send message via appropriate channel)
 * 4. Deduct credits
 * 5. Calculate next step time or mark as completed
 * 6. Return aggregated results
 */
export async function processSequenceSteps(
  userId?: string
): Promise<SequenceExecutionResult> {
  const startTime = Date.now();
  const results: StepExecutionResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let paused = 0;
  let completed = 0;

  try {
    // Find all due enrollments
    const enrollmentWhere: Record<string, unknown> = {
      status: 'active',
      nextSendAt: { lte: new Date() },
    };

    // If userId is specified, only process that user's enrollments
    if (userId) {
      enrollmentWhere.sequence = { userId };
    }

    const dueEnrollments = await db.sequenceEnrollment.findMany({
      where: enrollmentWhere,
      include: {
        sequence: {
          include: {
            sequenceSteps: { orderBy: { order: 'asc' } },
          },
        },
        lead: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            email: true,
            phone: true,
            whatsapp: true,
            city: true,
            country: true,
            niche: true,
            website: true,
            emailStatus: true,
            isActive: true,
          },
        },
      },
      take: 100, // Process max 100 per run to avoid overloading
    });

    console.log(`[SequenceEngine] Processing ${dueEnrollments.length} due enrollments`);

    for (const enrollment of dueEnrollments) {
      try {
        const { sequence, lead } = enrollment;

        // Skip if sequence is not active
        if (sequence.status !== 'active') {
          console.log(
            `[SequenceEngine] Skipping enrollment ${enrollment.id} — sequence status is ${sequence.status}`
          );
          continue;
        }

        // Skip if lead is inactive
        if (!lead.isActive) {
          console.log(
            `[SequenceEngine] Skipping enrollment ${enrollment.id} — lead ${lead.id} is inactive`
          );

          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'paused' },
          });

          const result: StepExecutionResult = {
            enrollmentId: enrollment.id,
            stepId: '',
            stepOrder: enrollment.currentStep,
            channel: '',
            status: 'skipped',
            error: 'Lead is inactive',
          };
          results.push(result);
          skipped++;
          continue;
        }

        // Get the current step
        const steps = sequence.sequenceSteps;
        const currentStepIndex = enrollment.currentStep;

        if (currentStepIndex >= steps.length) {
          // No more steps — mark as completed
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'completed',
              nextSendAt: null,
            },
          });

          completed++;
          console.log(
            `[SequenceEngine] Enrollment ${enrollment.id} completed — all steps executed`
          );
          continue;
        }

        const currentStep = steps[currentStepIndex];

        // Deduct credit for step execution
        const creditResult = await deductCredits({
          userId: sequence.userId,
          action: CREDIT_ACTION,
          cost: STEP_CREDIT_COST,
          referenceId: `seq_${enrollment.id}_step_${currentStep.id}`,
        });

        if (!creditResult.success) {
          console.warn(
            `[SequenceEngine] Credit deduction failed for enrollment ${enrollment.id}: ${creditResult.error}`
          );

          // Pause the enrollment if credits are insufficient
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'paused' },
          });

          // Notify user
          await sendNotification({
            userId: sequence.userId,
            type: 'workflow_step_failed',
            title: 'Sequence Paused — Insufficient Credits',
            message: `Enrollment in "${sequence.name}" has been paused because you have insufficient credits. Add credits to resume.`,
            actionUrl: '/settings/billing',
            metadata: {
              enrollmentId: enrollment.id,
              sequenceId: sequence.id,
              stepId: currentStep.id,
              creditBalance: creditResult.newBalance,
            },
          });

          const result: StepExecutionResult = {
            enrollmentId: enrollment.id,
            stepId: currentStep.id,
            stepOrder: currentStep.order,
            channel: currentStep.channel,
            status: 'paused',
            error: creditResult.error,
          };
          results.push(result);
          paused++;
          continue;
        }

        // Execute the step
        const stepResult = await executeStep({
          enrollment: {
            id: enrollment.id,
            sequenceId: enrollment.sequenceId,
            leadId: enrollment.leadId,
            currentStep: enrollment.currentStep,
            status: enrollment.status,
          },
          step: currentStep,
          lead: lead,
          userId: sequence.userId,
          variables: {}, // Enrollment doesn't store variables in current schema
        });

        results.push(stepResult);

        // Update enrollment based on result
        if (stepResult.status === 'paused') {
          paused++;
          continue;
        }

        if (stepResult.status === 'skipped') {
          skipped++;

          // Even if skipped, advance to the next step
          const nextStepIndex = currentStepIndex + 1;

          if (nextStepIndex >= steps.length) {
            // No more steps
            await db.sequenceEnrollment.update({
              where: { id: enrollment.id },
              data: {
                status: 'completed',
                nextSendAt: null,
              },
            });
            completed++;
          } else {
            // Calculate next step time
            const nextStep = steps[nextStepIndex];
            const delayMs =
              (nextStep.delayDays * 24 * 60 + nextStep.delayHours * 60) * 60 * 1000;
            const nextStepAt = new Date(Date.now() + delayMs);

            await db.sequenceEnrollment.update({
              where: { id: enrollment.id },
              data: {
                currentStep: nextStepIndex,
                nextSendAt: nextStepAt,
              },
            });

            stepResult.nextStepAt = nextStepAt;
          }
          continue;
        }

        if (stepResult.status === 'failed') {
          failed++;

          // Still advance to next step on failure (don't block the sequence)
          const nextStepIndex = currentStepIndex + 1;

          if (nextStepIndex >= steps.length) {
            await db.sequenceEnrollment.update({
              where: { id: enrollment.id },
              data: {
                status: 'completed',
                nextSendAt: null,
              },
            });
            completed++;
          } else {
            const nextStep = steps[nextStepIndex];
            const delayMs =
              (nextStep.delayDays * 24 * 60 + nextStep.delayHours * 60) * 60 * 1000;
            const nextStepAt = new Date(Date.now() + delayMs);

            await db.sequenceEnrollment.update({
              where: { id: enrollment.id },
              data: {
                currentStep: nextStepIndex,
                nextSendAt: nextStepAt,
              },
            });

            stepResult.nextStepAt = nextStepAt;
          }
          continue;
        }

        // Step was sent successfully
        sent++;

        // Advance to next step
        const nextStepIndex = currentStepIndex + 1;

        if (nextStepIndex >= steps.length) {
          // No more steps — mark as completed
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'completed',
              nextSendAt: null,
            },
          });
          completed++;

          // Notify user
          await sendNotification({
            userId: sequence.userId,
            type: 'workflow_execution_complete',
            title: 'Sequence Completed',
            message: `Lead has completed all steps in "${sequence.name}".`,
            actionUrl: `/leads/${lead.id}`,
            metadata: {
              enrollmentId: enrollment.id,
              sequenceId: sequence.id,
              leadId: lead.id,
            },
          });
        } else {
          // Calculate next step time
          const nextStep = steps[nextStepIndex];
          const delayMs =
            (nextStep.delayDays * 24 * 60 + nextStep.delayHours * 60) * 60 * 1000;
          const nextStepAt = new Date(Date.now() + delayMs);

          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStep: nextStepIndex,
              nextSendAt: nextStepAt,
            },
          });

          stepResult.nextStepAt = nextStepAt;
        }

        // Audit log for successful step
        await logAuditEvent(sequence.userId, 'lead_enriched', {
          action: 'sequence_step_executed',
          enrollmentId: enrollment.id,
          sequenceId: sequence.id,
          stepId: currentStep.id,
          stepOrder: currentStep.order,
          channel: currentStep.channel,
          leadId: lead.id,
          status: stepResult.status,
          messageId: stepResult.messageId,
        });
      } catch (enrollmentError) {
        const message =
          enrollmentError instanceof Error ? enrollmentError.message : 'Unknown error';
        console.error(
          `[SequenceEngine] Error processing enrollment ${enrollment.id}:`,
          message
        );

        results.push({
          enrollmentId: enrollment.id,
          stepId: '',
          stepOrder: enrollment.currentStep,
          channel: '',
          status: 'failed',
          error: message,
        });
        failed++;
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[SequenceEngine] Processing complete: ${sent} sent, ${skipped} skipped, ${failed} failed, ${paused} paused, ${completed} completed in ${durationMs}ms`
    );

    return {
      totalProcessed: dueEnrollments.length,
      sent,
      skipped,
      failed,
      paused,
      completed,
      results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error in processSequenceSteps';
    console.error('[SequenceEngine] Fatal error:', message);

    return {
      totalProcessed: results.length,
      sent,
      skipped,
      failed,
      paused,
      completed,
      results,
    };
  }
}

/**
 * Pause an enrollment.
 * The sequence will stop sending steps to this lead until resumed.
 */
export async function pauseEnrollment(
  enrollmentId: string,
  userId: string,
  reason?: string
): Promise<void> {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { sequence: true },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    // Verify ownership
    if (enrollment.sequence.userId !== userId) {
      throw new Error('Not authorized to modify this enrollment');
    }

    if (enrollment.status !== 'active') {
      throw new Error(`Cannot pause enrollment with status: ${enrollment.status}`);
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'paused' },
    });

    await logAuditEvent(userId, 'lead_updated', {
      action: 'sequence_enrollment_paused',
      enrollmentId,
      sequenceId: enrollment.sequenceId,
      leadId: enrollment.leadId,
      reason: reason || 'manual_pause',
    });

    console.log(
      `[SequenceEngine] Enrollment ${enrollmentId} paused${reason ? ` — reason: ${reason}` : ''}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause enrollment';
    console.error('[SequenceEngine] pauseEnrollment failed:', message);
    throw new Error(message);
  }
}

/**
 * Resume a paused enrollment.
 * The next step will be scheduled based on the current step's delay.
 */
export async function resumeEnrollment(
  enrollmentId: string,
  userId: string
): Promise<void> {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: {
        sequence: {
          include: {
            sequenceSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    // Verify ownership
    if (enrollment.sequence.userId !== userId) {
      throw new Error('Not authorized to modify this enrollment');
    }

    if (enrollment.status !== 'paused') {
      throw new Error(`Cannot resume enrollment with status: ${enrollment.status}`);
    }

    // Calculate next step time for the current step
    const steps = enrollment.sequence.sequenceSteps;
    const currentStepIndex = enrollment.currentStep;

    let nextStepAt: Date;
    if (currentStepIndex < steps.length) {
      const currentStep = steps[currentStepIndex];
      const delayMs =
        (currentStep.delayDays * 24 * 60 + currentStep.delayHours * 60) * 60 * 1000;
      // For resume, use a shorter delay (1 hour) since we're resuming, not starting fresh
      // Unless the step delay is 0, in which case execute immediately
      if (currentStep.delayDays === 0 && currentStep.delayHours === 0) {
        nextStepAt = new Date();
      } else {
        // Use the step's delay from now
        nextStepAt = new Date(Date.now() + delayMs);
      }
    } else {
      // No more steps — mark as completed instead
      await db.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'completed', nextSendAt: null },
      });
      return;
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'active',
        nextSendAt: nextStepAt,
      },
    });

    await logAuditEvent(userId, 'lead_updated', {
      action: 'sequence_enrollment_resumed',
      enrollmentId,
      sequenceId: enrollment.sequenceId,
      leadId: enrollment.leadId,
      nextStepAt: nextStepAt.toISOString(),
    });

    console.log(
      `[SequenceEngine] Enrollment ${enrollmentId} resumed, nextStepAt: ${nextStepAt.toISOString()}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume enrollment';
    console.error('[SequenceEngine] resumeEnrollment failed:', message);
    throw new Error(message);
  }
}

/**
 * Unenroll a lead from a sequence.
 * Marks the enrollment as opted_out and cancels future steps.
 */
export async function unenrollLead(
  enrollmentId: string,
  userId: string,
  reason?: string
): Promise<void> {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { sequence: true },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    // Verify ownership
    if (enrollment.sequence.userId !== userId) {
      throw new Error('Not authorized to modify this enrollment');
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'opted_out',
        nextSendAt: null,
      },
    });

    await logAuditEvent(userId, 'lead_updated', {
      action: 'sequence_enrollment_unenrolled',
      enrollmentId,
      sequenceId: enrollment.sequenceId,
      leadId: enrollment.leadId,
      reason: reason || 'manual_unenroll',
    });

    console.log(
      `[SequenceEngine] Lead unenrolled from enrollment ${enrollmentId}${reason ? ` — reason: ${reason}` : ''}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unenroll lead';
    console.error('[SequenceEngine] unenrollLead failed:', message);
    throw new Error(message);
  }
}

/**
 * Handle a lead reply during a sequence.
 * Called by the reply intelligence system when a lead replies.
 *
 * - Pauses the enrollment
 * - Updates lead stage
 * - Triggers notification
 * - Creates Communication record
 */
export async function handleSequenceReply(params: {
  leadId: string;
  channel: string;
  content: string;
  userId: string;
}): Promise<void> {
  try {
    const { leadId, channel, content, userId } = params;

    // Find all active enrollments for this lead
    const activeEnrollments = await db.sequenceEnrollment.findMany({
      where: {
        leadId,
        status: 'active',
      },
      include: {
        sequence: true,
      },
    });

    if (activeEnrollments.length === 0) {
      return; // No active enrollments to pause
    }

    for (const enrollment of activeEnrollments) {
      // Pause the enrollment
      await db.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'paused' },
      });

      // Audit log
      await logAuditEvent(userId, 'lead_updated', {
        action: 'sequence_enrollment_paused_reply',
        enrollmentId: enrollment.id,
        sequenceId: enrollment.sequenceId,
        leadId,
        channel,
      });
    }

    // Update lead stage to "replied"
    await db.lead.update({
      where: { id: leadId },
      data: {
        emailStatus: 'replied',
        lastContactedAt: new Date(),
      },
    });

    // Create Communication record
    await db.communication.create({
      data: {
        leadId,
        channel,
        direction: 'inbound',
        content,
        intent: 'positive', // Will be refined by reply intelligence
      },
    });

    // Notify user
    await sendNotification({
      userId,
      type: 'workflow_step_complete',
      title: 'Lead Replied During Sequence',
      message: `A lead has replied during sequence execution. ${activeEnrollments.length} enrollment(s) paused automatically. Review the reply and decide next steps.`,
      actionUrl: `/leads/${leadId}`,
      metadata: {
        leadId,
        channel,
        enrollmentCount: activeEnrollments.length,
        enrollmentIds: activeEnrollments.map((e) => e.id),
      },
    });

    console.log(
      `[SequenceEngine] Handled reply for lead ${leadId} on ${channel} — ${activeEnrollments.length} enrollment(s) paused`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to handle sequence reply';
    console.error('[SequenceEngine] handleSequenceReply failed:', message);
    // Don't throw — this is called as a side effect
  }
}

/**
 * Get analytics for a specific sequence.
 *
 * Tracks:
 * - Open rates, reply rates, bounce rates per step
 * - Enrollment completion rates
 * - Best performing steps/sequences
 */
export async function getSequenceAnalytics(
  sequenceId: string,
  userId: string
): Promise<SequenceAnalyticsResult> {
  try {
    // Verify sequence exists and belongs to user
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
        enrollments: true,
      },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    // Enrollment counts
    const totalEnrollments = sequence.enrollments.length;
    const activeEnrollments = sequence.enrollments.filter((e) => e.status === 'active').length;
    const completedEnrollments = sequence.enrollments.filter((e) => e.status === 'completed').length;
    const pausedEnrollments = sequence.enrollments.filter((e) => e.status === 'paused').length;
    const optedOutEnrollments = sequence.enrollments.filter((e) => e.status === 'opted_out').length;
    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100)
      : 0;

    // Get all outreach messages for this sequence's steps
    const stepIds = sequence.sequenceSteps.map((s) => s.id);

    const allMessages = stepIds.length > 0
      ? await db.outreachMessage.findMany({
          where: {
            sequenceStepId: { in: stepIds },
          },
          select: {
            id: true,
            sequenceStepId: true,
            channel: true,
            status: true,
            openedAt: true,
            repliedAt: true,
            bouncedAt: true,
          },
        })
      : [];

    // Overall stats
    const totalMessagesSent = allMessages.filter(
      (m) => ['sent', 'delivered', 'opened', 'replied'].includes(m.status)
    ).length;
    const totalOpens = allMessages.filter((m) => m.openedAt !== null).length;
    const totalReplies = allMessages.filter(
      (m) => m.status === 'replied' || m.repliedAt !== null
    ).length;
    const totalBounces = allMessages.filter(
      (m) => m.status === 'bounced' || m.bouncedAt !== null
    ).length;

    const overallOpenRate = totalMessagesSent > 0
      ? Math.round((totalOpens / totalMessagesSent) * 100)
      : 0;
    const overallReplyRate = totalMessagesSent > 0
      ? Math.round((totalReplies / totalMessagesSent) * 100)
      : 0;
    const overallBounceRate = totalMessagesSent > 0
      ? Math.round((totalBounces / totalMessagesSent) * 100)
      : 0;

    // Per-step analytics
    const stepAnalytics: SequenceAnalyticsStepResult[] = sequence.sequenceSteps.map((step) => {
      const stepMessages = allMessages.filter((m) => m.sequenceStepId === step.id);
      const stepSent = stepMessages.filter(
        (m) => ['sent', 'delivered', 'opened', 'replied'].includes(m.status)
      ).length;
      const stepOpened = stepMessages.filter((m) => m.openedAt !== null).length;
      const stepReplied = stepMessages.filter(
        (m) => m.status === 'replied' || m.repliedAt !== null
      ).length;
      const stepBounced = stepMessages.filter(
        (m) => m.status === 'bounced' || m.bouncedAt !== null
      ).length;

      return {
        stepOrder: step.order,
        stepId: step.id,
        channel: step.channel,
        totalSent: stepSent,
        totalOpened: stepOpened,
        totalReplied: stepReplied,
        totalBounced: stepBounced,
        openRate: stepSent > 0 ? Math.round((stepOpened / stepSent) * 100) : 0,
        replyRate: stepSent > 0 ? Math.round((stepReplied / stepSent) * 100) : 0,
        bounceRate: stepSent > 0 ? Math.round((stepBounced / stepSent) * 100) : 0,
      };
    });

    return {
      sequenceId,
      sequenceName: sequence.name,
      status: sequence.status,
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      pausedEnrollments,
      optedOutEnrollments,
      completionRate,
      totalMessagesSent,
      totalOpens,
      totalReplies,
      totalBounces,
      overallOpenRate,
      overallReplyRate,
      overallBounceRate,
      steps: stepAnalytics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get sequence analytics';
    console.error('[SequenceEngine] getSequenceAnalytics failed:', message);
    throw new Error(message);
  }
}
