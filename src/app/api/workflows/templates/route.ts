// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Templates API Route
// Phase 12: List templates and instantiate from template
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getTemplateCategories,
  listTemplates,
  getTemplate,
  instantiateTemplate,
  seedTemplates,
} from '@/lib/workflow-templates';

// ─── GET: List templates / categories ─────────────────────

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');

      // Ensure templates are seeded
      await seedTemplates();

      if (action === 'categories') {
        const categories = await getTemplateCategories();
        return NextResponse.json({ categories });
      }

      if (action === 'detail') {
        const templateId = searchParams.get('templateId');
        if (!templateId) {
          return NextResponse.json(
            { error: 'templateId is required for detail action' },
            { status: 400 }
          );
        }

        const template = await getTemplate(templateId);
        if (!template) {
          return NextResponse.json(
            { error: 'Template not found' },
            { status: 404 }
          );
        }

        return NextResponse.json(template);
      }

      // Default: list templates
      const category = searchParams.get('category') || undefined;
      const templates = await listTemplates(category);
      return NextResponse.json({ templates });
    } catch (error) {
      console.error('[WorkflowTemplatesAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }
  });
}

// ─── POST: Instantiate a template ─────────────────────────

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { templateId, customizations } = body as {
        templateId?: string;
        customizations?: {
          name?: string;
          description?: string;
          triggerConfig?: Record<string, unknown>;
          nodeOverrides?: Record<string, Record<string, unknown>>;
        };
      };

      if (!templateId) {
        return NextResponse.json(
          { error: 'templateId is required' },
          { status: 400 }
        );
      }

      // Ensure templates are seeded
      await seedTemplates();

      const result = await instantiateTemplate(templateId, user.id, customizations);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: true, workflowId: result.workflowId },
        { status: 201 }
      );
    } catch (error) {
      console.error('[WorkflowTemplatesAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
  });
}
