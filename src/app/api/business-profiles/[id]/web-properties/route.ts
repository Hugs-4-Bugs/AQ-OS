// ═══════════════════════════════════════════════════════════════════
// POST /api/business-profiles/[id]/web-properties
// GET  /api/business-profiles/[id]/web-properties
//
// Create or list WebProperties for a BusinessProfile.
// Owner-scoped: the BusinessProfile must belong to the authenticated user.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  createWebProperty,
  listWebProperties,
} from '@/lib/web-property-service';

// GET — list web properties for a business profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const includeArchived = request.nextUrl.searchParams.get('includeArchived') === 'true';
    const properties = await listWebProperties(user.id, id, includeArchived);
    return NextResponse.json({ webProperties: properties, total: properties.length });
  });
}

// POST — add a web property to a business profile
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    const { id } = await params;
    const body = await request.json();
    const result = await createWebProperty(user.id, id, {
      url: body.url,
      label: body.label,
      propertyType: body.propertyType,
    });
    if (!result.success) {
      const status = result.error?.includes('not found') ? 404
        : result.error?.includes('already') ? 409
        : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ webProperty: result.webProperty }, { status: 201 });
  });
}
