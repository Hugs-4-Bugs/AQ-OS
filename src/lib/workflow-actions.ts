// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Action Execution Engine
// Phase 12: Execute each action type using existing services
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { resolveLeadForExecution } from '@/lib/lead-resolution';
import { sendEmail } from '@/lib/email';
import { moveLeadToStage } from '@/lib/pipeline-service';

// ===== TYPES =====

export interface ActionContext {
  userId: string;
  workflowId: string;
  executionId: string;
  leadId?: string;
  triggerData?: Record<string, unknown>;
  previousOutputs?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  creditsUsed?: number;
}

// ===== ACTION EXECUTOR =====

/**
 * Execute a workflow action based on its type and config.
 * Uses existing services where possible.
 */
export async function executeAction(
  actionType: string,
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  try {
    switch (actionType) {
      case 'send_email':
        return await executeSendEmail(config, context);
      case 'create_gmail_draft':
        return await executeCreateGmailDraft(config, context);
      case 'send_telegram':
        return await executeSendTelegram(config, context);
      case 'send_whatsapp':
        return await executeSendWhatsapp(config, context);
      case 'ai_analysis':
        return await executeAiAnalysis(config, context);
      case 'ai_outreach':
        return await executeAiOutreach(config, context);
      case 'move_lead_stage':
        return await executeMoveLeadStage(config, context);
      case 'update_tags':
        return await executeUpdateTags(config, context);
      case 'create_notification':
        return await executeCreateNotification(config, context);
      case 'wait_delay':
        return await executeWaitDelay(config, context);
      case 'conditional_branch':
        return await executeConditionalBranch(config, context);
      case 'webhook_call':
        return await executeWebhookCall(config, context);
      case 'export_data':
        return await executeExportData(config, context);
      case 'score_lead':
        return await executeScoreLead(config, context);
      case 'add_note':
        return await executeAddNote(config, context);
      case 'notify_low_credits':
        return await executeNotifyLowCredits(config, context);
      case 'notify_trial_ending':
        return await executeNotifyTrialEnding(config, context);
      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Action execution failed',
    };
  }
}

// ===== ACTION IMPLEMENTATIONS =====

async function executeSendEmail(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { to, subject, body } = config;

  if (!to || !subject || !body) {
    return { success: false, error: 'Email requires to, subject, and body' };
  }

  // Resolve template variables in subject/body
  const resolvedSubject = resolveTemplate(String(subject), context);
  const resolvedBody = resolveTemplate(String(body), context);

  const result = await sendEmail({
    to: String(to),
    subject: resolvedSubject,
    html: resolvedBody,
    text: resolvedBody,
  });

  return {
    success: result.sent,
    output: { messageId: result.messageId, devMode: result.devMode },
    error: result.error,
    creditsUsed: 2,
  };
}

async function executeCreateGmailDraft(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { to, subject, body } = config;

  if (!to || !subject || !body) {
    return { success: false, error: 'Gmail draft requires to, subject, and body' };
  }

  // Check if user has a connected Gmail account
  const emailAccount = await db.emailAccount.findFirst({
    where: { userId: context.userId, status: 'active' },
  });

  if (!emailAccount) {
    return { success: false, error: 'No active Gmail account connected' };
  }

  // In production, this would call the Gmail API to create a draft
  // For now, create an outreach message as draft
  const message = await db.outreachMessage.create({
    data: {
      leadId: context.leadId || '',
      userId: context.userId,
      channel: 'email',
      direction: 'outbound',
      subject: resolveTemplate(String(subject), context),
      content: resolveTemplate(String(body), context),
      status: 'draft',
      generatedByAI: false,
    },
  });

  return {
    success: true,
    output: { draftId: message.id, to: String(to) },
    creditsUsed: 2,
  };
}

async function executeSendTelegram(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { message, chatId } = config;

  if (!message) {
    return { success: false, error: 'Telegram action requires a message' };
  }

  // Check if user has Telegram configured
  const telegramConfig = await db.telegramConfig.findFirst({
    where: { userId: context.userId, isConnected: true },
  });

  if (!telegramConfig) {
    return { success: false, error: 'Telegram not connected' };
  }

  // In production, this would send via Telegram Bot API
  // Create an outreach message record
  if (context.leadId) {
    await db.outreachMessage.create({
      data: {
        leadId: context.leadId,
        userId: context.userId,
        channel: 'telegram',
        direction: 'outbound',
        content: resolveTemplate(String(message), context),
        status: 'sent',
        generatedByAI: false,
        metadata: JSON.stringify({ chatId: chatId || telegramConfig.chatId }),
      },
    });
  }

  return {
    success: true,
    output: { chatId: chatId || telegramConfig.chatId },
    creditsUsed: 2,
  };
}

