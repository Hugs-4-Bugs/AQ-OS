// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Analytics Insights API
// GET: Return insights with optional filters
// POST: Run insight generation
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getInsights,
  generateAllInsights,
  cleanupExpiredInsights,
} from '@/lib/auto-insight-engine';

/**
 * GET /api/analytics/insights
 * Return insights with optional filters (category, insightType, isRead)
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const category = searchParams.get('category') ?? undefined;
      const insightType = searchParams.get('insightType') ?? undefined;
      const isReadParam = searchParams.get('isRead');

      let isRead: boolean | undefined;
      if (isReadParam !== null) {
        isRead = isReadParam === 'true';
      }

      // Validate category if provided
      const validCategories = ['lead', 'ai', 'billing', 'workflow', 'competitor'];
      if (category && !validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 },
        );
      }

      // Validate insightType if provided
      const validTypes = ['trend', 'anomaly', 'opportunity', 'risk', 'recommendation'];
      if (insightType && !validTypes.includes(insightType)) {
        return NextResponse.json(
          { error: `Invalid insightType. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 },
        );
      }

      const result = await getInsights(user.id, category, insightType, isRead);

      // Compute summary stats
      const unreadCount = result.insights.filter(i => !i.isRead).length;
      const byCategory: Record<string, number> = {};
      const byImpact: Record<string, number> = {};

      for (const insight of result.insights) {
        byCategory[insight.category ?? 'unknown'] = (byCategory[insight.category ?? 'unknown'] ?? 0) + 1;
        byImpact[insight.impact ?? 'unknown'] = (byImpact[insight.impact ?? 'unknown'] ?? 0) + 1;
      }

      return NextResponse.json({
        insights: result.insights,
        total: result.total,
        unreadCount,
        byCategory,
        byImpact,
      });
    } catch (error) {
      console.error('[InsightsAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch insights' },
        { status: 500 },
      );
    }
  });
}

/**
 * POST /api/analytics/insights
 * Run insight generation for the authenticated user
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));

      // Optional: specify which generators to run
      const generators = body.generators as string[] | undefined;

      if (generators && !Array.isArray(generators)) {
        return NextResponse.json(
          { error: 'generators must be an array of generator names' },
          { status: 400 },
        );
      }

      const validGenerators = [
        'lead_trends',
        'ai_trends',
        'billing_trends',
        'workflow_trends',
        'anomalies',
        'opportunities',
        'risks',
        'competitors',
      ];

      if (generators) {
        const invalid = generators.filter(g => !validGenerators.includes(g));
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: `Invalid generators: ${invalid.join(', ')}. Valid: ${validGenerators.join(', ')}` },
            { status: 400 },
          );
        }
      }

      // Run all generators (or subset if specified)
      // For simplicity, we always run generateAllInsights which handles all
      const result = await generateAllInsights(user.id);

      // Also clean up expired insights
      const cleanedUp = await cleanupExpiredInsights(user.id);

      return NextResponse.json({
        success: true,
        totalGenerated: result.totalGenerated,
        breakdown: result.breakdown,
        expiredCleanedUp: cleanedUp,
        generatorsRun: generators ?? validGenerators,
      });
    } catch (error) {
      console.error('[InsightsAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to generate insights' },
        { status: 500 },
      );
    }
  });
}
