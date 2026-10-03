'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Shared Assistant Chat Store (session-scoped)
//
// ONE conversation shared by BOTH assistant surfaces (the Assistant tab
// and the Quick Assistant bubble). Fixes the "split-brain" transient
// state where each surface kept its own transcript and in-flight fetch:
//
//  • Transient generation state (isGenerating, AbortController, timeout)
//    lives here explicitly and NEVER rehydrates from storage — there is
//    intentionally NO persist middleware on this store.
//  • One user prompt = one AI request: sends are guarded while a
//    generation is active, so a remount can never duplicate one.
//  • Leaving the Assistant tab aborts the in-flight request (the
//    architecture does not intentionally support background generation)
//    and records an explicit cancellation note — no stuck thinking
//    state, no ghost partial response, no auto-restart on remount.
//  • Intentional durable artifacts (pinned messages / saved responses)
//    remain in their own localStorage-managed stores, untouched.
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type { AssistantMessage } from '@/lib/types';

/** The live route is a blocking JSON call with no server-side timeout —
 *  bound the client wait so "thinking" can never hang forever. */
const GENERATION_TIMEOUT_MS = 90_000;
const MAX_MESSAGES = 200;

export type AssistantSurface = 'tab' | 'bubble';

export interface SendAssistantMessageOptions {
  content: string;
  leadId: string | null;
  context?: string;
  salesCoachMode?: boolean;
  currentPage?: string;
}

interface AssistantChatState {
  /** Session conversation — intentional for this session only, never persisted. */
  messages: AssistantMessage[];
  /** Transient generation flag — cleared on abort/settle, never restored. */
  isGenerating: boolean;
  /** Which surface owns the active generation (null when idle). */
  generatingSurface: AssistantSurface | null;
  /** Deal probability from the latest sales-coach response (tab header). */
  dealProbability: number | null;

  /**
   * Send one user prompt. Appends the user message, performs exactly one
   * POST /api/sales-assistant, appends the shaped response. No-ops when a
   * generation is already active (one prompt = one request, always).
   */
  sendMessage: (opts: SendAssistantMessageOptions, surface: AssistantSurface) => Promise<void>;

  /**
   * Abort the in-flight generation (navigation away / explicit cancel).
   * Records an explicit note so the transcript never shows a dangling
   * question with no answer and no spinner.
   */
  abortGeneration: () => void;

  /** Drop the last assistant message (regenerate prep). */
  removeLastAssistantMessage: () => void;

  /** Remove the last user message (regenerate prep when re-sending it). */
  removeLastUserMessage: () => void;

  /** Append a locally-generated message (e.g. meeting-scheduled note). */
  appendMessage: (msg: AssistantMessage) => void;

  /** Clear the whole session conversation (explicit user action). */
  clear: () => void;
}

// ─── Non-serializable request handles — module scope ON PURPOSE ──────
// A component remount must never resurrect or duplicate them.
let activeController: AbortController | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let abortReason: 'timeout' | 'cancelled' = 'cancelled';
/**
 * Bumped by clear(): an in-flight request from a PREVIOUS epoch must not
 * append anything (its transcript no longer exists) and must not clobber
 * the state of a NEWER generation started after the clear.
 */
let generationEpoch = 0;

function clearGenerationHandles() {
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  activeController = null;
  abortReason = 'cancelled';
}

/** Unique-enough message id without colliding across surfaces. */
function msgId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Merge of both response shapers (assistant tab + api.askSalesAssistant),
 *  including coach mode and the bubble's meetingIntent card. */
function shapeAssistantResponse(data: Record<string, any>): AssistantMessage {
  if (data.mode === 'sales_coach') {
    return {
      id: msgId('asst'),
      role: 'assistant',
      content: data.content || '',
      buyingSignals: [],
      hesitationFactors: [],
      createdAt: new Date().toISOString(),
    };
  }

  const analysis = data.analysis || {};
  const psych = data.psychologicalApproach || {};
  const closing = data.closingStrategy || {};

  const buyingSignals = Array.isArray(analysis.buyingSignals)
    ? analysis.buyingSignals as string[]
    : [];
  const hesitationFactors = Array.isArray(analysis.hesitationPoints)
    ? analysis.hesitationPoints as string[]
    : [];

  const contentParts: string[] = [];
  if (analysis.intent) {
    contentParts.push(`**Intent Analysis:** ${analysis.intent}`);
  }
  if (buyingSignals.length > 0) {
    contentParts.push(`**Buying Signals:**\n${buyingSignals.map((s: string) => `- ${s}`).join('\n')}`);
  }
  if (hesitationFactors.length > 0) {
    contentParts.push(`**Hesitation Factors:**\n${hesitationFactors.map((s: string) => `- ${s}`).join('\n')}`);
  }
  if (data.suggestedResponse) {
    contentParts.push(`**Recommended Response:**\n${data.suggestedResponse}`);
  }
  if (psych.framework || psych.lever) {
    contentParts.push(`**Psychological Approach:** ${psych.framework || ''} — ${psych.lever || ''}. ${psych.rationale || ''}`);
  }
  if (closing.type || closing.nextMilestone) {
    contentParts.push(`**Closing Strategy:** ${closing.type || ''}. Next milestone: ${closing.nextMilestone || 'N/A'}. Timing: ${closing.timing || 'N/A'}`);
  }

  return {
    id: msgId('asst'),
    role: 'assistant',
    content: contentParts.join('\n\n'),
    intentAnalysis: analysis.intent as string | undefined,
    buyingSignals,
    hesitationFactors,
    recommendedResponse: data.suggestedResponse as string | undefined,
    closingStrategy: closing.type as string | undefined,
    meetingIntent: data.meetingIntent as AssistantMessage['meetingIntent'],
    createdAt: new Date().toISOString(),
  };
}

