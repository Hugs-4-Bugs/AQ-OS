// GET /api/admin/security/events — Returns recent security events
// Requires 'security.events.read' permission
import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withPermission(request, 'security.events.read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
      const unresolvedOnly = searchParams.get('unresolved') === 'true';

      const events = await db.systemEvent.findMany({
        where: unresolvedOnly ? { resolved: false } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          category: true,
          message: true,
          metadata: true,
          resolved: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ success: true, data: { events } });
    } catch (error) {
      console.error('Security events error:', error);
      return NextResponse.json({ error: 'Failed to load security events' }, { status: 500 });
    }
  });
}
