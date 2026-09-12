// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/billing/failed-payments
// Admin failed payments tracking endpoint
// Phase 5: Payments System
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const offset = parseInt(searchParams.get('offset') || '0');

      // Get failed payment orders
      const [failedOrders, total] = await Promise.all([
        db.paymentOrder.findMany({
          where: { status: 'failed' },
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            user: {
              select: { id: true, email: true, name: true, plan: true },
            },
          },
        }),
        db.paymentOrder.count({ where: { status: 'failed' } }),
      ]);

      // Get past-due subscriptions
      const pastDueSubscriptions = await db.subscription.findMany({
        where: { status: 'past_due' },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Get failed webhook count
      const failedWebhooks = await db.paymentWebhook.count({
        where: {
          processed: false,
          processingError: { not: null },
        },
      });

      // Get recent payment stats
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentStats = await db.paymentOrder.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
        _sum: { amount: true },
      });

      return NextResponse.json({
        failedOrders,
        total,
        pastDueSubscriptions,
        failedWebhooks,
        recentStats: recentStats.map(s => ({
          status: s.status,
          count: s._count,
          totalAmount: s._sum.amount || 0,
        })),
      });
    } catch (error) {
      console.error('[Admin API] Failed to fetch failed payments data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch failed payments data' },
        { status: 500 }
      );
    }
  });
}
