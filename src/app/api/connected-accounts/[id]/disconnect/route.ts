// POST /api/connected-accounts/[id]/disconnect — set status='disconnected', wipe encrypted creds
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { disconnectAccount } from '@/lib/connected-accounts/service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      await disconnectAccount(user.id, id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  });
}
