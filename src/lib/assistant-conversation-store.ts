// ═════════════════════════════════════════════════════════════════════
// Assistant Conversation Store — durable layer for AI assistant chats
// ═════════════════════════════════════════════════════════════════════
// Separates DURABLE state (intentional conversation history) from TRANSIENT
// state (in-flight request, pending indicator) in the AI assistant. The
// component keeps transient state in React only; everything the user has
// seen as a completed exchange is persisted here so navigation away/return
// restores the conversation WITHOUT re-sending any request.
//
// localStorage-backed, injectable storage for tests, defensive parsing.

import type { AssistantMessage } from '@/lib/types';

export const ASSISTANT_CONVERSATIONS_KEY = 'acq-os-assistant-conversations';

export const MAX_CONVERSATIONS = 20;
export const MAX_MESSAGES_PER_CONVERSATION = 200;

export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  mode: 'default' | 'sales_coach';
  createdAt: string;
  updatedAt: string;
}

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeConversation(input: unknown): AssistantConversation | null {
  if (typeof input !== 'object' || input === null) return null;
  const c = input as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  if (!Array.isArray(c.messages)) return null;
  const messages = (c.messages as unknown[]).filter(
    (m): m is AssistantMessage =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as AssistantMessage).id === 'string' &&
      ((m as AssistantMessage).role === 'user' || (m as AssistantMessage).role === 'assistant') &&
      typeof (m as AssistantMessage).content === 'string'
  );
  return {
    id: c.id,
    title: typeof c.title === 'string' && c.title ? c.title : 'Assistant chat',
    messages,
    mode: c.mode === 'sales_coach' ? 'sales_coach' : 'default',
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date(0).toISOString(),
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date(0).toISOString(),
  };
}

/** All persisted conversations, newest activity first. Corrupt data → []. */
export function listConversations(storage: MinimalStorage): AssistantConversation[] {
  const parsed = safeParse(storage.getItem(ASSISTANT_CONVERSATIONS_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(sanitizeConversation)
    .filter((c): c is AssistantConversation => c !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Load one conversation by id (defensive), or null. */
export function loadConversation(
  storage: MinimalStorage,
  id: string
): AssistantConversation | null {
  return listConversations(storage).find((c) => c.id === id) ?? null;
}

/**
 * Upsert a conversation (preserving the original createdAt), trim messages,
 * cap the number of stored conversations (oldest-updated evicted first).
 */
export function saveConversation(
  storage: MinimalStorage,
  conversation: AssistantConversation
): void {
  const existing = listConversations(storage);
  const previous = existing.find((c) => c.id === conversation.id);
  const trimmed: AssistantConversation = {
    ...conversation,
    messages: conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    // Preserve the original creation timestamp on updates so history stays stable.
    createdAt: previous?.createdAt ?? conversation.createdAt,
  };
  const next = [trimmed, ...existing.filter((c) => c.id !== conversation.id)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  storage.setItem(ASSISTANT_CONVERSATIONS_KEY, JSON.stringify(next));
}

export function deleteConversation(storage: MinimalStorage, id: string): void {
  const next = listConversations(storage).filter((c) => c.id !== id);
  storage.setItem(ASSISTANT_CONVERSATIONS_KEY, JSON.stringify(next));
}

/** Derive a human-readable conversation title from the first user message. */
export function generateConversationTitle(firstUserMessage: string): string {
  const line = (firstUserMessage || '').split('\n').find((l) => l.trim().length > 0) ?? '';
  const compact = line.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Assistant chat';
  return compact.length > 60 ? `${compact.slice(0, 57)}…` : compact;
}
