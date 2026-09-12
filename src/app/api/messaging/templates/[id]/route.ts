// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Template Detail API Route
// Phase 10: GET/POST/PUT/DELETE /api/messaging/templates/[id]
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getTemplate,
  submitForApproval,
  resubmitTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplatePerformance,
  handleApprovalStatus,
} from '@/lib/template-approval-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const url = new URL(request.url);
      const includePerformance = url.searchParams.get('performance') === 'true';

      const template = await getTemplate(id, user.id);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const response: Record<string, unknown> = {
        success: true,
        data: template,
      };

      if (includePerformance) {
        const performance = await getTemplatePerformance(id, user.id);
        response.performance = performance;
      }

      return NextResponse.json(response);
    } catch (error) {
      console.error('Template GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to get template' },
        { status: 500 }
      );
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const action = body.action; // 'submit' | 'resubmit' | 'approve' | 'reject'

      switch (action) {
        case 'submit': {
          const result = await submitForApproval(id, user.id);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            templateId: result.templateId,
            status: result.status,
          });
        }

        case 'resubmit': {
          const { newContent } = body;
          if (!newContent) {
            return NextResponse.json(
              { error: 'newContent is required for resubmission' },
              { status: 400 }
            );
          }
          const result = await resubmitTemplate(id, user.id, newContent);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            templateId: result.templateId,
            status: result.status,
          });
        }

        case 'approve': {
          const result = await handleApprovalStatus(id, 'approved');
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            templateId: result.templateId,
            status: result.status,
          });
        }

        case 'reject': {
          const { rejectionReason } = body;
          const result = await handleApprovalStatus(id, 'rejected', rejectionReason);
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
          return NextResponse.json({
            success: true,
            templateId: result.templateId,
            status: result.status,
          });
        }

        default:
          return NextResponse.json(
            { error: 'Invalid action. Use: submit, resubmit, approve, reject' },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('Template POST route error:', error);
      return NextResponse.json(
        { error: 'Failed to process template action' },
        { status: 500 }
      );
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { name, content, category } = body;

      const result = await updateTemplate(id, user.id, { name, content, category });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Template PUT route error:', error);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const result = await deleteTemplate(id, user.id);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Template DELETE route error:', error);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }
  });
}
