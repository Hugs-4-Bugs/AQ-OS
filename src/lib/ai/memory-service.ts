// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Memory System
// Phase 8: Session memory + Lead context memory + Org memory
//
// Implements:
// - Session memory (short-term, per chat session)
// - Lead context memory (accumulated knowledge about a lead)
// - Org memory (organization-wide insights)
// - Summary compression foundation
// - Token limits
// - Cleanup
// - Persistence
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAIAudit } from './ai-audit';
import { AI_CONFIG } from './ai-provider';

// ===== TYPES =====

export interface MemoryEntry {
  id: string;
  userId: string;
  leadId?: string;
  type: 'session' | 'lead' | 'org';
  key: string;
  summary: string;
  topics: string[];
  tokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateMemoryInput {
  lastInteraction?: string;
  topics?: string[];
  summary?: string;
  additionalContext?: string;
}

// ===== IN-MEMORY CACHE =====

const memoryCache = new Map<string, MemoryEntry>();
const MAX_CACHE_SIZE = AI_CONFIG.memoryCacheSize;
const MAX_TOKENS_PER_MEMORY = AI_CONFIG.memoryMaxTokens;
const MAX_MEMORY_AGE_HOURS = AI_CONFIG.memoryMaxAgeHours;

// ===== GET RELEVANT MEMORY =====

/**
 * Get relevant memory for a user/lead combination.
 * Checks cache first, then falls back to database.
 */
export async function getRelevantMemory(
  userId: string,
  leadId?: string,
  type: 'session' | 'lead' | 'org' = 'lead'
): Promise<MemoryEntry | null> {
  const cacheKey = `memory:${userId}:${leadId || 'global'}:${type}`;

  // Check cache
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    const ageHours = (Date.now() - new Date(cached.updatedAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < MAX_MEMORY_AGE_HOURS) {
      return cached;
    }
    memoryCache.delete(cacheKey);
  }

  // Try to load from database (AiChatMessage history)
  try {
    if (leadId) {
      // Get lead's analysis and recent chat for memory
      const analysis = await db.leadAnalysis.findUnique({
        where: { leadId },
      });

      const recentChat = await db.aiChatMessage.findMany({
        where: {
          session: {
            userId,
            leadContext: leadId,
            isActive: true,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (analysis || recentChat.length > 0) {
        const topics: string[] = [];
        let summary = '';

        if (analysis) {
          topics.push('analysis_completed');
          summary += `Lead analyzed. Quality: ${analysis.replyScore}/100. `;
          if (analysis.closingStrategy) {
            summary += `Strategy: ${analysis.closingStrategy.slice(0, 100)}. `;
          }
        }

        if (recentChat.length > 0) {
          topics.push('chat_history');
          summary += `Recent chat topics: ${recentChat.slice(0, 3).map(m => m.content.slice(0, 30)).join(', ')}. `;
        }

        const entry: MemoryEntry = {
          id: `mem-${Date.now()}`,
          userId,
          leadId,
          type,
          key: cacheKey,
          summary: summary.slice(0, MAX_TOKENS_PER_MEMORY * 4),
          topics,
          tokens: Math.ceil(summary.length / 4),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        memoryCache.set(cacheKey, entry);
        trimCache();
        return entry;
      }
    }

    // Check for org-level memory
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });

    if (user?.orgId && type === 'org') {
      const orgLeads = await db.lead.count({
        where: { orgId: user.orgId, isActive: true },
      });

      const entry: MemoryEntry = {
        id: `mem-org-${Date.now()}`,
        userId,
        type: 'org',
        key: cacheKey,
        summary: `Organization has ${orgLeads} active leads.`,
        topics: ['org_stats'],
        tokens: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      memoryCache.set(cacheKey, entry);
      return entry;
    }
  } catch (error) {
    console.error('[MemoryService] Failed to load memory:', error);
  }

  return null;
}

// ===== UPDATE MEMORY =====

/**
 * Update memory with new information.
 * Merges topics, compresses summary if needed.
 */
export async function updateMemory(
  userId: string,
  leadId: string,
  data: UpdateMemoryInput
): Promise<void> {
  const cacheKey = `memory:${userId}:${leadId}:lead`;
  const existing = memoryCache.get(cacheKey);

  const topics = [...new Set([...(existing?.topics || []), ...(data.topics || [])])];
  let summary = data.summary || existing?.summary || '';

  if (data.additionalContext) {
    summary += ` ${data.additionalContext}`;
  }

  // Compress summary if too long
  if (summary.length > MAX_TOKENS_PER_MEMORY * 4) {
    summary = await compressSummary(summary);
  }

  const entry: MemoryEntry = {
    id: existing?.id || `mem-${Date.now()}`,
    userId,
    leadId,
    type: 'lead',
    key: cacheKey,
    summary,
    topics: topics.slice(0, 20), // Limit topics
    tokens: Math.ceil(summary.length / 4),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memoryCache.set(cacheKey, entry);
  trimCache();

  await logAIAudit({
    userId,
    action: 'ai_memory_updated',
    resource: 'memory',
    resourceId: leadId,
    details: { topics: topics.length, tokenCount: entry.tokens },
  });
}

// ===== SUMMARY COMPRESSION =====

/**
 * Compress a summary to fit within token limits.
 * Uses a simple extractive compression (keeps first and last parts).
 * Foundation for future AI-powered compression.
 */
async function compressSummary(summary: string): Promise<string> {
  const maxChars = MAX_TOKENS_PER_MEMORY * 4;

  if (summary.length <= maxChars) return summary;

  // Simple compression: keep first half and last quarter
  const halfPoint = Math.floor(maxChars * 0.6);
  const quarterFromEnd = Math.floor(maxChars * 0.3);

  return (
    summary.slice(0, halfPoint) +
    ' ... [compressed] ... ' +
    summary.slice(summary.length - quarterFromEnd)
  );
}

// ===== CLEANUP =====

/**
 * Clean up old memory entries.
 * Should be called periodically.
 */
export async function cleanupMemory(): Promise<{ cleaned: number }> {
  let cleaned = 0;

  for (const [key, entry] of memoryCache.entries()) {
    const ageHours = (Date.now() - new Date(entry.updatedAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > MAX_MEMORY_AGE_HOURS) {
      memoryCache.delete(key);
      cleaned++;
    }
  }

  return { cleaned };
}

// ===== CACHE TRIMMING =====

function trimCache(): void {
  if (memoryCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entries
    const entries = Array.from(memoryCache.entries()).sort(
      (a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime()
    );

    const toRemove = entries.slice(0, memoryCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      memoryCache.delete(key);
    }
  }
}

// ===== GET SESSION MEMORY =====

/**
 * Get all memory entries for a user's current session.
 */
export async function getSessionMemory(userId: string): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];

  for (const [, entry] of memoryCache.entries()) {
    if (entry.userId === userId) {
      entries.push(entry);
    }
  }

  return entries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
