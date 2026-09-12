// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prompt Evaluation Service
// Phase 8: AI Fixes — Prompt Versioning, A/B Testing, Quality Metrics
//
// Manages prompt templates with:
// - Version tracking
// - A/B testing of prompt variants
// - Response quality evaluation (latency, relevance, token efficiency)
// - Prompt version comparison
// - Rollback to previous versions
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface PromptTemplateData {
  id: string;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  metadata: string; // JSON
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptVariant {
  name: string;
  version: number;
  content: string;
  variantLabel: string; // e.g., "A", "B"
}

export interface EvaluationMetrics {
  latencyMs: number;
  relevanceScore: number; // 0-1
  tokenEfficiency: number; // output tokens / input tokens ratio
  outputTokens: number;
  inputTokens: number;
  errorRate: number;
}

export interface PromptComparison {
  versionA: number;
  versionB: number;
  metricsA: EvaluationMetrics;
  metricsB: EvaluationMetrics;
  winner: 'A' | 'B' | 'tie' | 'inconclusive';
  confidenceLevel: number;
}

export interface PromptAnalytics {
  name: string;
  totalVersions: number;
  activeVersion: number;
  totalEvaluations: number;
  averageLatency: number;
  averageRelevance: number;
  averageTokenEfficiency: number;
  recentTrend: 'improving' | 'declining' | 'stable';
}

// ===== IN-MEMORY EVALUATION CACHE =====

interface EvaluationRecord {
  promptName: string;
  version: number;
  timestamp: Date;
  metrics: EvaluationMetrics;
}

const evaluationCache: EvaluationRecord[] = [];
const MAX_CACHE_SIZE = 1000;

// ===== CORE FUNCTIONS =====

/**
 * Store a new prompt template version.
 * If a prompt with the same name exists, increments the version.
 * Optionally marks it as active.
 */
export async function storePromptTemplate(params: {
  name: string;
  content: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<PromptTemplateData> {
  const { name, content, isActive = true, metadata = {} } = params;

  // Find the latest version for this name
  const existing = await db.promptTemplate.findFirst({
    where: { name },
    orderBy: { version: 'desc' },
  });

  const nextVersion = existing ? existing.version + 1 : 1;

  // If setting as active, deactivate other versions
  if (isActive) {
    await db.promptTemplate.updateMany({
      where: { name, isActive: true },
      data: { isActive: false },
    });
  }

  const template = await db.promptTemplate.create({
    data: {
      name,
      version: nextVersion,
      content,
      isActive,
      metadata: JSON.stringify(metadata),
    },
  });

  return template;
}

/**
 * Evaluate a response against expected quality metrics.
 * Returns metrics for latency, relevance, and efficiency.
 */
export function evaluateResponse(params: {
  promptName: string;
  promptVersion: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  responseContent: string;
  expectedContent?: string;
  hadError?: boolean;
}): EvaluationMetrics {
  const { inputTokens, outputTokens, latencyMs, responseContent, expectedContent, hadError } = params;

  // Calculate relevance score
  let relevanceScore = 0.5; // Default neutral score
  if (expectedContent && responseContent) {
    relevanceScore = calculateRelevance(responseContent, expectedContent);
  } else if (responseContent) {
    // Heuristic: longer, more structured responses tend to be more relevant
    const length = responseContent.length;
    const hasStructure = /[\n#*{}[\]]/.test(responseContent);
    const isNotEmpty = length > 50;

    relevanceScore = Math.min(1, (isNotEmpty ? 0.4 : 0) + (hasStructure ? 0.3 : 0) + Math.min(0.3, length / 1000));
  }

  // Calculate token efficiency
  const tokenEfficiency = inputTokens > 0 ? outputTokens / inputTokens : 0;

  const metrics: EvaluationMetrics = {
    latencyMs,
    relevanceScore: Math.round(relevanceScore * 100) / 100,
    tokenEfficiency: Math.round(tokenEfficiency * 100) / 100,
    outputTokens,
    inputTokens,
    errorRate: hadError ? 1 : 0,
  };

  // Cache the evaluation
  evaluationCache.push({
    promptName: params.promptName,
    version: params.promptVersion,
    timestamp: new Date(),
    metrics,
  });

  // Trim cache if too large
  if (evaluationCache.length > MAX_CACHE_SIZE) {
    evaluationCache.splice(0, evaluationCache.length - MAX_CACHE_SIZE);
  }

  return metrics;
}

/**
 * Compare two prompt versions based on their evaluation metrics.
 */
export async function comparePromptVersions(
  name: string,
  versionA: number,
  versionB: number
): Promise<PromptComparison> {
  // Get evaluation records for both versions
  const recordsA = evaluationCache.filter(
    (r) => r.promptName === name && r.version === versionA
  );
  const recordsB = evaluationCache.filter(
    (r) => r.promptName === name && r.version === versionB
  );

  const metricsA = aggregateMetrics(recordsA.map((r) => r.metrics));
  const metricsB = aggregateMetrics(recordsB.map((r) => r.metrics));

  // Determine winner based on composite score
  const scoreA = compositeScore(metricsA);
  const scoreB = compositeScore(metricsB);

  let winner: 'A' | 'B' | 'tie' | 'inconclusive';
  let confidenceLevel: number;

  const diff = Math.abs(scoreA - scoreB);
  if (diff < 0.05) {
    winner = 'tie';
    confidenceLevel = 0.5;
  } else if (recordsA.length < 5 || recordsB.length < 5) {
    winner = scoreA > scoreB ? 'A' : 'B';
    confidenceLevel = 0.3; // Low confidence with few samples
  } else {
    winner = scoreA > scoreB ? 'A' : 'B';
    confidenceLevel = Math.min(1, diff * 5); // Higher diff = higher confidence
  }

  return {
    versionA,
    versionB,
    metricsA,
    metricsB,
    winner,
    confidenceLevel: Math.round(confidenceLevel * 100) / 100,
  };
}

/**
 * Get analytics for a specific prompt.
 */
export async function getPromptAnalytics(name: string): Promise<PromptAnalytics> {
  // Get template info from database
  const templates = await db.promptTemplate.findMany({
    where: { name },
    orderBy: { version: 'desc' },
  });

  const activeTemplate = templates.find((t) => t.isActive);

  // Get evaluation records
  const records = evaluationCache.filter((r) => r.promptName === name);
  const metrics = records.map((r) => r.metrics);

  // Calculate trend
  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (metrics.length >= 4) {
    const half = Math.floor(metrics.length / 2);
    const firstHalf = aggregateMetrics(metrics.slice(0, half));
    const secondHalf = aggregateMetrics(metrics.slice(half));
    const diff = compositeScore(secondHalf) - compositeScore(firstHalf);
    if (diff > 0.05) recentTrend = 'improving';
    else if (diff < -0.05) recentTrend = 'declining';
  }

  const avgMetrics = aggregateMetrics(metrics);

  return {
    name,
    totalVersions: templates.length,
    activeVersion: activeTemplate?.version || 0,
    totalEvaluations: records.length,
    averageLatency: avgMetrics.latencyMs,
    averageRelevance: avgMetrics.relevanceScore,
    averageTokenEfficiency: avgMetrics.tokenEfficiency,
    recentTrend,
  };
}

/**
 * Rollback to a previous prompt version.
 * Deactivates current version and activates the target version.
 */
export async function rollbackPrompt(
  name: string,
  targetVersion: number
): Promise<{ success: boolean; message: string }> {
  try {
    // Verify target version exists
    const targetTemplate = await db.promptTemplate.findFirst({
      where: { name, version: targetVersion },
    });

    if (!targetTemplate) {
      return { success: false, message: `Version ${targetVersion} not found for prompt "${name}"` };
    }

    // Deactivate all versions
    await db.promptTemplate.updateMany({
      where: { name },
      data: { isActive: false },
    });

    // Activate target version
    await db.promptTemplate.update({
      where: { id: targetTemplate.id },
      data: { isActive: true },
    });

    return {
      success: true,
      message: `Rolled back prompt "${name}" to version ${targetVersion}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PromptEval] Rollback failed:', error);
    return { success: false, message };
  }
}

/**
 * Get the active prompt template by name.
 */
export async function getActivePrompt(name: string): Promise<PromptTemplateData | null> {
  return db.promptTemplate.findFirst({
    where: { name, isActive: true },
  });
}

/**
 * List all prompt templates, optionally filtered by name.
 */
export async function listPromptTemplates(name?: string): Promise<PromptTemplateData[]> {
  const where = name ? { name } : {};
  return db.promptTemplate.findMany({
    where,
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });
}

// ===== INTERNAL HELPERS =====

function calculateRelevance(response: string, expected: string): number {
  // Simple word overlap relevance score
  const responseWords = new Set(response.toLowerCase().split(/\s+/));
  const expectedWords = new Set(expected.toLowerCase().split(/\s+/));

  let overlap = 0;
  for (const word of expectedWords) {
    if (responseWords.has(word)) overlap++;
  }

  // Also check for key phrases (2-3 word n-grams)
  const responseTrigrams = getTrigrams(response.toLowerCase());
  const expectedTrigrams = getTrigrams(expected.toLowerCase());
  let trigramOverlap = 0;
  for (const tri of expectedTrigrams) {
    if (responseTrigrams.has(tri)) trigramOverlap++;
  }

  const wordScore = expectedWords.size > 0 ? overlap / expectedWords.size : 0;
  const trigramScore = expectedTrigrams.size > 0 ? trigramOverlap / expectedTrigrams.size : 0;

  // Weighted combination
  return wordScore * 0.4 + trigramScore * 0.6;
}

function getTrigrams(text: string): Set<string> {
  const words = text.split(/\s+/).filter((w) => w.length > 2);
  const trigrams = new Set<string>();
  for (let i = 0; i < words.length - 2; i++) {
    trigrams.add(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
  }
  return trigrams;
}

function aggregateMetrics(metrics: EvaluationMetrics[]): EvaluationMetrics {
  if (metrics.length === 0) {
    return {
      latencyMs: 0,
      relevanceScore: 0,
      tokenEfficiency: 0,
      outputTokens: 0,
      inputTokens: 0,
      errorRate: 0,
    };
  }

  const sum = metrics.reduce(
    (acc, m) => ({
      latencyMs: acc.latencyMs + m.latencyMs,
      relevanceScore: acc.relevanceScore + m.relevanceScore,
      tokenEfficiency: acc.tokenEfficiency + m.tokenEfficiency,
      outputTokens: acc.outputTokens + m.outputTokens,
      inputTokens: acc.inputTokens + m.inputTokens,
      errorRate: acc.errorRate + m.errorRate,
    }),
    { latencyMs: 0, relevanceScore: 0, tokenEfficiency: 0, outputTokens: 0, inputTokens: 0, errorRate: 0 }
  );

  const n = metrics.length;
  return {
    latencyMs: Math.round(sum.latencyMs / n),
    relevanceScore: Math.round((sum.relevanceScore / n) * 100) / 100,
    tokenEfficiency: Math.round((sum.tokenEfficiency / n) * 100) / 100,
    outputTokens: Math.round(sum.outputTokens / n),
    inputTokens: Math.round(sum.inputTokens / n),
    errorRate: Math.round((sum.errorRate / n) * 100) / 100,
  };
}

function compositeScore(metrics: EvaluationMetrics): number {
  // Weighted composite: relevance (40%) + efficiency (20%) + speed (20%) + reliability (20%)
  const relevanceNorm = metrics.relevanceScore; // Already 0-1
  const efficiencyNorm = Math.min(1, metrics.tokenEfficiency / 2); // Normalize, cap at 1
  const speedNorm = Math.max(0, 1 - metrics.latencyMs / 10000); // Faster = better, 10s = 0
  const reliabilityNorm = 1 - metrics.errorRate; // No errors = 1

  return relevanceNorm * 0.4 + efficiencyNorm * 0.2 + speedNorm * 0.2 + reliabilityNorm * 0.2;
}
