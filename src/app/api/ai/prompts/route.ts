// GET /api/ai/prompts — List prompt templates
// POST /api/ai/prompts — Create/update prompt template

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import {
  storePromptTemplate,
  listPromptTemplates,
  getPromptAnalytics,
  rollbackPrompt,
  comparePromptVersions,
} from '@/lib/prompt-evaluation';

export async function GET(request: NextRequest) {
  return withPermission(request, 'assistant:read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const name = searchParams.get('name') || undefined;
      const action = searchParams.get('action') || 'list'; // 'list', 'analytics', 'compare'

      switch (action) {
        case 'list': {
          const templates = await listPromptTemplates(name);
          return NextResponse.json({
            templates,
            total: templates.length,
          });
        }

        case 'analytics': {
          if (!name) {
            return NextResponse.json(
              { error: 'name query parameter is required for analytics' },
              { status: 400 }
            );
          }
          const analytics = await getPromptAnalytics(name);
          return NextResponse.json(analytics);
        }

        case 'compare': {
          if (!name) {
            return NextResponse.json(
              { error: 'name query parameter is required for comparison' },
              { status: 400 }
            );
          }
          const versionA = parseInt(searchParams.get('versionA') || '0', 10);
          const versionB = parseInt(searchParams.get('versionB') || '0', 10);

          if (!versionA || !versionB) {
            return NextResponse.json(
              { error: 'versionA and versionB query parameters are required' },
              { status: 400 }
            );
          }

          const comparison = await comparePromptVersions(name, versionA, versionB);
          return NextResponse.json(comparison);
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action. Use: list, analytics, compare' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[AI Prompts API] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get prompt templates' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withPermission(request, 'assistant:read', async () => {
    try {
      const body = await request.json();
      const { action, name, content, isActive, metadata, targetVersion } = body;

      if (!action) {
        return NextResponse.json(
          { error: 'action is required (store, rollback)' },
          { status: 400 }
        );
      }

      switch (action) {
        case 'store': {
          if (!name || !content) {
            return NextResponse.json(
              { error: 'name and content are required for storing a prompt' },
              { status: 400 }
            );
          }

          const template = await storePromptTemplate({
            name,
            content,
            isActive: isActive !== false,
            metadata,
          });

          return NextResponse.json(template, { status: 201 });
        }

        case 'rollback': {
          if (!name || !targetVersion) {
            return NextResponse.json(
              { error: 'name and targetVersion are required for rollback' },
              { status: 400 }
            );
          }

          const result = await rollbackPrompt(name, targetVersion);

          if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 });
          }

          return NextResponse.json(result);
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action. Use: store, rollback' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[AI Prompts API] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to manage prompt templates' },
        { status: 500 }
      );
    }
  });
}
