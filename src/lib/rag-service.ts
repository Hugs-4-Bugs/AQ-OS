// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RAG (Retrieval-Augmented Generation) Service
// Phase 8: AI Fixes — Document Chunking, Context Building, Prompt Injection
//
// Provides RAG foundation:
// - Document chunking (500 tokens with overlap)
// - Context building from retrieved chunks
// - Prompt injection with context
// - Source attribution tracking
// - Context window management
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { generateEmbedding, computeCosineSimilarity } from '@/lib/vector-search-service';

// ===== TYPES =====

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  startIndex: number;
  endIndex: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk extends DocumentChunk {
  score: number;
  source: string;
}

export interface RagContext {
  context: string;
  sources: SourceAttribution[];
  tokenCount: number;
  chunksUsed: number;
}

export interface SourceAttribution {
  documentId: string;
  chunkId: string;
  source: string;
  relevanceScore: number;
  snippet: string;
}

export interface PromptWithRagContext {
  systemPrompt: string;
  userPrompt: string;
  context: string;
  sources: SourceAttribution[];
  totalTokens: number;
}

// ===== CONSTANTS =====

const CHUNK_SIZE_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const TOKENS_PER_CHAR = 0.25; // Rough estimate: ~4 chars per token
const MAX_CONTEXT_TOKENS = 4000;
const MIN_RELEVANCE_SCORE = 0.3;

// ===== DOCUMENT CHUNKING =====

/**
 * Split text into chunks of approximately 500 tokens with overlap.
 * Uses a simple sentence-aware splitting strategy.
 */
