// ═══════════════════════════════════════════════════════════════════
// POST /api/settings/api-keys/{id}/rotate  — Rotate an API key
// Old key invalidated, new key issued. Raw key shown only once.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { rotateApiKey } from '@/lib/api-key-service';

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
    const result = await rotateApiKey(authUser.id, id);

    // Return the new raw key ONLY ONCE
    return NextResponse.json({
      apiKey: {
        id: result.id,
        name: result.name,
        keyPrefix: result.keyPrefix,
        environment: result.environment,
        key: result.rawKey, // SHOWN ONLY ONCE
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rotate API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
