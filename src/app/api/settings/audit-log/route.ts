import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const userId = auth.id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const where = { userId };

    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          action: true,
          details: true,
          ipAddress: true,
          userAgent: true,
          resource: true,
          resourceId: true,
          createdAt: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ entries, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch audit log';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
