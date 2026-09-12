// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Formulas API Route
// GET: Return user's formulas
// POST: Create new formula
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getUserFormulas, createFormula } from '@/lib/metric-formulas-engine';

/** GET /api/analytics/formulas — Return user's formulas */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const formulas = await getUserFormulas(user.id);

      return NextResponse.json({
        success: true,
        formulas,
        count: formulas.length,
      });
    } catch (error) {
      console.error('Formulas GET error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve formulas' },
        { status: 500 }
      );
    }
  });
}

/** POST /api/analytics/formulas — Create new formula */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { name, description, formula, variables, resultType, category, isPublic } = body;

      if (!name || !formula) {
        return NextResponse.json(
          { error: 'Name and formula are required' },
          { status: 400 }
        );
      }

      const result = await createFormula(user.id, {
        name,
        description,
        formula,
        variables,
        resultType,
        category,
        isPublic,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: 'Formula validation failed', errors: result.errors },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        formula: result.formula,
      }, { status: 201 });
    } catch (error) {
      console.error('Formulas POST error:', error);
      return NextResponse.json(
        { error: 'Failed to create formula' },
        { status: 500 }
      );
    }
  });
}
