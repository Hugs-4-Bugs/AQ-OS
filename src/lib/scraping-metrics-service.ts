// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Scraping Metrics Service
// Phase 7 Remediation: Lead engine fixes
//
// Tracks scraping success/failure rates, response times,
// data quality scores, rate limit encounters, proxy performance,
// and generates dashboard data.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface ScrapingResultInput {
  source: string;
  success: boolean;
  responseTimeMs: number;
  dataQualityScore?: number; // 0-100
  proxyId?: string;
  errorType?: string;
  leadCount?: number;
  timestamp?: Date;
}

export interface ScrapingMetricsSummary {
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  avgDataQuality: number;
  rateLimitHits: number;
  errorBreakdown: Record<string, number>;
  recentTrend: 'improving' | 'stable' | 'degrading';
}

export interface SourceHealthScore {
  source: string;
  healthScore: number; // 0-100
  successRate: number;
  avgResponseTime: number;
  avgDataQuality: number;
  totalRequests: number;
  recentErrors: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

export interface RateLimitStats {
  totalHits: number;
  hitsBySource: Record<string, number>;
  hitsLast24h: number;
  avgCooldownMs: number;
  mostLimitedSources: Array<{ source: string; hits: number }>;
}

export interface ProxyPerformanceMetric {
  proxyId: string;
  proxyUrl: string;
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  errorRate: number;
  lastUsed: Date | null;
}

export interface DashboardData {
  summary: ScrapingMetricsSummary;
  sourceHealth: SourceHealthScore[];
  rateLimitStats: RateLimitStats;
  proxyPerformance: ProxyPerformanceMetric[];
  timeSeriesData: Array<{
    date: string;
    successRate: number;
    avgResponseTime: number;
    requests: number;
  }>;
}

// ===== IN-MEMORY METRICS STORE =====

interface MetricRecord {
  source: string;
  success: boolean;
  responseTimeMs: number;
  dataQualityScore: number;
  proxyId: string;
  errorType: string;
  leadCount: number;
  timestamp: Date;
}

// Rolling buffer of recent metrics (last 10,000 records)
const metricsBuffer: MetricRecord[] = [];
const MAX_BUFFER_SIZE = 10_000;

// Rate limit tracking
const rateLimitHits: Array<{ source: string; timestamp: Date }> = [];

// ===== CORE FUNCTIONS =====

/**
 * Record a scraping result and update metrics.
 */
export function recordScrapingResult(result: ScrapingResultInput): void {
  const record: MetricRecord = {
    source: result.source,
    success: result.success,
    responseTimeMs: result.responseTimeMs,
    dataQualityScore: result.dataQualityScore ?? (result.success ? 80 : 0),
    proxyId: result.proxyId || '',
    errorType: result.errorType || (result.success ? '' : 'unknown'),
    leadCount: result.leadCount || 0,
    timestamp: result.timestamp || new Date(),
  };

  // Track rate limit hits
  if (result.errorType === 'rate_limit' || result.errorType === '429') {
    rateLimitHits.push({ source: result.source, timestamp: record.timestamp });
  }

  // Add to buffer
  metricsBuffer.push(record);

  // Trim buffer if too large
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_BUFFER_SIZE);
  }

  // Also persist to database (async, non-blocking)
  persistMetricToDb(record).catch((err) => {
    console.error('[ScrapingMetrics] Failed to persist metric:', err);
  });
}

/**
 * Get comprehensive scraping metrics.
 */
export function getScrapingMetrics(
  timeRange?: { from: Date; to: Date }
): ScrapingMetricsSummary {
  const records = getFilteredRecords(timeRange);

  if (records.length === 0) {
    return {
      totalRequests: 0,
      successRate: 0,
      avgResponseTime: 0,
      avgDataQuality: 0,
      rateLimitHits: 0,
      errorBreakdown: {},
      recentTrend: 'stable',
    };
  }

  const successCount = records.filter((r) => r.success).length;
  const successRate = successCount / records.length;
  const avgResponseTime = records.reduce((sum, r) => sum + r.responseTimeMs, 0) / records.length;
  const avgDataQuality = records.reduce((sum, r) => sum + r.dataQualityScore, 0) / records.length;

  // Error breakdown
  const errorBreakdown: Record<string, number> = {};
  records.filter((r) => !r.success).forEach((r) => {
    const errType = r.errorType || 'unknown';
    errorBreakdown[errType] = (errorBreakdown[errType] || 0) + 1;
  });

  // Rate limit hits in time range
  const hits = rateLimitHits.filter(
    (h) => (!timeRange?.from || h.timestamp >= timeRange.from) &&
           (!timeRange?.to || h.timestamp <= timeRange.to)
  );

  // Calculate trend (compare recent half vs older half)
  const recentTrend = calculateTrend(records);

  return {
    totalRequests: records.length,
    successRate,
    avgResponseTime: Math.round(avgResponseTime),
    avgDataQuality: Math.round(avgDataQuality),
    rateLimitHits: hits.length,
    errorBreakdown,
    recentTrend,
  };
}

