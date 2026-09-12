// ═══════════════════════════════════════════════════════════════════
// DELETE /api/settings/api-keys/{id}  — Delete an API key
// PATCH /api/settings/api-keys/{id}  — Enable/Disable an API key
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { deleteApiKey, enableApiKey, disableApiKey, getApiKeyUsageStats } from '@/lib/api-key-service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    await deleteApiKey(authUser.id, id);

    return NextResponse.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'enable') {
      await enableApiKey(authUser.id, id);
      return NextResponse.json({ success: true, message: 'API key enabled' });
    }

    if (action === 'disable') {
      await disableApiKey(authUser.id, id);
      return NextResponse.json({ success: true, message: 'API key disabled' });
    }

    if (action === 'usage') {
      const stats = await getApiKeyUsageStats(id, authUser.id);
      return NextResponse.json({ stats });
    }

    return NextResponse.json({ error: 'Invalid action. Use: enable, disable, usage' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update API key';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
