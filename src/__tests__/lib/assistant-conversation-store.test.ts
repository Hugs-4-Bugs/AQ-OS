// ═════════════════════════════════════════════════════════════════════
// Unit Tests: Assistant Conversation Store (durable chat history)
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listConversations,
  loadConversation,
  saveConversation,
  deleteConversation,
  generateConversationTitle,
  MAX_CONVERSATIONS,
  MAX_MESSAGES_PER_CONVERSATION,
  type AssistantConversation,
} from '@/lib/assistant-conversation-store';
import type { AssistantMessage } from '@/lib/types';

function makeStorage(): Storage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage & { store: Map<string, string> };
}

const msg = (id: string, role: 'user' | 'assistant', content: string): AssistantMessage => ({
  id,
  role,
  content,
  createdAt: new Date('2026-10-04T04:00:00Z').toISOString(),
});

const conv = (id: string, updatedAt: string, messages: AssistantMessage[]): AssistantConversation => ({
  id,
  title: 'Title',
  messages,
  mode: 'default',
  createdAt: '2026-10-04T03:00:00Z',
  updatedAt,
});

describe('assistant-conversation-store', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => {
    storage = makeStorage();
    vi.spyOn(Math, 'random').mockRestore?.();
  });

  it('saves and lists conversations newest-activity-first', () => {
    saveConversation(storage, conv('a', '2026-10-04T03:00:00Z', [msg('m1', 'user', 'hi')]));
    saveConversation(storage, conv('b', '2026-10-04T05:00:00Z', [msg('m2', 'user', 'yo')]));
    const list = listConversations(storage);
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('upserts by id and preserves the original createdAt', () => {
    saveConversation(storage, conv('a', '2026-10-04T03:00:00Z', [msg('m1', 'user', 'hi')]));
    saveConversation(storage, {
      ...conv('a', '2026-10-04T06:00:00Z', [msg('m1', 'user', 'hi'), msg('m2', 'assistant', 'hello')]),
      createdAt: '2026-10-04T09:99:00Z', // should be ignored on update
    });
    const loaded = loadConversation(storage, 'a')!;
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.createdAt).toBe('2026-10-04T03:00:00Z');
    expect(listConversations(storage)).toHaveLength(1);
  });

  it('loads a conversation by id and returns null for unknown ids', () => {
    saveConversation(storage, conv('a', '2026-10-04T03:00:00Z', [msg('m1', 'user', 'hi')]));
    expect(loadConversation(storage, 'a')!.id).toBe('a');
    expect(loadConversation(storage, 'nope')).toBeNull();
  });

  it('trims messages to the per-conversation cap, keeping the most recent', () => {
    const many: AssistantMessage[] = Array.from({ length: MAX_MESSAGES_PER_CONVERSATION + 50 }, (_, i) =>
      msg(`m${i}`, i % 2 ? 'assistant' : 'user', `c${i}`)
    );
    saveConversation(storage, conv('a', '2026-10-04T03:00:00Z', many));
    const loaded = loadConversation(storage, 'a')!;
    expect(loaded.messages).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(loaded.messages[loaded.messages.length - 1].id).toBe(`m${many.length - 1}`);
  });

  it('caps the number of stored conversations, evicting the least recently updated', () => {
    for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) {
      saveConversation(storage, conv(`c${i}`, `2026-10-04T0${i % 10}:00:0${i % 10}Z`, [msg(`m${i}`, 'user', 'x')]));
    }
    const list = listConversations(storage);
    expect(list).toHaveLength(MAX_CONVERSATIONS);
  });

  it('deletes a conversation', () => {
    saveConversation(storage, conv('a', '2026-10-04T03:00:00Z', [msg('m1', 'user', 'hi')]));
    deleteConversation(storage, 'a');
    expect(listConversations(storage)).toHaveLength(0);
  });

  it('is defensive against corrupt JSON and malformed entries', () => {
    storage.setItem('acq-os-assistant-conversations', '{corrupt!');
    expect(listConversations(storage)).toEqual([]);
    storage.setItem(
      'acq-os-assistant-conversations',
      JSON.stringify([{ id: 'ok', messages: [{ id: 'm', role: 'user', content: 'x', createdAt: '' }], updatedAt: '2026-10-04T03:00:00Z' }, 'junk', null, { noId: true }])
    );
    const list = listConversations(storage);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ok');
  });

  it('generateConversationTitle derives a compact single-line title', () => {
    expect(generateConversationTitle('Find me dental clinics\nin Mumbai')).toBe('Find me dental clinics');
    // 57 chars + ellipsis suffix
    expect(generateConversationTitle('x'.repeat(100))).toHaveLength(58);
    expect(generateConversationTitle('x'.repeat(100))).toMatch(/…$/);
    expect(generateConversationTitle('   ')).toBe('Assistant chat');
  });
});
