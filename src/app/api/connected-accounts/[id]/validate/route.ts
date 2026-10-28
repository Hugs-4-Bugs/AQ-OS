// POST /api/connected-accounts/[id]/validate — re-test connection and update status
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { validateAccount } from '@/lib/connected-accounts/service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const result = await validateAccount(user.id, id);
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  });
}
