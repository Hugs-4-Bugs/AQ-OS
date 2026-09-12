// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/PUT/DELETE /api/sequences/[id]
// Get sequence detail, update, or delete a sequence.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { getSequenceDetail, updateSequence, deleteSequence } from '@/lib/email-sequence-service';

// GET /api/sequences/[id] — Get sequence detail with enrollments
export const GET = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await getSequenceDetail(id, user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }

      return NextResponse.json(result.detail);
    } catch (error) {
      console.error('[API] Get sequence detail error:', error);
      return NextResponse.json({ error: 'Failed to get sequence detail' }, { status: 500 });
    }
  });
}, 'sequences/detail');

// PUT /api/sequences/[id] — Update sequence
export const PUT = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.channel !== undefined) updateData.channel = body.channel;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.steps !== undefined) {
        if (!Array.isArray(body.steps) || body.steps.length === 0) {
          return NextResponse.json({ error: 'steps must be a non-empty array' }, { status: 400 });
        }
        updateData.steps = body.steps.map((step: Record<string, unknown>) => ({
          channel: (step.channel as string) || body.channel || 'email',
          subject: step.subject as string | undefined,
          template: step.template as string,
          delayDays: typeof step.delayDays === 'number' ? step.delayDays : undefined,
          delayHours: typeof step.delayHours === 'number' ? step.delayHours : undefined,
        }));
      }

      const result = await updateSequence(id, user.id, updateData);

      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json(result.sequence);
    } catch (error) {
      console.error('[API] Update sequence error:', error);
      return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
    }
  });
}, 'sequences/update');

// DELETE /api/sequences/[id] — Delete sequence (also cleans up enrollments)
export const DELETE = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await deleteSequence(id, user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[API] Delete sequence error:', error);
      return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
    }
  });
}, 'sequences/delete');