/**
 * Get health score for a specific source.
 */
export function getSourceHealthScore(source: string): SourceHealthScore {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentRecords = metricsBuffer.filter(
    (r) => r.source === source && r.timestamp >= oneHourAgo
  );

  const allSourceRecords = metricsBuffer.filter((r) => r.source === source);

  if (recentRecords.length === 0) {
    return {
      source,
      healthScore: 0,
      successRate: 0,
      avgResponseTime: 0,
      avgDataQuality: 0,
      totalRequests: allSourceRecords.length,
      recentErrors: 0,
      status: 'unhealthy',
    };
  }

  const successRate = recentRecords.filter((r) => r.success).length / recentRecords.length;
  const avgResponseTime = recentRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / recentRecords.length;
  const avgDataQuality = recentRecords.reduce((sum, r) => sum + r.dataQualityScore, 0) / recentRecords.length;
  const recentErrors = recentRecords.filter((r) => !r.success).length;

  // Calculate composite health score (0-100)
  const successWeight = 0.5;
  const qualityWeight = 0.25;
  const latencyWeight = 0.25;

  const latencyScore = Math.max(0, 100 - (avgResponseTime / 50)); // Penalize slow responses
  const healthScore = Math.round(
    successRate * 100 * successWeight +
    avgDataQuality * qualityWeight +
    latencyScore * latencyWeight
  );

  const status: SourceHealthScore['status'] =
    healthScore >= 70 ? 'healthy' :
    healthScore >= 40 ? 'degraded' :
    'unhealthy';

  return {
    source,
    healthScore,
    successRate,
    avgResponseTime: Math.round(avgResponseTime),
    avgDataQuality: Math.round(avgDataQuality),
    totalRequests: allSourceRecords.length,
    recentErrors,
    status,
  };
}

/**
 * Get rate limit statistics.
 */
export function getRateLimitStats(): RateLimitStats {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentHits = rateLimitHits.filter((h) => h.timestamp >= last24h);
  const olderHits = rateLimitHits.filter((h) => h.timestamp < last24h);

  // Clean up very old hits (older than 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oldIndex = rateLimitHits.findIndex((h) => h.timestamp >= sevenDaysAgo);
  if (oldIndex > 0) {
    rateLimitHits.splice(0, oldIndex);
  }

  // Hits by source
  const hitsBySource: Record<string, number> = {};
  recentHits.forEach((h) => {
    hitsBySource[h.source] = (hitsBySource[h.source] || 0) + 1;
  });

  // Most limited sources (top 5)
  const mostLimitedSources = Object.entries(hitsBySource)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([source, hits]) => ({ source, hits }));

  return {
    totalHits: rateLimitHits.length,
    hitsBySource,
    hitsLast24h: recentHits.length,
    avgCooldownMs: 5000, // Default cooldown assumption
    mostLimitedSources,
  };
}

/**
 * Generate scraping health dashboard data.
 */