export function chunkDocument(
  text: string,
  documentId: string,
  options?: {
    chunkSize?: number;
    overlap?: number;
    metadata?: Record<string, unknown>;
  }
): DocumentChunk[] {
  const chunkSizeTokens = options?.chunkSize || CHUNK_SIZE_TOKENS;
  const overlapTokens = options?.overlap || CHUNK_OVERLAP_TOKENS;
  const metadata = options?.metadata || {};

  // Convert token sizes to approximate character sizes
  const chunkSizeChars = Math.floor(chunkSizeTokens / TOKENS_PER_CHAR);
  const overlapChars = Math.floor(overlapTokens / TOKENS_PER_CHAR);

  if (!text || text.trim().length === 0) return [];

  // Split into paragraphs first, then sentences
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: DocumentChunk[] = [];
  let currentChunk = '';
  let startIndex = 0;
  let globalCharIndex = 0;

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length + paragraph.length > chunkSizeChars && currentChunk.length > 0) {
      chunks.push({
        id: `${documentId}_chunk_${chunks.length}`,
        documentId,
        content: currentChunk.trim(),
        startIndex,
        endIndex: startIndex + currentChunk.length,
        metadata: { ...metadata, chunkIndex: chunks.length },
      });

      // Keep overlap from end of current chunk
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = overlapText + '\n\n' + paragraph;
      startIndex = globalCharIndex - overlapChars;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }

    globalCharIndex += paragraph.length + 2; // +2 for \n\n
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${documentId}_chunk_${chunks.length}`,
      documentId,
      content: currentChunk.trim(),
      startIndex,
      endIndex: startIndex + currentChunk.length,
      metadata: { ...metadata, chunkIndex: chunks.length },
    });
  }

  return chunks;
}

// ===== CONTEXT BUILDING =====

/**
 * Build a RAG context string from retrieved chunks.
 * Includes source attribution and respects token limits.
 */
export function buildRagContext(chunks: RetrievedChunk[]): RagContext {
  const sources: SourceAttribution[] = [];
  let contextParts: string[] = [];
  let tokenCount = 0;
  let chunksUsed = 0;

  // Sort by relevance score (highest first)
  const sortedChunks = [...chunks].sort((a, b) => b.score - a.score);

  for (const chunk of sortedChunks) {
    const chunkTokens = Math.ceil(chunk.content.length * TOKENS_PER_CHAR);

    // Check if adding this chunk would exceed context window
    if (tokenCount + chunkTokens > MAX_CONTEXT_TOKENS) {
      // Try to fit a truncated version
      const remainingTokens = MAX_CONTEXT_TOKENS - tokenCount;
      if (remainingTokens < 50) break; // Not enough space for useful content

      const maxChars = Math.floor(remainingTokens / TOKENS_PER_CHAR);
      const truncatedContent = chunk.content.substring(0, maxChars) + '...';

      contextParts.push(`[Source: ${chunk.source}, Relevance: ${chunk.score.toFixed(2)}]\n${truncatedContent}`);

      sources.push({
        documentId: chunk.documentId,
        chunkId: chunk.id,
        source: chunk.source,
        relevanceScore: chunk.score,
        snippet: truncatedContent,
      });

      tokenCount += remainingTokens;
      chunksUsed++;
      break;
    }

    contextParts.push(`[Source: ${chunk.source}, Relevance: ${chunk.score.toFixed(2)}]\n${chunk.content}`);

    sources.push({
      documentId: chunk.documentId,
      chunkId: chunk.id,
      source: chunk.source,
      relevanceScore: chunk.score,
      snippet: chunk.content.substring(0, 150),
    });

    tokenCount += chunkTokens;
    chunksUsed++;
  }

  return {
    context: contextParts.join('\n\n---\n\n'),
    sources,
    tokenCount,
    chunksUsed,
  };
}

// ===== CHUNK RETRIEVAL =====

/**
 * Retrieve relevant chunks from the database based on a query.
 * Uses vector similarity search on stored FileContext chunks.
 */
export async function retrieveRelevantChunks(
  query: string,
  options?: {
    leadId?: string;
    userId?: string;
    topK?: number;
    minScore?: number;
  }
): Promise<RetrievedChunk[]> {
  const topK = options?.topK || 5;
  const minScore = options?.minScore ?? MIN_RELEVANCE_SCORE;

  try {
    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    if (queryVector.every((v) => v === 0)) {
      console.warn('[RAG] Query embedding is zero vector');
      return [];
    }

    // Build where clause for FileContext
    const where: Record<string, unknown> = {};
    if (options?.userId) where.userId = options.userId;
    if (options?.leadId) where.leadId = options.leadId;

    // Fetch file contexts with chunks
    const fileContexts = await db.fileContext.findMany({
      where,
      select: {
        id: true,
        fileName: true,
        chunks: true,
        embedding: true,
        leadId: true,
      },
      take: 100,
    });

    const results: RetrievedChunk[] = [];

    for (const fc of fileContexts) {
      try {
        // Parse chunks from JSON
        const chunks: DocumentChunk[] = JSON.parse(fc.chunks || '[]');

        for (const chunk of chunks) {
          // Try to use chunk-level embedding first, fall back to document-level
          let chunkEmbedding = chunk.embedding;

          if (!chunkEmbedding || chunkEmbedding.length === 0) {
            // Use document-level embedding as fallback
            const docEmbedding = fc.embedding ? JSON.parse(fc.embedding) : null;
            if (!docEmbedding || !Array.isArray(docEmbedding)) continue;
            chunkEmbedding = docEmbedding;
          }

          const score = computeCosineSimilarity(queryVector, chunkEmbedding);

          if (score >= minScore) {
            results.push({
              ...chunk,
              score,
              source: fc.fileName || fc.id,
            });
          }
        }
      } catch {
        continue;
      }
    }

    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (error) {
    console.error('[RAG] Failed to retrieve chunks:', error);
    return [];
  }
}

// ===== PROMPT INJECTION =====

/**
 * Inject RAG context into an AI prompt.
 * Adds context before the user's message with source attribution.
 */
export function injectContextIntoPrompt(
  systemPrompt: string,
  userPrompt: string,
  ragContext: RagContext
): PromptWithRagContext {
  const contextBlock = ragContext.context
    ? `\n\n## Retrieved Context\n\nThe following information was retrieved from your knowledge base and may be relevant to the user's query. Use it to inform your response, and cite sources when appropriate.\n\n${ragContext.context}\n\n---\n`
    : '';

  const sourcesNote = ragContext.sources.length > 0
    ? `\nSources used: ${ragContext.sources.map((s) => s.source).join(', ')}`
    : '';

  return {
    systemPrompt: systemPrompt + contextBlock,
    userPrompt,
    context: ragContext.context,
    sources: ragContext.sources,
    totalTokens: ragContext.tokenCount + Math.ceil((systemPrompt + userPrompt).length * TOKENS_PER_CHAR),
  };
}

