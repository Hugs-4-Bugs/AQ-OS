// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Formula Detail API Route
// GET: Get single formula
// PATCH: Update formula
// DELETE: Delete formula
// POST: Execute formula
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getFormula,
  updateFormula,
  deleteFormula,
  executeFormula,
  executeFormulaString,
  validateFormula,
} from '@/lib/metric-formulas-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/analytics/formulas/[id] — Get single formula */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const formula = await getFormula(id, user.id);

      if (!formula) {
        return NextResponse.json(
          { error: 'Formula not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        formula,
      });
    } catch (error) {
      console.error('Formula GET error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve formula' },
        { status: 500 }
      );
    }
  });
}

/** PATCH /api/analytics/formulas/[id] — Update formula */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { name, description, formula, variables, resultType, category, isPublic } = body;

      const result = await updateFormula(id, user.id, {
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
          { error: 'Failed to update formula', errors: result.errors },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        formula: result.formula,
      });
    } catch (error) {
      console.error('Formula PATCH error:', error);
      return NextResponse.json(
        { error: 'Failed to update formula' },
        { status: 500 }
      );
    }
  });
}

/** DELETE /api/analytics/formulas/[id] — Delete formula */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await deleteFormula(id, user.id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Formula deleted',
      });
    } catch (error) {
      console.error('Formula DELETE error:', error);
      return NextResponse.json(
        { error: 'Failed to delete formula' },
        { status: 500 }
      );
    }
  });
}

/** POST /api/analytics/formulas/[id] — Execute formula */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));

      // Check if this is a validation request
      if (body.action === 'validate') {
        const { formula: formulaString, variables } = body;
        if (!formulaString) {
          return NextResponse.json(
            { error: 'Formula string is required for validation' },
            { status: 400 }
          );
        }
        const validation = validateFormula(formulaString, variables);
        return NextResponse.json({
          success: true,
          validation,
        });
      }

      // Check if this is a raw formula execution (not stored)
      if (body.action === 'execute_raw') {
        const { formula: formulaString, variableValues } = body;
        if (!formulaString || !variableValues) {
          return NextResponse.json(
            { error: 'Formula and variableValues are required for raw execution' },
            { status: 400 }
          );
        }
        const result = await executeFormulaString(formulaString, variableValues, user.id);
        return NextResponse.json({
          success: true,
          result,
        });
      }

      // Default: execute stored formula
      const result = await executeFormula(id, user.id);

      return NextResponse.json({
        success: true,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute formula';
      console.error('Formula POST error:', error);
      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  });
}
