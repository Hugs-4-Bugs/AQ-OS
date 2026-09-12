// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/admin/billing/webhooks
// Admin webhook monitoring endpoint
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
      const provider = searchParams.get('provider'); // razorpay | stripe
      const processed = searchParams.get('processed'); // true | false

      const where: any = {};
      if (provider) where.provider = provider;
      if (processed !== null && processed !== undefined) {
        where.processed = processed === 'true';
      }

      const [webhooks, total] = await Promise.all([
        db.paymentWebhook.findMany({
          where,
          orderBy: { receivedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.paymentWebhook.count({ where }),
      ]);

      // Get failed webhook stats
      const failedCount = await db.paymentWebhook.count({
        where: {
          processed: false,
          processingError: { not: null },
        },
      });

      const unprocessedCount = await db.paymentWebhook.count({
        where: { processed: false },
      });

      return NextResponse.json({
        webhooks,
        total,
        stats: {
          failedCount,
          unprocessedCount,
          processedCount: total - unprocessedCount,
        },
      });
    } catch (error) {
      console.error('[Admin API] Failed to fetch webhook monitoring data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch webhook data' },
        { status: 500 }
      );
    }
  });
}
