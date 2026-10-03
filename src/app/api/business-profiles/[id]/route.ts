// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profile by ID
// GET    /api/business-profiles/[id] — fetch one profile
// PATCH  /api/business-profiles/[id] — update (also used to set default)
// DELETE /api/business-profiles/[id] — archive (soft delete; keeps history)
//
// OWNERSHIP: every lookup is `where: { id, userId }` — a profile owned by
// another user is indistinguishable from a missing one (404), so IDs cannot
// be probed cross-account.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { serializeProfile, validateProfileInput } from '../route';

async function getOwnedProfile(request: NextRequest, id: string) {
  const user = await requireAuth(request);
  const profile = await db.businessProfile.findFirst({
    where: { id, userId: user.id, archivedAt: null },
  });
  return { user, profile };
}

// GET — fetch one owned profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { profile } = await getOwnedProfile(request, id);
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }
    return NextResponse.json({ profile: serializeProfile(profile) });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error fetching business profile:', error);
    return NextResponse.json({ error: 'Failed to load business profile' }, { status: 500 });
  }
}

// PATCH — update an owned profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, profile } = await getOwnedProfile(request, id);
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, data } = validateProfileInput(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.businessProfile.updateMany({
          where: { userId: user.id, id: { not: profile.id } },
          data: { isDefault: false },
        });
      }
      return tx.businessProfile.update({
        where: { id: profile.id },
        data: data as Record<string, never>,
      });
    });

    return NextResponse.json({ profile: serializeProfile(updated) });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error updating business profile:', error);
    return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 });
  }
}

// DELETE — archive (soft delete): the row and any historical references
// (campaigns, jobs) stay intact; the profile just disappears from pickers.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, profile } = await getOwnedProfile(request, id);
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const remaining = await db.businessProfile.count({
      where: { userId: user.id, archivedAt: null, id: { not: profile.id } },
    });

    await db.$transaction(async (tx) => {
      await tx.businessProfile.update({
        where: { id: profile.id },
        data: { archivedAt: new Date(), isDefault: false },
      });
      if (profile.isDefault && remaining > 0) {
        // Promote the oldest remaining profile to default.
        const next = await tx.businessProfile.findFirst({
          where: { userId: user.id, archivedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.businessProfile.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error archiving business profile:', error);
    return NextResponse.json({ error: 'Failed to archive business profile' }, { status: 500 });
  }
}
