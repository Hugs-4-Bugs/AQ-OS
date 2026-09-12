// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Vector Search Service
// Phase 8: AI Fixes — Semantic Search with Cosine Similarity
//
// Simplified vector search using z-ai-web-dev-sdk for embeddings
// and SQLite-compatible JSON storage for embedding vectors.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface EmbeddingVector {
  id: string;
  leadId?: string;
  conversationId?: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface SearchResult {
  id: string;
  leadId?: string;
  conversationId?: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  topK?: number;
  minScore?: number;
  filter?: {
    userId?: string;
    leadId?: string;
    type?: 'lead' | 'conversation';
  };
}

// ===== EMBEDDING DIMENSION =====
// We use a simplified embedding approach: the LLM generates a fixed-dimension
// numeric representation by asking it to produce a compact embedding.
const EMBEDDING_DIMENSION = 64;
const MIN_SCORE_DEFAULT = 0.3;

// ===== CORE FUNCTIONS =====

/**
 * Generate a text embedding using z-ai-web-dev-sdk LLM.
 * Uses a structured prompt to produce a fixed-dimension numeric vector.
 * The LLM acts as a semantic encoder, producing numbers that capture meaning.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const zai = await ZAI.create();

    // Truncate text to avoid token limits
    const truncatedText = text.substring(0, 2000);

    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a semantic encoding system. Given text, produce a ${EMBEDDING_DIMENSION}-dimensional numeric embedding vector that captures the semantic meaning of the text.

RULES:
- Output EXACTLY ${EMBEDDING_DIMENSION} floating-point numbers
- Numbers should be between -1.0 and 1.0
- Similar meanings should produce similar vectors
- Use the semantic space to encode: business type, location, quality, sentiment, intent, industry, size
- Return ONLY a JSON array of ${EMBEDDING_DIMENSION} numbers, nothing else
- Example format: [0.12, -0.34, 0.56, ...]`,
        },
        {
          role: 'user',
          content: `Encode this text into a ${EMBEDDING_DIMENSION}-dimensional semantic vector:\n\n${truncatedText}`,
        },
      ],
      model: 'auto',
    });

    const content = response.choices?.[0]?.message?.content || '[]';

    // Parse the embedding vector
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIMENSION) {
      // If LLM didn't return exact dimension, pad or truncate
      const vector: number[] = [];
      for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
        const val = i < parsed.length ? Number(parsed[i]) || 0 : 0;
        vector.push(Math.max(-1, Math.min(1, val)));
      }
      return vector;
    }

    return parsed.map((v: number) => Math.max(-1, Math.min(1, Number(v) || 0)));
  } catch (error) {
    console.error('[VectorSearch] Failed to generate embedding:', error);
    // Return a zero vector as fallback
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1, where 1 means identical.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Search leads by semantic similarity.
 * Generates an embedding for the query and compares against stored lead embeddings.
 */
export async function searchSimilarLeads(
  query: string,
  userId: string,
  options?: VectorSearchOptions
): Promise<SearchResult[]> {
  const topK = options?.topK || 10;
  const minScore = options?.minScore ?? MIN_SCORE_DEFAULT;

  try {
    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    // Check if query vector is all zeros (embedding generation failed)
    if (queryVector.every((v) => v === 0)) {
      console.warn('[VectorSearch] Query embedding is zero vector, falling back to text search');
      return fallbackTextSearch(query, userId, topK);
    }

    // Fetch all leads for this user with embeddings
    const leads = await db.lead.findMany({
      where: {
        userId,
        isActive: true,
        notes: { not: null }, // Using notes field to store embedding JSON
      },
      select: {
        id: true,
        businessName: true,
        niche: true,
        city: true,
        country: true,
        stage: true,
        notes: true, // Contains embedding JSON
        scoreReasoning: true,
        opportunityNotes: true,
        digitalWeaknesses: true,
      },
      take: 200, // Limit to avoid memory issues
    });

    // Compute similarity for each lead
    const results: SearchResult[] = [];

    for (const lead of leads) {
      try {
        if (!lead.notes) continue;

        // Parse stored embedding
        const stored = JSON.parse(lead.notes);
        if (!stored._embedding || !Array.isArray(stored._embedding)) continue;

        const score = computeCosineSimilarity(queryVector, stored._embedding);

        if (score >= minScore) {
          results.push({
            id: lead.id,
            leadId: lead.id,
            text: [
              lead.businessName,
              lead.niche,
              lead.city,
              lead.country,
              lead.scoreReasoning,
              lead.opportunityNotes,
            ]
              .filter(Boolean)
              .join(' | '),
            score,
            metadata: {
              businessName: lead.businessName,
              niche: lead.niche,
              city: lead.city,
              country: lead.country,
              stage: lead.stage,
            },
          });
        }
      } catch {
        // Skip leads with invalid embedding data
        continue;
      }
    }

    // Sort by score descending and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (error) {
    console.error('[VectorSearch] Failed to search similar leads:', error);
    return fallbackTextSearch(query, userId, topK);
  }
}

