// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Login History API Route
// GET /api/settings/login-history — Get login history for current user
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/settings/login-history - Get login history
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const [history, total] = await Promise.all([
      db.loginHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.loginHistory.count({ where: { userId: user.id } }),
    ]);

    const formatted = history.map((h) => ({
      id: h.id,
      ip: h.ip || 'Unknown',
      userAgent: h.userAgent || 'Unknown',
      country: h.country || 'Unknown',
      city: h.city || '',
      success: h.success,
      failReason: h.failReason,
      date: h.createdAt.toISOString(),
    }));

    return NextResponse.json({
      history: formatted,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error fetching login history:', error);
    return NextResponse.json({ error: 'Failed to fetch login history' }, { status: 500 });
  }
}
