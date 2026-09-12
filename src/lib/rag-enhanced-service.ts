// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Enhanced RAG Service with TF-IDF Search
// Phase 8+: Full document ingestion, keyword + TF-IDF based search
//
// Implements:
// - Lead data ingestion into RAG knowledge base
// - Research data ingestion
// - Document ingestion (from file upload)
// - TF-IDF based keyword search (since we use SQLite, no vector DB)
// - Auto-ingest on lead events
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { chunkDocument } from '@/lib/rag-service';

// ===== TYPES =====

export interface RAGQueryResult {
  results: RAGResultItem[];
  totalMatches: number;
  queryTimeMs: number;
}

export interface RAGResultItem {
  id: string;
  leadId: string | null;
  title: string;
  type: string;
  content: string;
  score: number;
  source: string | null;
  metadata: Record<string, unknown> | null;
  snippet: string;
}

export interface IngestDocumentInput {
  userId: string;
  content: string;
  title: string;
  type: string; // lead_data, research, communication, document
  leadId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

// ===== STOP WORDS for TF-IDF =====

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not',
  'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about',
  'also', 'into', 'over', 'after', 'before', 'between', 'under', 'above',
  'below', 'up', 'down', 'out', 'off', 'more', 'most', 'other', 'some',
  'such', 'only', 'own', 'same', 'its', 'our', 'their', 'your', 'my',
  'his', 'her', 'we', 'they', 'you', 'he', 'she', 'me', 'him', 'them',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all',
  'each', 'every', 'both', 'few', 'many', 'any', 'these', 'those',
]);

// ===== KEYWORD EXTRACTION =====

/**
 * Extract meaningful keywords from text.
 * Removes stop words, lowercases, and applies basic stemming.
 */
export function extractKeywords(text: string): string[] {
  // Tokenize: split on non-alphanumeric, keep words of length 2+
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const word of words) {
    // Basic suffix stripping for normalization
    const normalized = basicStem(word);
    freq.set(normalized, (freq.get(normalized) || 0) + 1);
  }

  // Return unique keywords sorted by frequency (descending)
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/**
 * Very basic stemming: strip common English suffixes.
 * Not as good as Porter stemmer but sufficient for keyword matching.
 */
function basicStem(word: string): string {
  if (word.length <= 4) return word;

  // Strip common suffixes (order matters)
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('tion') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('sion') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ment') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ness') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('able') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ible') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ful') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('less') && word.length > 6) return word.slice(0, -4);
  if (word.endsWith('ous') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ive') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);

  return word;
}

// ===== TF-IDF COMPUTATION =====

/**
 * Compute TF-IDF scores for a set of keywords against a document corpus.
 * TF = term frequency in this document
 * IDF = log(N / df) where N = total docs, df = docs containing term
 */
export async function computeTfIdf(
  keywords: string[],
  userId: string,
  leadId?: string,
): Promise<Record<string, number>> {
  if (keywords.length === 0) return {};

  try {
    // Get total document count for this user
    const totalDocs = await db.ragDocument.count({
      where: {
        userId,
        ...(leadId ? { leadId } : {}),
      },
    });

    if (totalDocs === 0) {
      // No existing docs: just return TF scores
      const tf: Record<string, number> = {};
      const uniqueKeywords = [...new Set(keywords)];
      const maxFreq = keywords.length;
      for (const kw of uniqueKeywords) {
        const count = keywords.filter((k) => k === kw).length;
        tf[kw] = count / maxFreq;
      }
      return tf;
    }

    // For each keyword, count how many documents contain it
    const tfidf: Record<string, number> = {};
    const uniqueKeywords = [...new Set(keywords)];
    const maxFreq = keywords.length;

    for (const keyword of uniqueKeywords) {
      // TF: frequency in this document
      const count = keywords.filter((k) => k === keyword).length;
      const tf = count / maxFreq;

      // DF: count documents containing this keyword
      const dfResult = await db.ragDocument.count({
        where: {
          userId,
          ...(leadId ? { leadId } : {}),
          keywords: { contains: keyword },
        },
      });

      // IDF: log((N + 1) / (df + 1)) + 1 (smoothed)
      const idf = Math.log((totalDocs + 1) / (dfResult + 1)) + 1;

      tfidf[keyword] = tf * idf;
    }

    return tfidf;
  } catch (error) {
    console.error('[RAG Enhanced] Failed to compute TF-IDF:', error);
    // Fallback: return TF scores only
    const tf: Record<string, number> = {};
    const maxFreq = keywords.length;
    for (const kw of [...new Set(keywords)]) {
      const count = keywords.filter((k) => k === kw).length;
      tf[kw] = count / maxFreq;
    }
    return tf;
  }
}

