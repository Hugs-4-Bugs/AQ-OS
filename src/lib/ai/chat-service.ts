// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Chat Service
// Phase 8: Complete AI chat system with streaming, sessions, memory
//
// Features:
// - Streaming responses
// - Chat history
// - Chat sessions
// - Memory integration
// - Regeneration
// - Stop generation
// - Citations foundation
// - File context foundation
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion, executeAIStream, type AIMessage, AI_CONFIG } from './ai-provider';
import { getPrompt, sanitizePromptInput } from './prompt-manager';
import { logChatStarted, logChatEnded, logAIAudit } from './ai-audit';
import { getRelevantMemory, updateMemory } from './memory-service';
import { deductCredits, checkCreditSufficiency, refundCredits, type CreditAction } from '@/lib/credit-service';
import { detectMeetingIntent } from '@/lib/meeting-orchestration-service';
import { determineAutonomyAction, autoScheduleIfAutonomous, requestMeetingApproval } from '@/lib/meeting/autonomy-engine';

// ===== TYPES =====

export interface StartChatInput {
  userId: string;
  leadId?: string;
  salesCoachMode?: boolean;
  currentPage?: string;
}

export interface SendMessageInput {
  sessionId: string;
  userId: string;
  message: string;
  stream?: boolean;
}

export interface ChatSessionData {
  id: string;
  title: string;
  mode: 'default' | 'sales_coach';
  leadId?: string;
  leadName?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MeetingIntentData {
  detected: true;
  intent: string;
  confidence: number;
  suggestedAction: string;
  leadId?: string;
  suggestSlotsAction: string;
}

export interface SendMessageResult {
  success: boolean;
  message?: ChatMessageData;
  stream?: ReadableStream<Uint8Array>;
  error?: string;
  creditsDeducted?: number;
  newBalance?: number;
  meetingIntent?: MeetingIntentData;
}

// ===== CREDIT COST =====

const CHAT_CREDIT_COST = AI_CONFIG.chatCreditCost;
const CHAT_ACTION: CreditAction = 'sales_coaching';

// ===== MAX MESSAGES PER SESSION =====

const MAX_SESSION_MESSAGES = AI_CONFIG.chatMaxMessages;

// ===== START NEW CHAT SESSION =====

export async function startChatSession(input: StartChatInput): Promise<{
  success: boolean;
  session?: ChatSessionData;
  error?: string;
}> {
  try {
    const { userId, leadId, salesCoachMode, currentPage } = input;

    // Get lead name if provided
    let leadName: string | undefined;
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      leadName = lead?.businessName;
    }

    // Create session in DB
    const session = await db.aiChatSession.create({
      data: {
        userId,
        title: leadName ? `Chat about ${leadName}` : 'New Chat',
        salesCoachMode: salesCoachMode || false,
        currentPage: currentPage || null,
        leadContext: leadId || null,
        isActive: true,
      },
    });

    // Log audit
    await logChatStarted(userId, session.id, {
      mode: salesCoachMode ? 'sales_coach' : 'default',
      leadId,
    });

    return {
      success: true,
      session: {
        id: session.id,
        title: session.title || 'New Chat',
        mode: session.salesCoachMode ? 'sales_coach' : 'default',
        leadId: session.leadContext || undefined,
        leadName,
        messageCount: 0,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('[ChatService] Failed to start session:', error);
    return { success: false, error: 'Failed to start chat session' };
  }
}

// ===== SEND MESSAGE =====

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { sessionId, userId, message, stream: useStream } = input;

  try {
    // 1. Get session
    const session = await db.aiChatSession.findUnique({
      where: { id: sessionId, userId, isActive: true },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: MAX_SESSION_MESSAGES,
        },
      },
    });

    if (!session) {
      return { success: false, error: 'Chat session not found' };
    }

    // 2. Check message count
    if (session.messages.length >= MAX_SESSION_MESSAGES) {
      return { success: false, error: `Maximum ${MAX_SESSION_MESSAGES} messages per session reached` };
    }

    // 3. Check credits
    const sufficiency = await checkCreditSufficiency(userId, CHAT_CREDIT_COST);
    if (!sufficiency.sufficient) {
      return { success: false, error: `Insufficient credits. Need ${CHAT_CREDIT_COST}, have ${sufficiency.balance}` };
    }

