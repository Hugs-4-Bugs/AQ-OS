// ═══════════════════════════════════════════════════════════════════
// POST /api/settings/api-keys/{id}/revoke  — Revoke an API key
// Key becomes permanently invalid.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { revokeApiKey } from '@/lib/api-key-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    await revokeApiKey(authUser.id, id);

    return NextResponse.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
