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

    // Resolve org company name. Read priority mirrors the write path in
    // PUT below: UserSettings.companyName is the canonical storage, with
    // the org name and the legacy User.company column as fallbacks so a
    // company saved through ANY generation of this API round-trips.
    const orgMember = user.organizations[0];
    const orgName = orgMember?.organization?.name ?? null;

    return NextResponse.json({
      profile: {
        name: user.name ?? '',
        email: user.email,
        phone: user.phone ?? '',
        country: user.country ?? '',
        company:
          user.settings?.companyName ?? orgName ?? user.company ?? '',
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
    if (company !== undefined) {
      // Company must round-trip. The GET endpoint reads
      // UserSettings.companyName first (then org name, then the legacy
      // User.company column) — so persist to the canonical
      // UserSettings.companyName via the nested relation upsert AND keep
      // User.company in sync for readers of the legacy column
      // (e.g. competitive-gap-analysis-service). Previously this handler
      // only wrote User.company, so the value never appeared again on
      // reload — the reported "profile doesn't persist" bug.
      updateData.company = company;
      updateData.settings = {
        upsert: {
          create: { companyName: company },
          update: { companyName: company },
        },
      };
    }

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
        company: updatedUser.settings?.companyName ?? orgName ?? updatedUser.company ?? '',
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
