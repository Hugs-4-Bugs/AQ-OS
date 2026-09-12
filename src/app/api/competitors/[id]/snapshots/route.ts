// ═══════════════════════════════════════════════════════════════════
// GET + POST /api/competitors/[id]/snapshots — Snapshot management
// Phase 13: Competitor Snapshots
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { takeSnapshot, getSnapshotHistory } from '@/lib/competitor-intelligence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '20', 10);

      const snapshots = await getSnapshotHistory(user.id, id);

      return NextResponse.json({ snapshots });
    } catch (error) {
      console.error('[GET /api/competitors/[id]/snapshots] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch snapshots' },
        { status: 500 }
      );
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const snapshotType = body.snapshotType || 'manual';

      const snapshot = await takeSnapshot(user.id, id, snapshotType);

      return NextResponse.json({ snapshot }, { status: 201 });
    } catch (error) {
      console.error('[POST /api/competitors/[id]/snapshots] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to take snapshot';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