// ===== INGEST FUNCTIONS =====

export interface IngestResult {
  fileContextId: string;
  chunksCount: number;
}

/**
 * Ingest raw text into the RAG knowledge base.
 * Chunks the text, generates embeddings, and stores in the database.
 */
export async function ingestFromText(
  text: string,
  title: string,
  userId: string,
  options?: { leadId?: string }
): Promise<IngestResult> {
  const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const chunks = chunkDocument(text, documentId);

  // Generate embedding for the full document
  let embedding: number[] = [];
  try {
    embedding = await generateEmbedding(text.slice(0, 2000));
  } catch {
    console.warn('[RAG] Failed to generate embedding for text ingest');
  }

  const fileContext = await db.fileContext.create({
    data: {
      userId,
      leadId: options?.leadId || null,
      fileName: title,
      fileType: 'text',
      content: text,
      chunks: JSON.stringify(chunks),
      embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
    },
  });

  return {
    fileContextId: fileContext.id,
    chunksCount: chunks.length,
  };
}

/**
 * Ingest content from a URL into the RAG knowledge base.
 * Fetches the URL content, chunks it, generates embeddings, and stores.
 */
export async function ingestFromUrl(
  url: string,
  userId: string,
  options?: { leadId?: string }
): Promise<IngestResult> {
  // Fetch content from URL
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AcquisitionOS/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let text: string;

  if (contentType.includes('text/html')) {
    // Strip HTML tags for a basic text extraction
    const html = await response.text();
    text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    text = await response.text();
  }

  if (!text || text.length < 50) {
    throw new Error('Insufficient content extracted from URL');
  }

  const title = new URL(url).hostname + new URL(url).pathname;
  return ingestFromText(text, title, userId, options);
}

/**
 * Ingest CSV data into the RAG knowledge base.
 * Parses CSV rows into text chunks for embedding.
 */
export async function ingestFromCsv(
  csv: string,
  title: string,
  userId: string,
  options?: { leadId?: string }
): Promise<IngestResult> {
  // Simple CSV-to-text conversion: each row becomes a paragraph
  const lines = csv.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV is empty');
  }

  // Use header row to create named entries
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    return headers
      .map((h, i) => `${h}: ${values[i] || ''}`)
      .join('; ');
  });

  const text = rows.join('\n\n');
  return ingestFromText(text, title, userId, options);
}

// ===== CONTEXT WINDOW MANAGEMENT =====

/**
 * Manage context window to stay within token limits.
 * Prioritizes more recent and more relevant context.
 */
export function manageContextWindow(
  existingContext: string,
  newContent: string,
  maxTokens: number = MAX_CONTEXT_TOKENS
): {
  context: string;
  tokensUsed: number;
  wasTruncated: boolean;
} {
  const combined = existingContext ? `${existingContext}\n\n${newContent}` : newContent;
  const combinedTokens = Math.ceil(combined.length * TOKENS_PER_CHAR);

  if (combinedTokens <= maxTokens) {
    return {
      context: combined,
      tokensUsed: combinedTokens,
      wasTruncated: false,
    };
  }

  // Need to truncate — keep the newer content and trim older context
  const maxChars = Math.floor(maxTokens / TOKENS_PER_CHAR);

  if (newContent.length >= maxChars) {
    // New content alone exceeds limit — truncate it
    return {
      context: newContent.substring(0, maxChars),
      tokensUsed: maxTokens,
      wasTruncated: true,
    };
  }

  // Keep all new content, truncate older context
  const remainingChars = maxChars - newContent.length - 4; // -4 for separator
  const truncatedExisting = existingContext.substring(
    Math.max(0, existingContext.length - remainingChars)
  );

  return {
    context: truncatedExisting + '\n\n' + newContent,
    tokensUsed: maxTokens,
    wasTruncated: true,
  };
}