    // 4. Save user message
    const userMessage = await db.aiChatMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: message,
      },
    });

    // 5. Deduct credits
    const deduction = await deductCredits({
      userId,
      action: CHAT_ACTION,
      cost: CHAT_CREDIT_COST,
      referenceId: sessionId,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct credits' };
    }

    // 6. Build context with memory
    const leadId = session.leadContext;
    const memory = leadId ? await getRelevantMemory(userId, leadId) : null;

    // Build conversation history (reversed to chronological order)
    const chatHistory: AIMessage[] = session.messages
      .reverse()
      .slice(-10) // Last 10 messages for context
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system') as AIMessage['role'],
        content: m.content,
      }));

    // Get lead context if available
    let leadContextStr = '';
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (lead) {
        leadContextStr = `Current Lead: ${lead.businessName}, Niche: ${lead.niche || 'Unknown'}, Stage: ${lead.stage}, Scores: Reply=${lead.replyScore}, Conversion=${lead.conversionScore}`;
      }
    }

    // Build system prompt
    const promptId = session.salesCoachMode ? 'sales-coach' : 'ai-chat';
    const prompt = getPrompt(promptId, {
      leadContext: leadContextStr,
      currentPage: session.currentPage || '',
      userName: '',
      orgName: '',
    });

    // Full message list for AI
    const aiMessages: AIMessage[] = [
      { role: 'system', content: prompt.content },
    ];

    // Add memory context if available
    if (memory) {
      aiMessages.push({
        role: 'system',
        content: `Relevant context from previous interactions: ${memory.summary}`,
      });
    }

    // Add chat history
    aiMessages.push(...chatHistory);

    // Add current user message
    aiMessages.push({ role: 'user', content: sanitizePromptInput(message) });

    // 7. Handle streaming vs regular response
    if (useStream) {
      const stream = executeAIStream(
        {
          messages: aiMessages,
          config: { provider: 'z-ai', maxTokens: 2048, temperature: 0.7, timeout: 45000, retries: 1 },
        },
        userId,
        'ai_chat'
      );

      // Save assistant response after stream completes (in background)
      // For streaming, we save the response when the stream ends on the client side
      // via a separate callback. For now, start streaming.
      return {
        success: true,
        stream,
        creditsDeducted: CHAT_CREDIT_COST,
        newBalance: deduction.newBalance,
      };
    }

    // Regular (non-streaming) response
    const startTime = Date.now();
    const result = await executeAICompletion(
      {
        messages: aiMessages,
        config: { provider: 'z-ai', maxTokens: 2048, temperature: 0.7, timeout: 45000, retries: 2 },
      },
      userId,
      'ai_chat'
    );
    const latencyMs = Date.now() - startTime;

    if (!result.success || !result.content) {
      await refundCredits({ userId, amount: CHAT_CREDIT_COST, originalAction: CHAT_ACTION, referenceId: sessionId });
      return { success: false, error: result.error || 'AI generation failed' };
    }

    // 8. Save assistant message
    const assistantMessage = await db.aiChatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: result.content,
        metadata: JSON.stringify({
          provider: result.provider,
          model: result.model,
          tokensUsed: result.tokensUsed,
          latencyMs,
        }),
      },
    });

    // 9. Update memory
    if (leadId) {
      await updateMemory(userId, leadId, {
        lastInteraction: new Date().toISOString(),
        topics: [message.slice(0, 50)],
        summary: result.content.slice(0, 200),
      });
    }

    // 10. Update session
    await db.aiChatSession.update({
      where: { id: sessionId },
      data: {
        title: session.messages.length === 0 ? message.slice(0, 50) : undefined,
        updatedAt: new Date(),
      },
    });

    // 11. Detect meeting intent from user's message
    let meetingIntent: MeetingIntentData | undefined;
    try {
      const intentResult = detectMeetingIntent(message);
      if (intentResult.intent && intentResult.confidence > 0.7) {
        meetingIntent = {
          detected: true,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          suggestedAction: intentResult.suggestedAction || '',
          leadId: leadId || undefined,
          suggestSlotsAction: '/api/meetings/suggest-slots',
        };

        // Log the intent detection
        try {
          await db.meetingIntentLog.create({
            data: {
              userId,
              leadId: leadId || null,
              sourceType: 'chat',
              sourceId: sessionId,
              detectedIntent: intentResult.intent,
              confidence: intentResult.confidence,
              originalText: message.substring(0, 1000),
              suggestedAction: intentResult.suggestedAction
                ? JSON.stringify({ action: intentResult.suggestedAction })
                : null,
              status: 'detected',
            },
          });
        } catch (logError) {
          console.error('[ChatService] Failed to log meeting intent:', logError);
        }

        // Trigger autonomy engine based on detected intent
        try {
          const autonomyAction = await determineAutonomyAction(userId, {
            meetingTitle: intentResult.intent === 'schedule_meeting'
              ? (meetingIntent.suggestedAction || 'Meeting from chat')
              : 'Meeting from chat',
            confidence: intentResult.confidence,
            leadId: leadId || undefined,
            sourceType: 'chat',
            sourceId: sessionId,
            originalText: message.substring(0, 1000),
            detectedIntent: intentResult.intent,
          });

          if (autonomyAction.action === 'auto_schedule' && autonomyAction.meetingData) {
            const scheduleResult = await autoScheduleIfAutonomous(userId, autonomyAction.meetingData);
            if (scheduleResult) {
              meetingIntent.suggestedAction = scheduleResult.scheduled
                ? `Meeting auto-scheduled: ${scheduleResult.meetingId} — ${scheduleResult.reason}`
                : `Auto-schedule skipped: ${scheduleResult.reason}`;
            }
          } else if (autonomyAction.action === 'request_approval' && autonomyAction.meetingData) {
            try {
              const approvalResult = await requestMeetingApproval(userId, autonomyAction.meetingData);
              meetingIntent.suggestedAction = `Approval requested for meeting ${approvalResult.meetingId} — notification: ${approvalResult.notificationSent ? 'sent' : 'failed'}, email: ${approvalResult.emailSent ? 'sent' : 'failed'}`;
            } catch (approvalError) {
              console.error('[ChatService] Failed to request meeting approval:', approvalError);
            }
          }
        } catch (autonomyError) {
          console.error('[ChatService] Autonomy engine error:', autonomyError);
        }
      }
    } catch (intentError) {
      console.error('[ChatService] Meeting intent detection error:', intentError);
    }

    return {
      success: true,
      message: {
        id: assistantMessage.id,
        sessionId,
        role: 'assistant',
        content: result.content,
        metadata: {
          provider: result.provider,
          tokensUsed: result.tokensUsed,
          latencyMs,
        },
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      creditsDeducted: CHAT_CREDIT_COST,
      newBalance: deduction.newBalance,
      meetingIntent,
    };
  } catch (error) {
    console.error('[ChatService] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Chat failed' };
  }
}

