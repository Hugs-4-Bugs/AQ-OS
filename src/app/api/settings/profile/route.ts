import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      include: {
        organizations: {
          include: {
            organization: {
              select: { id: true, name: true, logo: true },
            },
          },
        },
        settings: {
          select: { companyName: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Resolve org company name
    const orgMember = user.organizations[0];
    const orgName = orgMember?.organization?.name ?? null;

    return NextResponse.json({
      profile: {
        name: user.name ?? '',
        email: user.email,
        phone: user.phone ?? '',
        country: user.country ?? '',
        company: user.settings?.companyName ?? orgName ?? '',
        timezone: null,
        avatar: user.avatar ?? '',
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
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

    const body = await request.json();
    const { name, phone, country, avatar, company } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (country !== undefined) updateData.country = country;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (company !== undefined) updateData.company = company;

    const updatedUser = await db.user.update({
      where: { id: authUser.id },
      data: updateData,
      include: {
        organizations: {
          include: {
            organization: {
              select: { id: true, name: true },
            },
          },
        },
        settings: {
          select: { companyName: true },
        },
      },
    });

    // Resolve org company name for response
    const orgMember = updatedUser.organizations[0];
    const orgName = orgMember?.organization?.name ?? null;

    return NextResponse.json({
      profile: {
        name: updatedUser.name ?? '',
        email: updatedUser.email,
        phone: updatedUser.phone ?? '',
        country: updatedUser.country ?? '',
        company: updatedUser.company ?? updatedUser.settings?.companyName ?? orgName ?? '',
        avatar: updatedUser.avatar ?? '',
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