export const useAssistantChatStore = create<AssistantChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  generatingSurface: null,
  dealProbability: null,

  async sendMessage(opts, surface) {
    // ONE generation at a time across ALL surfaces — a remount or a
    // second surface can never duplicate the request.
    if (get().isGenerating) return;
    const content = opts.content.trim();
    if (!content) return;

    const epoch = generationEpoch;
    const userMsg: AssistantMessage = {
      id: msgId('user'),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, userMsg].slice(-MAX_MESSAGES) }));

    const controller = new AbortController();
    activeController = controller;
    activeTimeout = setTimeout(() => {
      abortReason = 'timeout';
      controller.abort();
    }, GENERATION_TIMEOUT_MS);
    set({ isGenerating: true, generatingSurface: surface });

    try {
      const res = await fetch('/api/sales-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: opts.leadId || null,
          message: content,
          context: opts.context,
          salesCoachMode: opts.salesCoachMode ?? false,
          currentPage: opts.currentPage,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Assistant request failed (${res.status})`);
      const data = await res.json();

      const response = shapeAssistantResponse(data);
      set((s) => ({
        messages: [...s.messages, response].slice(-MAX_MESSAGES),
        dealProbability:
          data.mode === 'sales_coach' && data.dealProbability != null
            ? (data.dealProbability as number)
            : s.dealProbability,
      }));
    } catch (err) {
      if (epoch !== generationEpoch) {
        // The session was cleared while this request was in flight — the
        // transcript it belonged to no longer exists. Append nothing and
        // leave the (possibly newer) state alone.
        return;
      }
      const aborted = controller.signal.aborted;
      const note = (id: string, content: string): AssistantMessage => ({
        id,
        role: 'assistant',
        content,
        createdAt: new Date().toISOString(),
      });
      if (aborted && abortReason === 'timeout') {
        // Bound-wait exceeded — the user may still be watching either
        // surface, so surface a visible, honest failure.
        const timeoutNote = note(
          msgId('asst-timeout'),
          'The AI request timed out before a response arrived. Please send your message again.',
        );
        set((s) => ({ messages: [...s.messages, timeoutNote].slice(-MAX_MESSAGES) }));
        const { toast } = await import('sonner');
        toast.error('AI request timed out');
      } else if (aborted) {
        // Navigation/cancel abort: the transient request is gone; record
        // an explicit note so the question is never silently unanswered.
        // (No toast — the initiating surface may already be unmounted.)
        const cancelNote = note(
          msgId('asst-cancelled'),
          'Response cancelled — the page was left while it was generating. Send the message again if you still need it.',
        );
        set((s) => ({ messages: [...s.messages, cancelNote].slice(-MAX_MESSAGES) }));
      } else {
        // Real failure: keep the transcript honest with an explicit note.
        const errorNote = note(
          msgId('asst-error'),
          'Failed to get an AI response. Please try again.',
        );
        set((s) => ({ messages: [...s.messages, errorNote].slice(-MAX_MESSAGES) }));
      }
    } finally {
      if (epoch === generationEpoch) {
        clearGenerationHandles();
        set({ isGenerating: false, generatingSurface: null });
      }
    }
  },

  abortGeneration() {
    const { isGenerating } = get();
    if (!isGenerating) return;
    abortReason = 'cancelled';
    if (activeTimeout) {
      clearTimeout(activeTimeout);
      activeTimeout = null;
    }
    activeController?.abort();
    // The sendMessage finally-block settles the store state; nothing else
    // to reset here (handles are cleared there to avoid racing the catch).
  },

  removeLastAssistantMessage() {
    set((s) => {
      const idx = s.messages.map((m) => m.role).lastIndexOf('assistant');
      if (idx === -1) return s;
      return { messages: s.messages.slice(0, idx) };
    });
  },

  removeLastUserMessage() {
    set((s) => {
      const idx = s.messages.map((m) => m.role).lastIndexOf('user');
      if (idx === -1) return s;
      return { messages: s.messages.slice(0, idx) };
    });
  },

  appendMessage(msg) {
    set((s) => ({ messages: [...s.messages, msg].slice(-MAX_MESSAGES) }));
  },

  clear() {
    // Invalidate any in-flight request's right to write into the store.
    generationEpoch += 1;
    activeController?.abort();
    clearGenerationHandles();
    set({ messages: [], isGenerating: false, generatingSurface: null, dealProbability: null });
  },
}));