// ===== DOCUMENT CHUNKING FOR RAG =====

/**
 * Chunk content into searchable segments for the RAG knowledge base.
 */
function chunkForRAG(
  content: string,
  documentId: string,
  chunkSize = 800,
  overlap = 100,
): Array<{ content: string; chunkIndex: number }> {
  if (!content || content.trim().length === 0) return [];

  const docChunks = chunkDocument(content, documentId, { chunkSize, overlap });
  return docChunks.map((chunk, idx) => ({
    content: chunk.content,
    chunkIndex: idx,
  }));
}

// ===== INGEST LEAD DATA =====

/**
 * Ingest lead data into the RAG knowledge base.
 * Takes lead + analysis + communications + enrichment data.
 * Chunks it into searchable segments and stores with TF-IDF keywords.
 */
export async function ingestLeadData(leadId: string, userId: string): Promise<{ chunksCreated: number }> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      include: {
        leadAnalysis: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) {
      console.warn('[RAG Enhanced] Lead not found for ingestion:', leadId);
      return { chunksCreated: 0 };
    }

    // Build comprehensive lead content string
    const contentParts: string[] = [];

    // Lead details
    contentParts.push(`LEAD: ${lead.businessName}`);
    if (lead.ownerName) contentParts.push(`Owner: ${lead.ownerName}`);
    if (lead.niche) contentParts.push(`Niche: ${lead.niche}`);
    if (lead.city) contentParts.push(`City: ${lead.city}`);
    if (lead.country) contentParts.push(`Country: ${lead.country}`);
    if (lead.website) contentParts.push(`Website: ${lead.website}`);
    if (lead.email) contentParts.push(`Email: ${lead.email}`);
    if (lead.phone) contentParts.push(`Phone: ${lead.phone}`);
    contentParts.push(`Stage: ${lead.stage}`);
    contentParts.push(`Reply Score: ${lead.replyScore}`);
    contentParts.push(`Conversion Score: ${lead.conversionScore}`);
    contentParts.push(`Urgency Score: ${lead.urgencyScore}`);
    contentParts.push(`Revenue Potential: ${lead.revenuePotentialScore}`);

    if (lead.digitalWeaknesses) contentParts.push(`Digital Weaknesses: ${lead.digitalWeaknesses}`);
    if (lead.opportunityNotes) contentParts.push(`Opportunity Notes: ${lead.opportunityNotes}`);
    if (lead.outreachStyle) contentParts.push(`Outreach Style: ${lead.outreachStyle}`);
    if (lead.bestChannel) contentParts.push(`Best Channel: ${lead.bestChannel}`);
    if (lead.bestContactPerson) contentParts.push(`Best Contact: ${lead.bestContactPerson}`);
    if (lead.scoreReasoning) contentParts.push(`Score Reasoning: ${lead.scoreReasoning}`);

    // Tech stack
    if (lead.techStack) {
      try {
        const tech = JSON.parse(lead.techStack);
        if (Array.isArray(tech) && tech.length > 0) {
          contentParts.push(`Tech Stack: ${tech.join(', ')}`);
        }
      } catch { /* ignore */ }
    }

    // Lead analysis
    if (lead.leadAnalysis.length > 0) {
      const analysis = lead.leadAnalysis[0];
      contentParts.push(`\nANALYSIS:`);
      contentParts.push(`Website Quality Score: ${analysis.websiteQualityScore}/100`);
      contentParts.push(`Digital Maturity: ${analysis.digitalMaturityScore}/100`);
      if (analysis.weaknesses) {
        try {
          const weaknesses = JSON.parse(analysis.weaknesses);
          if (Array.isArray(weaknesses)) contentParts.push(`Weaknesses: ${weaknesses.join(', ')}`);
        } catch { /* ignore */ }
      }
      if (analysis.recommendedServices) {
        try {
          const services = JSON.parse(analysis.recommendedServices);
          if (Array.isArray(services)) contentParts.push(`Recommended Services: ${services.join(', ')}`);
        } catch { /* ignore */ }
      }
      if (analysis.closingStrategy) contentParts.push(`Closing Strategy: ${analysis.closingStrategy}`);
      if (analysis.decisionMaker) {
        try {
          const dm = JSON.parse(analysis.decisionMaker);
          if (dm.likelyName) contentParts.push(`Decision Maker: ${dm.likelyName} (${dm.likelyRole || 'Unknown role'})`);
        } catch { /* ignore */ }
      }
    }

    const fullContent = contentParts.join('\n');

    // Remove old lead data chunks
    await db.ragDocument.deleteMany({
      where: { leadId, type: 'lead_data', userId },
    });

    // Chunk and ingest
    const chunks = chunkForRAG(fullContent, `lead_${leadId}_data`);
    let chunksCreated = 0;

    for (const chunk of chunks) {
      const keywords = extractKeywords(chunk.content);
      const tfidfScores = await computeTfIdf(keywords, userId, leadId);

      await db.ragDocument.create({
        data: {
          userId,
          leadId,
          title: `Lead: ${lead.businessName}`,
          type: 'lead_data',
          content: chunk.content,
          keywords: JSON.stringify(keywords.slice(0, 50)), // Store top 50 keywords
          tfidfScores: JSON.stringify(tfidfScores),
          chunkIndex: chunk.chunkIndex,
          source: 'enrichment',
          metadata: JSON.stringify({ businessName: lead.businessName, stage: lead.stage }),
        },
      });
      chunksCreated++;
    }

    return { chunksCreated };
  } catch (error) {
    console.error('[RAG Enhanced] Failed to ingest lead data:', error);
    return { chunksCreated: 0 };
  }
}