/**
 * Search conversations by semantic meaning.
 */
export async function searchConversations(
  query: string,
  userId: string,
  options?: VectorSearchOptions
): Promise<SearchResult[]> {
  const topK = options?.topK || 10;
  const minScore = options?.minScore ?? MIN_SCORE_DEFAULT;

  try {
    const queryVector = await generateEmbedding(query);

    if (queryVector.every((v) => v === 0)) {
      return [];
    }

    // Fetch user's conversation messages
    const messages = await db.conversationMessage.findMany({
      where: {
        userId,
        content: { not: '' },
      },
      select: {
        id: true,
        conversationId: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const results: SearchResult[] = [];

    for (const msg of messages) {
      try {
        if (!msg.metadata) continue;

        const meta = JSON.parse(msg.metadata);
        if (!meta._embedding || !Array.isArray(meta._embedding)) continue;

        const score = computeCosineSimilarity(queryVector, meta._embedding);

        if (score >= minScore) {
          results.push({
            id: msg.id,
            conversationId: msg.conversationId,
            text: msg.content.substring(0, 200),
            score,
            metadata: { conversationId: msg.conversationId, createdAt: msg.createdAt },
          });
        }
      } catch {
        continue;
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (error) {
    console.error('[VectorSearch] Failed to search conversations:', error);
    return [];
  }
}

/**
 * Index a lead's embedding for future vector searches.
 * Generates embedding from lead data and stores it in the notes field as JSON.
 */
export async function indexLeadEmbedding(leadId: string): Promise<boolean> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        niche: true,
        city: true,
        country: true,
        stage: true,
        websiteQuality: true,
        digitalWeaknesses: true,
        opportunityNotes: true,
        scoreReasoning: true,
        notes: true,
      },
    });

    if (!lead) return false;

    // Build text for embedding
    const textForEmbedding = [
      lead.businessName,
      lead.ownerName,
      lead.niche,
      lead.city,
      lead.country,
      lead.stage,
      lead.websiteQuality,
      lead.digitalWeaknesses,
      lead.opportunityNotes,
      lead.scoreReasoning,
    ]
      .filter(Boolean)
      .join(' | ');

    const embedding = await generateEmbedding(textForEmbedding);

    // Store embedding in the notes field as JSON
    // Preserve existing notes if any
    let existingNotes: Record<string, unknown> = {};
    if (lead.notes) {
      try {
        existingNotes = JSON.parse(lead.notes);
      } catch {
        existingNotes = { _text: lead.notes };
      }
    }

    existingNotes._embedding = embedding;
    existingNotes._embeddedAt = new Date().toISOString();

    await db.lead.update({
      where: { id: leadId },
      data: { notes: JSON.stringify(existingNotes) },
    });

    return true;
  } catch (error) {
    console.error(`[VectorSearch] Failed to index lead ${leadId}:`, error);
    return false;
  }
}

/**
 * Reindex all leads for a user.
 * Processes leads in batches to avoid memory issues.
 */
export async function reindexAll(userId: string): Promise<{
  total: number;
  indexed: number;
  failed: number;
}> {
  let indexed = 0;
  let failed = 0;

  try {
    const leads = await db.lead.findMany({
      where: { userId, isActive: true },
      select: { id: true },
      take: 500,
    });

    const total = leads.length;

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((lead) => indexLeadEmbedding(lead.id))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          indexed++;
        } else {
          failed++;
        }
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < leads.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return { total, indexed, failed };
  } catch (error) {
    console.error('[VectorSearch] Reindex all failed:', error);
    return { total: 0, indexed, failed };
  }
}

// ===== FALLBACK TEXT SEARCH =====

/**
 * Fallback text search when vector search is unavailable.
 * Uses simple text matching on lead fields.
 */
async function fallbackTextSearch(
  query: string,
  userId: string,
  topK: number
): Promise<SearchResult[]> {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter((t) => t.length > 1);

  const leads = await db.lead.findMany({
    where: {
      userId,
      isActive: true,
      OR: terms.map((term) => ({
        OR: [
          { businessName: { contains: term } },
          { niche: { contains: term } },
          { city: { contains: term } },
          { country: { contains: term } },
          { ownerName: { contains: term } },
          { opportunityNotes: { contains: term } },
          { scoreReasoning: { contains: term } },
        ],
      })),
    },
    select: {
      id: true,
      businessName: true,
      niche: true,
      city: true,
      country: true,
      stage: true,
    },
    take: topK,
  });

  return leads.map((lead) => ({
    id: lead.id,
    leadId: lead.id,
    text: [lead.businessName, lead.niche, lead.city, lead.country].filter(Boolean).join(' | '),
    score: 0.5, // Default score for text search
    metadata: {
      businessName: lead.businessName,
      niche: lead.niche,
      city: lead.city,
      country: lead.country,
      stage: lead.stage,
    },
  }));
}
