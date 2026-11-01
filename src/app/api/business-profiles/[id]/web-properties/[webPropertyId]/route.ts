// ═══════════════════════════════════════════════════════════════════
// GET    /api/business-profiles/[id]/web-properties/[webPropertyId]
// PUT    /api/business-profiles/[id]/web-properties/[webPropertyId]
// DELETE /api/business-profiles/[id]/web-properties/[webPropertyId]
//
// CRUD for a single WebProperty. Owner-scoped through BusinessProfile → User.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  getWebProperty,
  updateWebProperty,
  deleteWebProperty,
} from '@/lib/web-property-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webPropertyId: string }> }
) {
  return withAuth(request, async (user) => {
    const { webPropertyId } = await params;
    const wp = await getWebProperty(user.id, webPropertyId);
    if (!wp) {
      return NextResponse.json({ error: 'Web property not found' }, { status: 404 });
    }
    return NextResponse.json({ webProperty: wp });
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webPropertyId: string }> }
) {
  return withAuth(request, async (user) => {
    const { webPropertyId } = await params;
    const body = await request.json();
    const result = await updateWebProperty(user.id, webPropertyId, {
      url: body.url,
      label: body.label,
      propertyType: body.propertyType,
      status: body.status,
    });
    if (!result.success) {
      const status = result.error?.includes('not found') ? 404
        : result.error?.includes('already') ? 409
        : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ webProperty: result.webProperty });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webPropertyId: string }> }
) {
  return withAuth(request, async (user) => {
    const { webPropertyId } = await params;
    const result = await deleteWebProperty(user.id, webPropertyId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  });
}
