import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!authUser.orgId) {
      return NextResponse.json({ organization: null });
    }

    const organization = await db.organization.findUnique({
      where: { id: authUser.orgId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ organization: null });
    }

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        logo: organization.logo,
        customDomain: organization.customDomain,
        branding: organization.branding,
        ownerId: organization.ownerId,
        members: organization.members.map((m) => ({
          id: m.id,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
        createdAt: organization.createdAt,
      },
    });
  } catch (error) {
    console.error('Get organization error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, logo, ownerId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      );
    }

    const effectiveOwnerId = ownerId ?? authUser.id;

    // Check if user already belongs to an org
    if (authUser.orgId) {
      return NextResponse.json(
        { error: 'You already belong to an organization' },
        { status: 409 }
      );
    }

    // Create organization + owner membership + update user in a transaction
    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          logo: logo ?? null,
          ownerId: effectiveOwnerId,
        },
      });

      await tx.orgMember.create({
        data: {
          orgId: organization.id,
          userId: effectiveOwnerId,
          role: 'owner',
        },
      });

      await tx.user.update({
        where: { id: effectiveOwnerId },
        data: { orgId: organization.id },
      });

      return organization;
    });

    return NextResponse.json(
      {
        organization: {
          id: result.id,
          name: result.name,
          logo: result.logo,
          ownerId: result.ownerId,
          createdAt: result.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create organization error:', error);
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}