// ===== INGEST RESEARCH DATA =====

/**
 * Ingest company research data into the RAG knowledge base.
 */
export async function ingestResearchData(
  leadId: string,
  userId: string,
  researchResult: Record<string, unknown>,
): Promise<{ chunksCreated: number }> {
  try {
    // Build research content string
    const contentParts: string[] = [];
    contentParts.push(`RESEARCH for lead ${leadId}:`);

    if (researchResult.businessModelAnalysis) {
      contentParts.push(`Business Model: ${researchResult.businessModelAnalysis}`);
    }
    if (Array.isArray(researchResult.techStack)) {
      contentParts.push(`Tech Stack: ${researchResult.techStack.join(', ')}`);
    }
    if (researchResult.seoQuality) contentParts.push(`SEO Quality: ${researchResult.seoQuality}`);
    if (researchResult.websiteQuality) contentParts.push(`Website Quality: ${researchResult.websiteQuality}`);
    if (researchResult.competitorComparison) {
      contentParts.push(`Competitor Comparison: ${researchResult.competitorComparison}`);
    }
    if (Array.isArray(researchResult.painPoints)) {
      contentParts.push(`Pain Points: ${researchResult.painPoints.join(', ')}`);
    }
    if (Array.isArray(researchResult.opportunities)) {
      contentParts.push(`Opportunities: ${researchResult.opportunities.join(', ')}`);
    }
    if (researchResult.recommendedAngle) {
      contentParts.push(`Recommended Angle: ${researchResult.recommendedAngle}`);
    }
    if (researchResult.estimatedDealSize) {
      contentParts.push(`Estimated Deal Size: ${researchResult.estimatedDealSize}`);
    }
    if (researchResult.urgencyLevel) {
      contentParts.push(`Urgency Level: ${researchResult.urgencyLevel}`);
    }

    const fullContent = contentParts.join('\n');
    if (!fullContent.trim()) return { chunksCreated: 0 };

    // Remove old research chunks for this lead
    await db.ragDocument.deleteMany({
      where: { leadId, type: 'research', userId },
    });

    // Chunk and ingest
    const chunks = chunkForRAG(fullContent, `research_${leadId}`);
    let chunksCreated = 0;

    for (const chunk of chunks) {
      const keywords = extractKeywords(chunk.content);
      const tfidfScores = await computeTfIdf(keywords, userId, leadId);

      await db.ragDocument.create({
        data: {
          userId,
          leadId,
          title: `Research: ${researchResult.businessModelAnalysis ? String(researchResult.businessModelAnalysis).slice(0, 60) : 'Company Research'}`,
          type: 'research',
          content: chunk.content,
          keywords: JSON.stringify(keywords.slice(0, 50)),
          tfidfScores: JSON.stringify(tfidfScores),
          chunkIndex: chunk.chunkIndex,
          source: 'research',
          metadata: JSON.stringify({ aiProvider: researchResult.aiProvider || 'z-ai' }),
        },
      });
      chunksCreated++;
    }

    return { chunksCreated };
  } catch (error) {
    console.error('[RAG Enhanced] Failed to ingest research data:', error);
    return { chunksCreated: 0 };
  }
}

