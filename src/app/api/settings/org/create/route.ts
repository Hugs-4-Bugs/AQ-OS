// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Create Organization API Route
// POST /api/settings/org/create — Create a new organization
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// POST /api/settings/org/create - Create an organization
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json();
    const { name, logo, customDomain, branding } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Organization name must be under 100 characters' }, { status: 400 });
    }

    // Check if user already belongs to an org
    const existingMembership = await db.orgMember.findFirst({
      where: { userId: user.id },
    });

    if (existingMembership) {
      return NextResponse.json({ error: 'You already belong to an organization' }, { status: 400 });
    }

    // Create organization with creator as owner
    const org = await db.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name: name.trim(),
          logo: logo || null,
          customDomain: customDomain || null,
          branding: branding ? JSON.stringify(branding) : null,
          ownerId: user.id,
        },
      });

      // Add creator as owner member
      await tx.orgMember.create({
        data: {
          orgId: newOrg.id,
          userId: user.id,
          role: 'owner',
        },
      });

      // Update user's orgId
      await tx.user.update({
        where: { id: user.id },
        data: { orgId: newOrg.id, role: 'owner' },
      });

      return newOrg;
    });

    // Fetch the created org with members
    const createdOrg = await db.organization.findUnique({
      where: { id: org.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    });

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'org_created',
      details: JSON.stringify({ orgId: org.id, orgName: name.trim() }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'organization',
      resourceId: org.id,
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: createdOrg!.id,
        name: createdOrg!.name,
        logo: createdOrg!.logo,
        customDomain: createdOrg!.customDomain,
        branding: createdOrg!.branding ? JSON.parse(createdOrg!.branding) : null,
        ownerId: createdOrg!.ownerId,
        members: createdOrg!.members,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error creating organization:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
