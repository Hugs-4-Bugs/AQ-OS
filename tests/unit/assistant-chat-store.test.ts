/**
 * MASTER-FIX regression tests — Bug #2: AI assistant transient state.
 *
 * Failure modes covered (task spec §3/§14):
 *  - one user prompt = exactly ONE AI request (guarded while generating)
 *  - aborting on navigation appends an explicit cancellation note — no stuck
 *    thinking state, no ghost partial, no auto-restart
 *  - a timeout cannot hang the "thinking" state forever
 *  - clear() resets everything; NOTHING rehydrates from storage
 */
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAssistantChatStore } from '@/lib/assistant-chat-store';
import { toast } from 'sonner';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function mockFetchOnce(payload: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  useAssistantChatStore.setState({
    messages: [],
    isGenerating: false,
    generatingSurface: null,
    dealProbability: null,
  });
});

describe('assistant chat store — one prompt, one request', () => {
  it('sends exactly one request per prompt and appends the response once', async () => {
    const fetchMock = mockFetchOnce({ mode: 'sales_coach', content: 'Coach answer', dealProbability: 42 });

    await useAssistantChatStore.getState().sendMessage(
      { content: 'How do I follow up?', leadId: null, salesCoachMode: true },
      'tab'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = useAssistantChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[0].content).toBe('How do I follow up?');
    expect(state.messages[1].content).toBe('Coach answer');
    expect(state.dealProbability).toBe(42);
    expect(state.isGenerating).toBe(false);
  });

  it('NEVER fires a second request while a generation is active (remount / second surface)', async () => {
    // A fetch that never settles on its own — but honors abort, like real fetch.
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = useAssistantChatStore.getState().sendMessage({ content: 'one', leadId: null }, 'tab');
    await flush();

    void useAssistantChatStore.getState().sendMessage({ content: 'two', leadId: null }, 'bubble');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1); // 'two' was rejected, not fetched
    expect(useAssistantChatStore.getState().messages.map((m) => m.content)).toEqual(['one']);

    useAssistantChatStore.getState().abortGeneration();
    await first;
    await flush();
  });

  it('records an explicit cancellation note on navigation-abort — no stuck spinner, no ghost response', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = useAssistantChatStore.getState().sendMessage({ content: 'hello', leadId: null }, 'tab');
    await flush();

    useAssistantChatStore.getState().abortGeneration();
    await pending;
    await flush();

    const state = useAssistantChatStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.generatingSurface).toBe(null);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].content).toMatch(/cancelled/i);
    // No response body was fabricated from the aborted request.
    expect(state.messages[1].content).not.toMatch(/hello/);
  });

  it('fails honestly (timeout note + toast) when the request exceeds the bound wait', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      );
      vi.stubGlobal('fetch', fetchMock);

      const pending = useAssistantChatStore.getState().sendMessage({ content: 'slow one', leadId: null }, 'tab');
      // The module's 90s timeout handle fires with all timers advanced.
      await vi.runAllTimersAsync();
      await pending;

      const state = useAssistantChatStore.getState();
      expect(state.isGenerating).toBe(false);
      expect(state.messages[1].content).toMatch(/timed out/i);
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('AI request timed out');
    } finally {
      vi.useRealTimers();
    }
  }, 15000);

  it('clear() aborts any in-flight generation and wipes the session transcript', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );

    const pending = useAssistantChatStore.getState().sendMessage({ content: 'will be cleared', leadId: null }, 'tab');
    await flush();
    useAssistantChatStore.getState().clear();
    await pending;
    await flush();

    const state = useAssistantChatStore.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.isGenerating).toBe(false);
    expect(state.dealProbability).toBe(null);
  });

  it('shapes structured (non-coach) responses incl. meetingIntent for the bubble', async () => {
    mockFetchOnce({
      mode: 'assistant',
      analysis: { intent: 'pricing question', buyingSignals: ['urgency'], hesitationPoints: [] },
      suggestedResponse: 'Offer the starter tier.',
      meetingIntent: { intent: 'book_meeting', confidence: 0.9 },
    });

    await useAssistantChatStore.getState().sendMessage({ content: 'q', leadId: 'lead-1' }, 'bubble');

    const last = useAssistantChatStore.getState().messages[1];
    expect(last.content).toContain('Intent Analysis');
    expect(last.content).toContain('Buying Signals');
    expect(last.meetingIntent?.intent).toBe('book_meeting');
  });
});
