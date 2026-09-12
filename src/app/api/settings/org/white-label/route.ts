import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getWhiteLabelConfig, updateWhiteLabelConfig, isWhiteLabelEnabled, type WhiteLabelOverrides } from '@/lib/white-label-service';

// ═══════════════════════════════════════════════════════════════════
// GET /api/settings/org/white-label — Get white-label config
// PUT /api/settings/org/white-label — Update white-label config
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

    const config = await getWhiteLabelConfig(authUser.orgId);
    const enabled = await isWhiteLabelEnabled(authUser.orgId);

    return NextResponse.json({
      whiteLabel: config,
      eligible: enabled,
      requiredPlan: 'elite',
    });
  } catch (error) {
    console.error('Get white-label config error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch white-label configuration' },
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

    // Check if white-label is enabled for this org's plan
    const enabled = await isWhiteLabelEnabled(authUser.orgId);
    if (!enabled) {
      return NextResponse.json(
        {
          error: 'White-label is only available on the Elite plan',
          requiredPlan: 'elite',
          currentPlan: authUser.plan,
          upgradeUrl: '/settings?tab=subscription',
        },
        { status: 403 }
      );
    }

    // Only owner/admin can update white-label
    const { db } = await import('@/lib/db');
    const membership = await db.orgMember.findFirst({
      where: { orgId: authUser.orgId, userId: authUser.id },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only organization owners and admins can update white-label settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: WhiteLabelOverrides = {};

    if (body.appName !== undefined) updates.appName = body.appName;
    if (body.customLogo !== undefined) updates.customLogo = body.customLogo;
    if (body.customFavicon !== undefined) updates.customFavicon = body.customFavicon;
    if (body.customDomain !== undefined) updates.customDomain = body.customDomain;
    if (body.emailFromName !== undefined) updates.emailFromName = body.emailFromName;
    if (body.emailFromAddress !== undefined) updates.emailFromAddress = body.emailFromAddress;
    if (body.hideAcquisitionOSBranding !== undefined) updates.hideAcquisitionOSBranding = Boolean(body.hideAcquisitionOSBranding);

    if (body.emailTemplateCustomizations !== undefined) {
      updates.emailTemplateCustomizations = body.emailTemplateCustomizations;
    }

    const config = await updateWhiteLabelConfig(authUser.orgId, updates);

    return NextResponse.json({ whiteLabel: config });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('White-label') || error.message.includes('Invalid')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Update white-label config error:', error);
    return NextResponse.json(
      { error: 'Failed to update white-label configuration' },
      { status: 500 }
    );
  }
}