// ===== SAVE STREAMED RESPONSE =====

export async function saveStreamedResponse(sessionId: string, userId: string, content: string): Promise<void> {
  try {
    await db.aiChatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content,
        metadata: JSON.stringify({ streamed: true }),
      },
    });

    await db.aiChatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  } catch (error) {
    console.error('[ChatService] Failed to save streamed response:', error);
  }
}

// ===== CANCEL GENERATION =====

export async function cancelGeneration(sessionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Set cancellation token
    const { setCancelToken } = await import('./ai-provider');
    setCancelToken(sessionId);

    await logAIAudit({
      userId,
      action: 'ai_generation_cancelled',
      resource: 'ai_chat_session',
      resourceId: sessionId,
      details: { reason: 'user_cancelled' },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to cancel generation' };
  }
}

// ===== GET CHAT SESSIONS =====

export async function getChatSessions(userId: string, limit = 20): Promise<ChatSessionData[]> {
  const sessions = await db.aiChatSession.findMany({
    where: { userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { _count: { select: { messages: true } } },
  });

  return sessions.map((s) => ({
    id: s.id,
    title: s.title || 'Untitled',
    mode: s.salesCoachMode ? 'sales_coach' : 'default',
    leadId: s.leadContext || undefined,
    messageCount: s._count.messages,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

// ===== GET CHAT MESSAGES =====

export async function getChatMessages(sessionId: string, userId: string, limit = 50): Promise<ChatMessageData[]> {
  const messages = await db.aiChatMessage.findMany({
    where: {
      session: { id: sessionId, userId },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  return messages.map((m) => ({
    id: m.id,
    sessionId: m.sessionId,
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    metadata: m.metadata ? (() => { try { return JSON.parse(m.metadata); } catch { return undefined; } })() : undefined,
    createdAt: m.createdAt.toISOString(),
  }));
}

// ===== END CHAT SESSION =====

export async function endChatSession(sessionId: string, userId: string): Promise<{ success: boolean }> {
  try {
    const session = await db.aiChatSession.findUnique({
      where: { id: sessionId, userId },
      include: { _count: { select: { messages: true } } },
    });

    if (session) {
      await db.aiChatSession.update({
        where: { id: sessionId },
        data: { isActive: false },
      });

      await logChatEnded(userId, sessionId, {
        messageCount: session._count.messages,
        durationMs: Date.now() - session.createdAt.getTime(),
      });
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}
