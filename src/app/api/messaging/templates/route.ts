// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Templates API Route
// Phase 10: GET/POST /api/messaging/templates
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createTemplate, listTemplatesByStatus } from '@/lib/template-approval-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const url = new URL(request.url);
      const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'active' | 'disabled' | null;
      const category = url.searchParams.get('category') as 'marketing' | 'utility' | 'authentication' | null;
      const page = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);

      const result = await listTemplatesByStatus(user.id, status || undefined, category || undefined, page, limit);

      return NextResponse.json({
        success: true,
        data: result.templates,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      console.error('Templates GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to list templates' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { name, category, content, language, variables, channel } = body;

      if (!name || !category || !content) {
        return NextResponse.json(
          { error: 'Missing required fields: name, category, content' },
          { status: 400 }
        );
      }

      const result = await createTemplate({
        userId: user.id,
        name,
        category,
        content,
        language,
        variables,
        channel,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        templateId: result.templateId,
      }, { status: 201 });
    } catch (error) {
      console.error('Templates POST route error:', error);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }
  });
}