export async function getScrapingDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get unique sources
  const sources = [...new Set(metricsBuffer.map((r) => r.source))];

  // Summary metrics
  const summary = getScrapingMetrics({ from: oneDayAgo, to: now });

  // Source health scores
  const sourceHealth = sources.map((source) => getSourceHealthScore(source));

  // Rate limit stats
  const rateLimitStats = getRateLimitStats();

  // Proxy performance
  const proxyIds = [...new Set(metricsBuffer.filter((r) => r.proxyId).map((r) => r.proxyId))];
  const proxyPerformance: ProxyPerformanceMetric[] = [];

  for (const proxyId of proxyIds) {
    const proxyRecords = metricsBuffer.filter((r) => r.proxyId === proxyId);
    if (proxyRecords.length === 0) continue;

    const proxy = await db.proxyEndpoint.findUnique({
      where: { id: proxyId },
      select: { url: true },
    });

    proxyPerformance.push({
      proxyId,
      proxyUrl: proxy?.url || 'unknown',
      totalRequests: proxyRecords.length,
      successRate: proxyRecords.filter((r) => r.success).length / proxyRecords.length,
      avgResponseTime: Math.round(
        proxyRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / proxyRecords.length
      ),
      errorRate: proxyRecords.filter((r) => !r.success).length / proxyRecords.length,
      lastUsed: proxyRecords[proxyRecords.length - 1]?.timestamp || null,
    });
  }

  // Time series data (hourly buckets for last 24h)
  const timeSeriesData = generateTimeSeriesData();

  return {
    summary,
    sourceHealth,
    rateLimitStats,
    proxyPerformance,
    timeSeriesData,
  };
}

// ===== HELPER FUNCTIONS =====

function getFilteredRecords(timeRange?: { from: Date; to: Date }): MetricRecord[] {
  if (!timeRange) return metricsBuffer;

  return metricsBuffer.filter(
    (r) => r.timestamp >= timeRange.from && r.timestamp <= timeRange.to
  );
}

function calculateTrend(records: MetricRecord[]): 'improving' | 'stable' | 'degrading' {
  if (records.length < 10) return 'stable';

  const midpoint = Math.floor(records.length / 2);
  const older = records.slice(0, midpoint);
  const newer = records.slice(midpoint);

  const olderSuccessRate = older.filter((r) => r.success).length / older.length;
  const newerSuccessRate = newer.filter((r) => r.success).length / newer.length;

  const diff = newerSuccessRate - olderSuccessRate;

  if (diff > 0.05) return 'improving';
  if (diff < -0.05) return 'degrading';
  return 'stable';
}

function generateTimeSeriesData(): Array<{
  date: string;
  successRate: number;
  avgResponseTime: number;
  requests: number;
}> {
  const now = new Date();
  const result: Array<{
    date: string;
    successRate: number;
    avgResponseTime: number;
    requests: number;
  }> = [];

  // Generate hourly buckets for the last 24 hours
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const hourRecords = metricsBuffer.filter(
      (r) => r.timestamp >= hourStart && r.timestamp < hourEnd
    );

    const requests = hourRecords.length;
    const successRate = requests > 0
      ? hourRecords.filter((r) => r.success).length / requests
      : 0;
    const avgResponseTime = requests > 0
      ? Math.round(hourRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / requests)
      : 0;

    result.push({
      date: hourStart.toISOString().split('T')[0] + ' ' + hourStart.toTimeString().split(' ')[0].substring(0, 5),
      successRate: Math.round(successRate * 100),
      avgResponseTime,
      requests,
    });
  }

  return result;
}

async function persistMetricToDb(record: MetricRecord): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Try to update existing record for today+source, or create new
    const existing = await db.scrapingMetric.findFirst({
      where: {
        source: record.source,
        date: today,
      },
    });

    if (existing) {
      const newTotal = existing.totalRequests + 1;
      const newSuccess = existing.successCount + (record.success ? 1 : 0);
      const newFail = existing.failCount + (record.success ? 0 : 1);
      const newRateLimit = existing.rateLimitHits + (record.errorType === 'rate_limit' ? 1 : 0);

      await db.scrapingMetric.update({
        where: { id: existing.id },
        data: {
          totalRequests: newTotal,
          successCount: newSuccess,
          failCount: newFail,
          rateLimitHits: newRateLimit,
          avgResponseTime: Math.round(
            (existing.avgResponseTime * existing.totalRequests + record.responseTimeMs) / newTotal
          ),
        },
      });
    } else {
      await db.scrapingMetric.create({
        data: {
          source: record.source,
          totalRequests: 1,
          successCount: record.success ? 1 : 0,
          failCount: record.success ? 0 : 1,
          avgResponseTime: record.responseTimeMs,
          rateLimitHits: record.errorType === 'rate_limit' ? 1 : 0,
          date: today,
        },
      });
    }
  } catch (err) {
    // Silently fail - metrics persistence is non-critical
    console.error('[ScrapingMetrics] DB persist failed:', err);
  }
}
