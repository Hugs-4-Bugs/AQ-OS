import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getOrgBranding, updateOrgBranding, validateCustomDomain, type OrgBrandingUpdate } from '@/lib/org-branding-service';

// ═══════════════════════════════════════════════════════════════════
// GET /api/settings/org/branding — Get org branding settings
// PUT /api/settings/org/branding — Update org branding
// ═══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const branding = await getOrgBranding(authUser.orgId);

    return NextResponse.json({ branding });
  } catch (error) {
    console.error('Get org branding error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization branding' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Only owner/admin can update branding
    const { db } = await import('@/lib/db');
    const membership = await db.orgMember.findFirst({
      where: { orgId: authUser.orgId, userId: authUser.id },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only organization owners and admins can update branding' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: OrgBrandingUpdate = {};

    // Validate and extract fields
    if (body.primaryColor !== undefined) updates.primaryColor = body.primaryColor;
    if (body.accentColor !== undefined) updates.accentColor = body.accentColor;
    if (body.hideBranding !== undefined) updates.hideBranding = Boolean(body.hideBranding);
    if (body.customLogo !== undefined) updates.customLogo = body.customLogo;
    if (body.customFavicon !== undefined) updates.customFavicon = body.customFavicon;
    if (body.fontFamily !== undefined) updates.fontFamily = body.fontFamily;

    // Custom domain requires additional validation
    if (body.customDomain !== undefined) {
      updates.customDomain = body.customDomain;

      if (body.customDomain) {
        const validation = await validateCustomDomain(body.customDomain);
        if (!validation.valid) {
          return NextResponse.json(
            { error: 'Invalid custom domain', details: validation.errors },
            { status: 400 }
          );
        }
      }
    }

    const branding = await updateOrgBranding(authUser.orgId, updates);

    return NextResponse.json({ branding });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Update org branding error:', error);
    return NextResponse.json(
      { error: 'Failed to update organization branding' },
      { status: 500 }
    );
  }
}
