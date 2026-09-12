// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/POST /api/sequences
// List user's sequences (paginated, filterable) and create new sequences.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { listSequences, createSequence } from '@/lib/email-sequence-service';

// GET /api/sequences — List sequences
export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      const filters = {
        status: searchParams.get('status') || undefined,
        page: Math.max(1, parseInt(searchParams.get('page') || '1')),
        limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20'))),
        search: searchParams.get('search') || undefined,
      };

      const result = await listSequences(user.id, filters);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json(result);
    } catch (error) {
      console.error('[API] List sequences error:', error);
      return NextResponse.json({ error: 'Failed to list sequences' }, { status: 500 });
    }
  });
}, 'sequences/list');

// POST /api/sequences — Create a new sequence
export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
        return NextResponse.json({ error: 'steps array with at least one step is required' }, { status: 400 });
      }

      // Validate each step has required fields
      for (let i = 0; i < body.steps.length; i++) {
        const step = body.steps[i];
        if (!step.template || typeof step.template !== 'string') {
          return NextResponse.json(
            { error: `Step ${i} is missing a template` },
            { status: 400 }
          );
        }
      }

      const result = await createSequence(user.id, {
        name: body.name,
        description: body.description,
        channel: body.channel || 'email',
        steps: body.steps.map((step: Record<string, unknown>) => ({
          channel: (step.channel as string) || body.channel || 'email',
          subject: step.subject as string | undefined,
          template: step.template as string,
          delayDays: typeof step.delayDays === 'number' ? step.delayDays : undefined,
          delayHours: typeof step.delayHours === 'number' ? step.delayHours : undefined,
        })),
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json(result.sequence, { status: 201 });
    } catch (error) {
      console.error('[API] Create sequence error:', error);
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }
  });
}, 'sequences/create');
