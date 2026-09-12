// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/leads/scraping-metrics
// Phase 7 Remediation: Get scraping metrics dashboard data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getScrapingMetrics, getSourceHealthScore, getRateLimitStats } from '@/lib/scraping-metrics-service';
import { getObservabilityReport } from '@/lib/queue-observability-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const includeQueue = searchParams.get('includeQueue') === 'true';
      const source = searchParams.get('source');

      // Get scraping metrics summary
      const metrics = getScrapingMetrics();

      // Get source health scores (for known sources)
      const knownSources = [
        'ai_search', 'google_maps', 'google_business', 'justdial', 'indiamart',
        'yelp', 'yellow_pages', 'sulekha', 'linkedin', 'instagram', 'facebook',
        'csv_import',
      ];

      const sourceHealth = source
        ? [getSourceHealthScore(source)]
        : knownSources.map((s) => getSourceHealthScore(s)).filter((h) => h.totalRequests > 0);

      // Get rate limit stats
      const rateLimitStats = getRateLimitStats();

      // Optionally include queue observability
      let queueReport: ReturnType<typeof getObservabilityReport> | null = null;
      if (includeQueue) {
        queueReport = getObservabilityReport();
      }

      return NextResponse.json({
        metrics,
        sourceHealth,
        rateLimitStats,
        queueReport,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[API /leads/scraping-metrics] Error:', error);
      return NextResponse.json(
        { error: 'Failed to get scraping metrics' },
        { status: 500 }
      );
    }
  });
}
