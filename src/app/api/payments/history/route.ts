// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/history
// Returns payment orders for the authenticated user with invoice info.
// Supports filtering by status and includes invoice download URLs.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status'); // optional filter
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

      const appUrl = getAppUrl();

      const where: Record<string, unknown> = { userId: user.id };
      if (status) {
        where.status = status;
      }

      const paymentOrders = await db.paymentOrder.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
              pdfUrl: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return NextResponse.json({
        payments: paymentOrders.map((order) => ({
          id: order.id,
          provider: order.provider,
          amount: order.amount,
          currency: order.currency,
          plan: order.plan,
          billingCycle: order.billingCycle,
          status: order.status,
          couponCode: order.couponCode,
          discountAmount: order.discountAmount,
          subtotal: order.subtotal,
          taxRate: order.taxRate,
          taxAmount: order.taxAmount,
          invoice: order.invoice
            ? {
                id: order.invoice.id,
                invoiceNumber: order.invoice.invoiceNumber,
                total: order.invoice.total,
                currency: order.invoice.currency,
                pdfUrl: `${appUrl}/api/payments/invoice/${order.id}`,
                createdAt: order.invoice.createdAt.toISOString(),
              }
            : null,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('[API] Failed to fetch payment history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch payment history' },
        { status: 500 }
      );
    }
  });
}
