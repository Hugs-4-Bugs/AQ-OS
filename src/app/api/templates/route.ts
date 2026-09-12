// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/POST /api/templates
// Phase 10: Message template management — list & create
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getTemplates,
  createTemplate,
  type TemplateChannel,
  type TemplateCategory,
} from '@/lib/message-template-service';

/**
 * GET /api/templates
 * List message templates with filters and pagination.
 * Query params: channel?, category?, search?, page?, limit?
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse filter params
      const channel = searchParams.get('channel') as TemplateChannel | null;
      const category = searchParams.get('category') as TemplateCategory | null;
      const search = searchParams.get('search');

      // Parse pagination params
      const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

      // Validate channel if provided
      const validChannels: TemplateChannel[] = ['email', 'telegram', 'whatsapp', 'linkedin', 'instagram'];
      if (channel && !validChannels.includes(channel)) {
        return NextResponse.json(
          { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate category if provided
      const validCategories: TemplateCategory[] = ['outreach', 'follow_up', 'introduction', 'reminder', 'custom'];
      if (category && !validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }

      // Build filters
      const filters: {
        channel?: TemplateChannel;
        category?: TemplateCategory;
        search?: string;
      } = {};

      if (channel) filters.channel = channel;
      if (category) filters.category = category;
      if (search) filters.search = search;

      // Fetch templates
      const result = await getTemplates(user.id, filters, { page, limit });

      return NextResponse.json(result);
    } catch (error) {
      console.error('[API /templates] GET Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/templates
 * Create a new message template.
 * Body: { name: string, channel: string, content: string, category?: string, subject?: string, variables?: string[] }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const { name, channel, content, category, subject, variables } = body as {
        name: string;
        channel: string;
        content: string;
        category?: string;
        subject?: string;
        variables?: string[];
      };

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Template name is required' },
          { status: 400 }
        );
      }

      if (!channel || typeof channel !== 'string') {
        return NextResponse.json(
          { error: 'Channel is required' },
          { status: 400 }
        );
      }

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json(
          { error: 'Template content is required' },
          { status: 400 }
        );
      }

      // Validate channel value
      const validChannels: TemplateChannel[] = ['email', 'telegram', 'whatsapp', 'linkedin', 'instagram'];
      if (!validChannels.includes(channel as TemplateChannel)) {
        return NextResponse.json(
          { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate category if provided
      const validCategories: TemplateCategory[] = ['outreach', 'follow_up', 'introduction', 'reminder', 'custom'];
      if (category && !validCategories.includes(category as TemplateCategory)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate variables if provided
      if (variables !== undefined && !Array.isArray(variables)) {
        return NextResponse.json(
          { error: 'Variables must be an array of strings' },
          { status: 400 }
        );
      }

      if (Array.isArray(variables)) {
        const hasInvalidVar = variables.some(
          (v) => typeof v !== 'string' || v.trim().length === 0
        );
        if (hasInvalidVar) {
          return NextResponse.json(
            { error: 'All variables must be non-empty strings' },
            { status: 400 }
          );
        }
      }

      // Create the template
      const result = await createTemplate(
        user.id,
        name.trim(),
        channel as TemplateChannel,
        content,
        category as TemplateCategory | undefined,
        subject,
        variables
      );

      if (!result.success) {
        const statusCode = result.error?.includes('already exists') ? 409 : 422;
        return NextResponse.json(
          {
            error: result.error || 'Failed to create template',
            validation: result.validation,
          },
          { status: statusCode }
        );
      }

      return NextResponse.json(
        {
          success: true,
          templateId: result.templateId,
          validation: result.validation,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('[API /templates] POST Error:', error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }
  });
}