// ===== INGEST DOCUMENT =====

/**
 * Ingest a document (from file upload) into the RAG knowledge base.
 */
export async function ingestDocument(
  userId: string,
  document: { content: string; title: string; type: string },
): Promise<{ chunksCreated: number }> {
  try {
    if (!document.content || document.content.trim().length === 0) {
      return { chunksCreated: 0 };
    }

    const docId = `doc_${Date.now()}`;
    const chunks = chunkForRAG(document.content, docId);
    let chunksCreated = 0;

    for (const chunk of chunks) {
      const keywords = extractKeywords(chunk.content);
      const tfidfScores = await computeTfIdf(keywords, userId);

      await db.ragDocument.create({
        data: {
          userId,
          leadId: null,
          title: document.title,
          type: document.type || 'document',
          content: chunk.content,
          keywords: JSON.stringify(keywords.slice(0, 50)),
          tfidfScores: JSON.stringify(tfidfScores),
          chunkIndex: chunk.chunkIndex,
          source: 'upload',
        },
      });
      chunksCreated++;
    }

    return { chunksCreated };
  } catch (error) {
    console.error('[RAG Enhanced] Failed to ingest document:', error);
    return { chunksCreated: 0 };
  }
}

// ===== INGEST COMMUNICATION =====

/**
 * Ingest a communication message into the RAG knowledge base.
 */
export async function ingestCommunication(
  leadId: string,
  userId: string,
  communication: { content: string; channel: string; direction: string; intent?: string },
): Promise<{ chunksCreated: number }> {
  try {
    if (!communication.content || communication.content.trim().length === 0) {
      return { chunksCreated: 0 };
    }

    const contentParts = [
      `COMMUNICATION (${communication.direction} via ${communication.channel}):`,
      communication.content,
    ];
    if (communication.intent) contentParts.push(`Intent: ${communication.intent}`);

    const fullContent = contentParts.join('\n');
    const keywords = extractKeywords(fullContent);
    const tfidfScores = await computeTfIdf(keywords, userId, leadId);

    await db.ragDocument.create({
      data: {
        userId,
        leadId,
        title: `Communication: ${communication.channel} ${communication.direction}`,
        type: 'communication',
        content: fullContent.substring(0, 5000), // Cap content length
        keywords: JSON.stringify(keywords.slice(0, 50)),
        tfidfScores: JSON.stringify(tfidfScores),
        chunkIndex: 0,
        source: 'communication',
        metadata: JSON.stringify({
          channel: communication.channel,
          direction: communication.direction,
          intent: communication.intent,
        }),
      },
    });

    return { chunksCreated: 1 };
  } catch (error) {
    console.error('[RAG Enhanced] Failed to ingest communication:', error);
    return { chunksCreated: 0 };
  }
}

