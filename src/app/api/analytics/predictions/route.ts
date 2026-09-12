// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Predictions API
// GET:  List predictions with optional filters
// POST: Generate predictions (single category or all)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  generateAllPredictions,
  getPredictions,
  predictConversionProbability,
  predictCloseProbability,
  predictExpectedRevenue,
  predictLeadVelocity,
  predictFutureUsage,
  predictFutureCredits,
  predictProviderCostForecast,
  predictChurn,
  predictUpgradeProbability,
  predictRenewalRisk,
  predictFailureProbability,
  predictRetryProbability,
  predictThroughput,
  type PredictionCategory,
  type PredictionType,
  type PredictionResult,
} from '@/lib/predictive-analytics-engine';

// ── Valid values for filters ──

const VALID_CATEGORIES: PredictionCategory[] = ['lead', 'ai', 'billing', 'workflow'];

const VALID_PREDICTION_TYPES: PredictionType[] = [
  'conversion_probability',
  'close_probability',
  'expected_revenue',
  'lead_velocity',
  'future_usage',
  'future_credits',
  'cost_forecast',
  'churn_prediction',
  'upgrade_probability',
  'renewal_risk',
  'failure_probability',
  'retry_probability',
  'throughput_prediction',
];

/**
 * GET /api/analytics/predictions
 *
 * Query params:
 *   category?         — Filter by prediction category (lead | ai | billing | workflow)
 *   predictionType?   — Filter by specific prediction type
 *   limit?            — Max results (1–200, default 50)
 *   includeExpired?   — Include expired predictions (default false)
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // ── Parse & validate filters ──
      const category = searchParams.get('category') as PredictionCategory | null;
      const predictionType = searchParams.get('predictionType') as PredictionType | null;
      const limitParam = searchParams.get('limit');
      const includeExpired = searchParams.get('includeExpired') === 'true';

      if (category && !VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }

      if (predictionType && !VALID_PREDICTION_TYPES.includes(predictionType)) {
        return NextResponse.json(
          { error: `Invalid predictionType. Must be one of: ${VALID_PREDICTION_TYPES.join(', ')}` },
          { status: 400 }
        );
      }

      const limit = Math.min(200, Math.max(1, parseInt(limitParam || '50')));

      // ── If includeExpired is true, query the DB directly with relaxed filters ──
      if (includeExpired) {
        const where: Record<string, unknown> = { userId: user.id };
        if (category) where.category = category;
        if (predictionType) where.predictionType = predictionType;

        const records = await db.analyticsPrediction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        const predictions = records.map((r) => ({
          id: r.id,
          userId: r.userId,
          category: r.category,
          predictionType: r.predictionType,
          targetEntityId: r.targetEntityId,
          predictedValue: r.predictedValue,
          confidence: r.confidence,
          modelVersion: r.modelVersion,
          inputData: r.inputData ? JSON.parse(r.inputData) : null,
          predictionHorizon: r.predictionHorizon,
          actualValue: r.actualValue,
          actualizedAt: r.actualizedAt,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));

        return NextResponse.json({
          predictions,
          count: predictions.length,
          filters: { category, predictionType, includeExpired, limit },
        });
      }

      // ── Default: use engine's getPredictions (excludes expired by design) ──
      const predictions: PredictionResult[] = await getPredictions(
        user.id,
        category ?? undefined,
        predictionType ?? undefined
      );

      // Apply limit after fetching
      const limited = predictions.slice(0, limit);

      return NextResponse.json({
        predictions: limited,
        count: limited.length,
        totalAvailable: predictions.length,
        filters: { category, predictionType, includeExpired, limit },
      });
    } catch (error) {
      console.error('[API /analytics/predictions] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch predictions' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/analytics/predictions
 *
 * Body:
 *   category?      — Generate predictions for a specific category only
 *   generateAll?   — If true, run all prediction categories
 *
 * If neither is provided, returns a 400 error.
 * If generateAll is true, category is ignored.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { category, generateAll } = body as {
        category?: string;
        generateAll?: boolean;
      };

      // ── Validate: must specify either generateAll or a category ──
      if (!generateAll && !category) {
        return NextResponse.json(
          { error: 'Provide either "category" for a specific category or "generateAll": true for all predictions' },
          { status: 400 }
        );
      }

      // ── Generate all predictions ──
      if (generateAll) {
        const predictions = await generateAllPredictions(user.id);
        return NextResponse.json(
          {
            success: true,
            generated: predictions.length,
            predictions,
          },
          { status: 201 }
        );
      }

      // ── Generate predictions for a specific category ──
      if (category && !VALID_CATEGORIES.includes(category as PredictionCategory)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }

      const predictions: PredictionResult[] = [];
      const errors: { category: string; error: string }[] = [];

      switch (category as PredictionCategory) {
        case 'lead': {
          // Per-lead predictions for advanced-stage leads
          try {
            const userOrg = await db.user.findUnique({
              where: { id: user.id },
              select: { orgId: true },
            });

            const activeLeads = await db.lead.findMany({
              where: {
                isActive: true,
                OR: [{ userId: user.id }, ...(userOrg?.orgId ? [{ orgId: userOrg.orgId }] : [])],
                stage: { in: ['interested', 'negotiation', 'proposal_sent'] },
              },
              select: { id: true },
              take: 20,
              orderBy: { conversionScore: 'desc' },
            });

            for (const lead of activeLeads) {
              try {
                predictions.push(await predictConversionProbability(user.id, lead.id));
                predictions.push(await predictCloseProbability(user.id, lead.id));
              } catch (e) {
                errors.push({ category: `lead:${lead.id}`, error: String(e) });
              }
            }
          } catch (e) {
            errors.push({ category: 'lead:query', error: String(e) });
          }

          // Pipeline-level lead predictions
          try {
            predictions.push(await predictExpectedRevenue(user.id));
          } catch (e) {
            errors.push({ category: 'expected_revenue', error: String(e) });
          }

          try {
            predictions.push(await predictLeadVelocity(user.id));
          } catch (e) {
            errors.push({ category: 'lead_velocity', error: String(e) });
          }
          break;
        }

        case 'ai': {
          try {
            predictions.push(await predictFutureUsage(user.id));
          } catch (e) {
            errors.push({ category: 'future_usage', error: String(e) });
          }

          try {
            predictions.push(await predictFutureCredits(user.id));
          } catch (e) {
            errors.push({ category: 'future_credits', error: String(e) });
          }

          try {
            predictions.push(await predictProviderCostForecast(user.id));
          } catch (e) {
            errors.push({ category: 'cost_forecast', error: String(e) });
          }
          break;
        }

        case 'billing': {
          try {
            predictions.push(await predictChurn(user.id));
          } catch (e) {
            errors.push({ category: 'churn', error: String(e) });
          }

          try {
            predictions.push(await predictUpgradeProbability(user.id));
          } catch (e) {
            errors.push({ category: 'upgrade_prob', error: String(e) });
          }

          try {
            predictions.push(await predictRenewalRisk(user.id));
          } catch (e) {
            errors.push({ category: 'renewal_risk', error: String(e) });
          }
          break;
        }

        case 'workflow': {
          try {
            const workflows = await db.workflowDefinition.findMany({
              where: { userId: user.id, status: 'active' },
              select: { id: true },
              take: 20,
            });

            for (const wf of workflows) {
              try {
                predictions.push(await predictFailureProbability(user.id, wf.id));
                predictions.push(await predictRetryProbability(user.id, wf.id));
              } catch (e) {
                errors.push({ category: `workflow:${wf.id}`, error: String(e) });
              }
            }
          } catch (e) {
            errors.push({ category: 'workflow:query', error: String(e) });
          }

          try {
            predictions.push(await predictThroughput(user.id));
          } catch (e) {
            errors.push({ category: 'throughput', error: String(e) });
          }
          break;
        }
      }

      if (errors.length > 0) {
        console.warn('[API /analytics/predictions] Category generation errors:', errors);
      }

      return NextResponse.json(
        {
          success: true,
          category,
          generated: predictions.length,
          predictions,
          ...(errors.length > 0 ? { errors } : {}),
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        );
      }
      console.error('[API /analytics/predictions] POST Error:', error);
      return NextResponse.json(
        { error: 'Failed to generate predictions' },
        { status: 500 }
      );
    }
  });
}