async function executeSendWhatsapp(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { message, phoneNumber } = config;

  if (!message) {
    return { success: false, error: 'WhatsApp action requires a message' };
  }

  // Check if user has WhatsApp configured
  const whatsappConfig = await db.whatsappConfig.findFirst({
    where: { userId: context.userId, isConnected: true },
  });

  if (!whatsappConfig) {
    return { success: false, error: 'WhatsApp not connected' };
  }

  // Create outreach message record
  if (context.leadId) {
    await db.outreachMessage.create({
      data: {
        leadId: context.leadId,
        userId: context.userId,
        channel: 'whatsapp',
        direction: 'outbound',
        content: resolveTemplate(String(message), context),
        status: 'sent',
        generatedByAI: false,
        metadata: JSON.stringify({ phoneNumber: phoneNumber || '' }),
      },
    });
  }

  return {
    success: true,
    output: { phoneNumber: phoneNumber || '' },
    creditsUsed: 2,
  };
}

async function executeAiAnalysis(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { prompt, model } = config;

  if (!context.leadId) {
    return { success: false, error: 'AI analysis requires a lead context' };
  }

  try {
    const chat = await createZaiChat();

    const resolution = await resolveLeadForExecution(context.userId, context.leadId, {
      include: { leadAnalysis: true },
    });
    if (!resolution.ok) {
      return { success: false, error: 'Lead not found for AI analysis' };
    }
    const lead = resolution.lead;

    const analysisPrompt = prompt
      ? resolveTemplate(String(prompt), context)
      : `Analyze this lead for sales potential: ${lead.businessName}. 
         Current stage: ${lead.stage}. Reply score: ${lead.replyScore}. 
         Conversion score: ${lead.conversionScore}. Urgency: ${lead.urgencyScore}.
         Provide a brief analysis and recommendations.`;

    const response = await chat.sendMessage(analysisPrompt);

    return {
      success: true,
      output: {
        analysis: response.text || response.content || '',
        leadId: context.leadId,
        model: model || 'default',
      },
      creditsUsed: 5,
    };
  } catch (error) {
    return {
      success: false,
      error: `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function executeAiOutreach(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { channel, style, tone } = config;

  if (!context.leadId) {
    return { success: false, error: 'AI outreach requires a lead context' };
  }

  try {
    const chat = await createZaiChat();

    const resolution = await resolveLeadForExecution(context.userId, context.leadId);
    if (!resolution.ok) {
      return { success: false, error: 'Lead not found for AI outreach' };
    }
    const lead = resolution.lead;

    const outreachChannel = String(channel || 'email');
    const outreachStyle = style || 'professional';
    const outreachTone = tone || 'friendly';

    const prompt = `Generate a ${outreachStyle} ${outreachChannel} outreach message for:
      Business: ${lead.businessName}
      Owner: ${lead.ownerName || 'Unknown'}
      Niche: ${lead.niche || 'Unknown'}
      City: ${lead.city || 'Unknown'}
      Tone: ${outreachTone}
      
      Create a compelling, personalized message that addresses their potential needs.`;

    const response = await chat.sendMessage(prompt);
    const generatedMessage = response.text || response.content || '';

    // Create outreach message record
    const message = await db.outreachMessage.create({
      data: {
        leadId: context.leadId,
        userId: context.userId,
        channel: outreachChannel,
        direction: 'outbound',
        subject: outreachChannel === 'email' ? `Re: ${lead.businessName}` : null,
        content: generatedMessage,
        status: 'draft',
        generatedByAI: true,
      },
    });

    return {
      success: true,
      output: {
        messageId: message.id,
        channel: outreachChannel,
        generatedMessage,
      },
      creditsUsed: 5,
    };
  } catch (error) {
    return {
      success: false,
      error: `AI outreach failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function executeMoveLeadStage(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { targetStage } = config;

  if (!context.leadId) {
    return { success: false, error: 'Move lead stage requires a lead context' };
  }

  if (!targetStage) {
    return { success: false, error: 'Target stage is required' };
  }

  const result = await moveLeadToStage(
    context.leadId,
    String(targetStage),
    context.userId
  );

  return {
    success: result.success,
    output: {
      leadId: result.leadId,
      fromStage: result.fromStage,
      toStage: result.toStage,
    },
    error: result.error,
    creditsUsed: 1,
  };
}

async function executeUpdateTags(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { tags, action } = config;

  if (!context.leadId) {
    return { success: false, error: 'Update tags requires a lead context' };
  }

  if (!tags || !Array.isArray(tags)) {
    return { success: false, error: 'Tags array is required' };
  }

  const tagsResolution = await resolveLeadForExecution(context.userId, context.leadId, {
    select: { tags: true },
  });

  if (!tagsResolution.ok) {
    return { success: false, error: 'Lead not found' };
  }
  const lead = tagsResolution.lead;

  let currentTags: string[] = [];
  try {
    currentTags = JSON.parse(lead.tags || '[]');
  } catch {
    currentTags = [];
  }

  const tagAction = action || 'add';
  let newTags: string[];

  if (tagAction === 'add') {
    newTags = [...new Set([...currentTags, ...tags.map(String)])];
  } else if (tagAction === 'remove') {
    newTags = currentTags.filter(t => !tags.map(String).includes(t));
  } else {
    newTags = tags.map(String);
  }

  await db.lead.update({
    where: { id: context.leadId },
    data: { tags: JSON.stringify(newTags) },
  });

  return {
    success: true,
    output: { previousTags: currentTags, newTags, action: tagAction },
    creditsUsed: 1,
  };
}

async function executeCreateNotification(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { title, message, type, actionUrl } = config;

  if (!title || !message) {
    return { success: false, error: 'Notification requires title and message' };
  }

  const notification = await db.notification.create({
    data: {
      userId: context.userId,
      type: String(type || 'workflow'),
      title: resolveTemplate(String(title), context),
      message: resolveTemplate(String(message), context),
      actionUrl: actionUrl ? String(actionUrl) : null,
      deliveredVia: 'in_app',
    },
  });

  return {
    success: true,
    output: { notificationId: notification.id },
    creditsUsed: 1,
  };
}

async function executeWaitDelay(
  config: Record<string, unknown>,
  _context: ActionContext
): Promise<ActionResult> {
  const { duration, unit } = config;

  if (!duration) {
    return { success: false, error: 'Delay requires a duration' };
  }

  const durationNum = Number(duration);
  const delayUnit = String(unit || 'minutes');

  // Convert to milliseconds
  let delayMs: number;
  switch (delayUnit) {
    case 'seconds': delayMs = durationNum * 1000; break;
    case 'minutes': delayMs = durationNum * 60 * 1000; break;
    case 'hours': delayMs = durationNum * 60 * 60 * 1000; break;
    case 'days': delayMs = durationNum * 24 * 60 * 60 * 1000; break;
    default: delayMs = durationNum * 60 * 1000; break;
  }

  return {
    success: true,
    output: { delayMs, duration: durationNum, unit: delayUnit },
    creditsUsed: 0,
  };
}

async function executeConditionalBranch(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { field, operator, value, trueBranch, falseBranch } = config;

  if (!field || !operator) {
    return { success: false, error: 'Conditional branch requires field and operator' };
  }

  // Get the field value from context
  let fieldValue: unknown;
  if (field === 'leadStage' && context.leadId) {
    const lead = await db.lead.findUnique({
      where: { id: context.leadId },
      select: { stage: true },
    });
    fieldValue = lead?.stage;
  } else if (field === 'leadScore' && context.leadId) {
    const lead = await db.lead.findUnique({
      where: { id: context.leadId },
      select: { conversionScore: true },
    });
    fieldValue = lead?.conversionScore;
  } else if (field === 'triggerData') {
    fieldValue = context.triggerData?.[String(field)];
  } else if (context.previousOutputs) {
    fieldValue = context.previousOutputs[String(field)];
  } else {
    fieldValue = context.triggerData?.[String(field)];
  }

  // Evaluate condition
  let conditionMet = false;
  const compareValue = value;

  switch (operator) {
    case 'eq': case '==': conditionMet = fieldValue == compareValue; break;
    case 'neq': case '!=': conditionMet = fieldValue != compareValue; break;
    case 'gt': case '>': conditionMet = Number(fieldValue) > Number(compareValue); break;
    case 'gte': case '>=': conditionMet = Number(fieldValue) >= Number(compareValue); break;
    case 'lt': case '<': conditionMet = Number(fieldValue) < Number(compareValue); break;
    case 'lte': case '<=': conditionMet = Number(fieldValue) <= Number(compareValue); break;
    case 'contains': conditionMet = String(fieldValue).includes(String(compareValue)); break;
    case 'not_contains': conditionMet = !String(fieldValue).includes(String(compareValue)); break;
    case 'in': conditionMet = String(compareValue).split(',').map(s => s.trim()).includes(String(fieldValue)); break;
    case 'not_in': conditionMet = !String(compareValue).split(',').map(s => s.trim()).includes(String(fieldValue)); break;
    default: conditionMet = false;
  }

  return {
    success: true,
    output: {
      conditionMet,
      branch: conditionMet ? (trueBranch || 'true') : (falseBranch || 'false'),
      fieldValue,
      operator,
      compareValue,
    },
    creditsUsed: 0,
  };
}

async function executeWebhookCall(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { url, method, headers, body } = config;

  if (!url) {
    return { success: false, error: 'Webhook requires a URL' };
  }

  try {
    const response = await fetch(String(url), {
      method: String(method || 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string> || {}),
      },
      body: body ? JSON.stringify({
        ...((typeof body === 'object' ? body : {}) as Record<string, unknown>),
        workflowId: context.workflowId,
        executionId: context.executionId,
        leadId: context.leadId,
        triggerData: context.triggerData,
      }) : JSON.stringify({
        workflowId: context.workflowId,
        executionId: context.executionId,
        leadId: context.leadId,
        triggerData: context.triggerData,
      }),
    });

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    return {
      success: response.ok,
      output: {
        statusCode: response.status,
        body: responseBody,
      },
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
      creditsUsed: 1,
    };
  } catch (error) {
    return {
      success: false,
      error: `Webhook call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function executeExportData(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { format, dataType, filters } = config;

  if (!dataType) {
    return { success: false, error: 'Export requires a data type' };
  }

  // For now, create a data export record
  const exportRecord = await db.dataExport.create({
    data: {
      userId: context.userId,
      type: String(format || 'csv'),
      status: 'pending',
    },
  });

  return {
    success: true,
    output: {
      exportId: exportRecord.id,
      format: format || 'csv',
      dataType,
    },
    creditsUsed: 3,
  };
}

async function executeScoreLead(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  if (!context.leadId) {
    return { success: false, error: 'Score lead requires a lead context' };
  }

  try {
    const chat = await createZaiChat();

    const resolution = await resolveLeadForExecution(context.userId, context.leadId);
    if (!resolution.ok) {
      return { success: false, error: 'Lead not found' };
    }
    const lead = resolution.lead;

    const prompt = `Score this lead on a scale of 0-100 for sales conversion potential:
      Business: ${lead.businessName}
      Niche: ${lead.niche || 'Unknown'}
      Current stage: ${lead.stage}
      Reply score: ${lead.replyScore}
      Conversion score: ${lead.conversionScore}
      
      Return ONLY a number between 0-100.`;

    const response = await chat.sendMessage(prompt);
    const scoreText = (response.text || response.content || '0').trim();
    const score = Math.min(100, Math.max(0, parseInt(scoreText.replace(/[^0-9]/g, ''), 10) || 0));

    // Update lead scores
    await db.lead.update({
      where: { id: context.leadId },
      data: { conversionScore: score },
    });

    // Create score record
    await db.leadScore.create({
      data: {
        leadId: context.leadId,
        scoreType: 'conversion',
        score,
        explanation: scoreText,
      },
    });

    return {
      success: true,
      output: { leadId: context.leadId, score, explanation: scoreText },
      creditsUsed: 5,
    };
  } catch (error) {
    return {
      success: false,
      error: `Score lead failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function executeAddNote(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { content, pinned } = config;

  if (!context.leadId) {
    return { success: false, error: 'Add note requires a lead context' };
  }

  if (!content) {
    return { success: false, error: 'Note content is required' };
  }

  const note = await db.leadNote.create({
    data: {
      leadId: context.leadId,
      userId: context.userId,
      content: resolveTemplate(String(content), context),
      pinned: Boolean(pinned),
    },
  });

  return {
    success: true,
    output: { noteId: note.id },
    creditsUsed: 1,
  };
}

async function executeNotifyLowCredits(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: { credits: true, name: true, email: true },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  const threshold = Number(config.threshold) || 10;

  if (user.credits > threshold) {
    return {
      success: true,
      output: { skipped: true, reason: `Credits (${user.credits}) above threshold (${threshold})` },
      creditsUsed: 0,
    };
  }

  // Create notification
  await db.notification.create({
    data: {
      userId: context.userId,
      type: 'credit_low',
      title: 'Low Credit Warning',
      message: `You have ${user.credits} credits remaining. Consider upgrading your plan or purchasing additional credits.`,
      deliveredVia: 'in_app',
      metadata: JSON.stringify({ credits: user.credits, threshold }),
    },
  });

  // Also send email if configured
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: 'Low Credit Warning — AcquisitionOS',
      html: `<p>Hi ${user.name || 'there'},</p><p>You have <strong>${user.credits}</strong> credits remaining.</p>`,
      text: `Hi ${user.name || 'there'}, You have ${user.credits} credits remaining.`,
    });
  }

  return {
    success: true,
    output: { credits: user.credits, threshold },
    creditsUsed: 0,
  };
}

async function executeNotifyTrialEnding(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: { isTrial: true, trialEndsAt: true, name: true, email: true, plan: true },
  });

  if (!user || !user.isTrial || !user.trialEndsAt) {
    return {
      success: true,
      output: { skipped: true, reason: 'Not on trial or no trial end date' },
      creditsUsed: 0,
    };
  }

  const daysUntilExpiry = Math.ceil(
    (user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const notifyThreshold = Number(config.daysThreshold) || 3;

  if (daysUntilExpiry > notifyThreshold) {
    return {
      success: true,
      output: { skipped: true, reason: `Trial ends in ${daysUntilExpiry} days (threshold: ${notifyThreshold})` },
      creditsUsed: 0,
    };
  }

  // Create notification
  await db.notification.create({
    data: {
      userId: context.userId,
      type: 'trial_ending',
      title: 'Trial Ending Soon',
      message: `Your ${user.plan} plan trial ends in ${daysUntilExpiry} day(s). Upgrade to keep access to all features.`,
      deliveredVia: 'in_app',
      metadata: JSON.stringify({ daysUntilExpiry, trialEndsAt: user.trialEndsAt }),
    },
  });

  return {
    success: true,
    output: { daysUntilExpiry, trialEndsAt: user.trialEndsAt },
    creditsUsed: 0,
  };
}

// ===== TEMPLATE VARIABLE RESOLVER =====

function resolveTemplate(template: string, context: ActionContext): string {
  let resolved = template;

  // Replace common variables
  const replacements: Record<string, string> = {
    '{{leadId}}': context.leadId || '',
    '{{workflowId}}': context.workflowId,
    '{{executionId}}': context.executionId,
    '{{userId}}': context.userId,
  };

  // Add trigger data variables
  if (context.triggerData) {
    for (const [key, value] of Object.entries(context.triggerData)) {
      replacements[`{{trigger.${key}}}`] = String(value ?? '');
    }
  }

  // Add previous output variables
  if (context.previousOutputs) {
    for (const [key, value] of Object.entries(context.previousOutputs)) {
      replacements[`{{output.${key}}}`] = String(value ?? '');
    }
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    resolved = resolved.replace(new RegExp(escapeRegExp(placeholder), 'g'), value);
  }

  return resolved;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Local adapter ─────────────────────────────────────────────────
// The z-ai-web-dev-sdk package does not export `createChat`; emulate the
// chat.sendMessage() interface used above via ZAI.create().

async function createZaiChat(): Promise<{
  sendMessage: (prompt: string) => Promise<{ text?: string; content?: string }>;
}> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  return {
    sendMessage: async (prompt: string) => {
      const completion = (await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
      })) as { choices?: Array<{ message?: { content?: string } }> };
      const text = completion.choices?.[0]?.message?.content ?? '';
      return { text, content: text };
    },
  };
}
