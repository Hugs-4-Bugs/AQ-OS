// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Developer Access Routes
// GET   /api/settings/developer-access  — Read current Developer Access state
// PATCH /api/settings/developer-access  — Toggle Developer Access on/off
//
// Developer Access is a per-user security gate for API key creation.
// When OFF, POST /api/settings/api-keys returns 403 DEVELOPER_ACCESS_REQUIRED.
// Existing API keys are preserved regardless of this setting.
// API documentation remains fully enabled regardless of this setting.
// ═══════════════════════════════════════════════════════════════════

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
      select: { developerAccessEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ developerAccessEnabled: user.developerAccessEnabled });
  } catch (error) {
    console.error('Get Developer Access error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Developer Access state' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let body: { enabled?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const enabled = Boolean(body?.enabled);

    const updated = await db.user.update({
      where: { id: authUser.id },
      data: { developerAccessEnabled: enabled },
      select: { developerAccessEnabled: true },
    });

    return NextResponse.json({ developerAccessEnabled: updated.developerAccessEnabled });
  } catch (error) {
    console.error('Update Developer Access error:', error);
    return NextResponse.json(
      { error: 'Failed to update Developer Access state' },
      { status: 500 }
    );
  }
}