// ===== QUERY RAG =====

/**
 * Query the RAG knowledge base using keyword + TF-IDF based search.
 * Returns relevant context chunks ranked by relevance.
 */
export async function queryRAG(params: {
  userId: string;
  query: string;
  leadId?: string;
  topK?: number;
}): Promise<RAGQueryResult> {
  const startTime = Date.now();
  const { userId, query, leadId, topK = 5 } = params;

  try {
    // Extract keywords from the query
    const queryKeywords = extractKeywords(query);

    if (queryKeywords.length === 0) {
      return { results: [], totalMatches: 0, queryTimeMs: Date.now() - startTime };
    }

    // Build where clause
    const where: Record<string, unknown> = { userId };
    if (leadId) where.leadId = leadId;

    // Fetch candidate documents
    const allDocs = await db.ragDocument.findMany({
      where,
      select: {
        id: true,
        leadId: true,
        title: true,
        type: true,
        content: true,
        keywords: true,
        tfidfScores: true,
        source: true,
        metadata: true,
      },
      take: 200, // Limit candidates
    });

    if (allDocs.length === 0) {
      return { results: [], totalMatches: 0, queryTimeMs: Date.now() - startTime };
    }

    // Score each document by keyword overlap + TF-IDF boost
    const scored: Array<{
      doc: typeof allDocs[0];
      score: number;
    }> = [];

    for (const doc of allDocs) {
      try {
        const docKeywords: string[] = JSON.parse(doc.keywords || '[]');
        const docTfIdf: Record<string, number> = JSON.parse(doc.tfidfScores || '{}');

        // Calculate keyword overlap score
        let matchCount = 0;
        let tfidfBoost = 0;

        for (const qkw of queryKeywords) {
          // Check for exact or partial match
          const matched = docKeywords.some(
            (dkw) => dkw === qkw || dkw.startsWith(qkw) || qkw.startsWith(dkw),
          );

          if (matched) {
            matchCount++;
            // Add TF-IDF boost for this keyword
            if (docTfIdf[qkw]) {
              tfidfBoost += docTfIdf[qkw];
            }
          }
        }

        if (matchCount === 0) continue;

        // Score = (overlap ratio) * 0.6 + (normalized TF-IDF boost) * 0.4
        const overlapRatio = matchCount / queryKeywords.length;
        const normalizedTfIdf = Math.min(tfidfBoost / (queryKeywords.length * 2), 1);
        const score = overlapRatio * 0.6 + normalizedTfIdf * 0.4;

        if (score > 0.05) { // Minimum relevance threshold
          scored.push({ doc, score });
        }
      } catch {
        continue;
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top K
    const topResults = scored.slice(0, topK);

    const results: RAGResultItem[] = topResults.map(({ doc, score }) => ({
      id: doc.id,
      leadId: doc.leadId,
      title: doc.title,
      type: doc.type,
      content: doc.content,
      score: Math.round(score * 1000) / 1000, // Round to 3 decimal places
      source: doc.source,
      metadata: doc.metadata ? (() => { try { return JSON.parse(doc.metadata); } catch { return null; } })() : null,
      snippet: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
    }));

    return {
      results,
      totalMatches: scored.length,
      queryTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[RAG Enhanced] Failed to query RAG:', error);
    return { results: [], totalMatches: 0, queryTimeMs: Date.now() - startTime };
  }
}
