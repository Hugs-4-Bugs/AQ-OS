// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Prediction Detail API
// GET:   Retrieve a single prediction by ID
// PATCH: Actualize a prediction with the real outcome value
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { actualizePrediction } from '@/lib/predictive-analytics-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/analytics/predictions/[id]
 *
 * Retrieve a single prediction by its ID.
 * Only returns predictions belonging to the authenticated user.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const record = await db.analyticsPrediction.findUnique({
        where: { id },
      });

      if (!record) {
        return NextResponse.json(
          { error: 'Prediction not found' },
          { status: 404 }
        );
      }

      // Ensure the prediction belongs to the authenticated user
      if (record.userId !== user.id) {
        return NextResponse.json(
          { error: 'Prediction not found' },
          { status: 404 }
        );
      }

      // Parse inputData JSON
      const prediction = {
        id: record.id,
        userId: record.userId,
        category: record.category,
        predictionType: record.predictionType,
        targetEntityId: record.targetEntityId,
        predictedValue: record.predictedValue,
        confidence: record.confidence,
        modelVersion: record.modelVersion,
        inputData: record.inputData ? JSON.parse(record.inputData) : null,
        predictionHorizon: record.predictionHorizon,
        actualValue: record.actualValue,
        actualizedAt: record.actualizedAt,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };

      return NextResponse.json({ prediction });
    } catch (error) {
      console.error('[API /analytics/predictions/[id]] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch prediction' },
        { status: 500 }
      );
    }
  });
}

/**
 * PATCH /api/analytics/predictions/[id]
 *
 * Actualize a prediction by recording the actual outcome value.
 * This is used for model accuracy tracking — comparing predicted vs actual.
 *
 * Body:
 *   actualValue: number — The actual observed value for the prediction
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { actualValue } = body as { actualValue?: number };

      // ── Validate required field ──
      if (actualValue === undefined || actualValue === null || typeof actualValue !== 'number') {
        return NextResponse.json(
          { error: 'actualValue is required and must be a number' },
          { status: 400 }
        );
      }

      if (!isFinite(actualValue)) {
        return NextResponse.json(
          { error: 'actualValue must be a finite number' },
          { status: 400 }
        );
      }

      // ── Verify the prediction belongs to this user ──
      const existing = await db.analyticsPrediction.findUnique({
        where: { id },
        select: { userId: true, actualizedAt: true },
      });

      if (!existing || existing.userId !== user.id) {
        return NextResponse.json(
          { error: 'Prediction not found' },
          { status: 404 }
        );
      }

      // ── Check if already actualized ──
      if (existing.actualizedAt !== null) {
        return NextResponse.json(
          { error: 'Prediction has already been actualized. Overwriting is not allowed.' },
          { status: 409 }
        );
      }

      // ── Actualize via the engine ──
      const updated = await actualizePrediction(id, actualValue);

      if (!updated) {
        return NextResponse.json(
          { error: 'Failed to actualize prediction' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'Prediction actualized successfully',
        prediction: updated,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        );
      }
      console.error('[API /analytics/predictions/[id]] PATCH Error:', error);
      return NextResponse.json(
        { error: 'Failed to actualize prediction' },
        { status: 500 }
      );
    }
  });
}
