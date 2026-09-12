// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Billing API Route
// Phase 5: Admin Billing Foundations
//
// GET handler for admin billing data queries.
// Requires admin auth (withAdmin from auth-middleware).
// Accepts query param `action` to dispatch to the right
// admin-billing-service function.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import {
  getBillingOverview,
  getWebhookMonitoring,
  getFailedPaymentLogs,
  getInvoiceTracking,
  getSubscriptionMetrics,
  getRevenueByPeriod,
  type SubscriptionMetricsPeriod,
} from '@/lib/admin-billing-service';

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/billing?action=<action>&...
// ═══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');

      switch (action) {
        // ─────────────────────────────────────────────────────────
        // Billing Overview
        // GET /api/admin/billing?action=overview
        // ─────────────────────────────────────────────────────────
        case 'overview': {
          const data = await getBillingOverview();
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Webhook Monitoring
        // GET /api/admin/billing?action=webhooks&provider=razorpay&startDate=...&endDate=...&limit=50&offset=0
        // ─────────────────────────────────────────────────────────
        case 'webhooks': {
          const provider = searchParams.get('provider') as 'razorpay' | 'stripe' | null;
          const startDateStr = searchParams.get('startDate');
          const endDateStr = searchParams.get('endDate');
          const limit = parseInt(searchParams.get('limit') || '50', 10);
          const offset = parseInt(searchParams.get('offset') || '0', 10);

          const data = await getWebhookMonitoring({
            provider: provider || undefined,
            startDate: startDateStr ? new Date(startDateStr) : undefined,
            endDate: endDateStr ? new Date(endDateStr) : undefined,
            limit: isNaN(limit) ? 50 : limit,
            offset: isNaN(offset) ? 0 : offset,
          });
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Failed Payment Logs
        // GET /api/admin/billing?action=failed-payments&provider=...&plan=...&startDate=...&endDate=...&limit=50&offset=0
        // ─────────────────────────────────────────────────────────
        case 'failed-payments': {
          const provider = searchParams.get('provider') as 'razorpay' | 'stripe' | null;
          const plan = searchParams.get('plan');
          const startDateStr = searchParams.get('startDate');
          const endDateStr = searchParams.get('endDate');
          const limit = parseInt(searchParams.get('limit') || '50', 10);
          const offset = parseInt(searchParams.get('offset') || '0', 10);

          const data = await getFailedPaymentLogs({
            provider: provider || undefined,
            plan: plan || undefined,
            startDate: startDateStr ? new Date(startDateStr) : undefined,
            endDate: endDateStr ? new Date(endDateStr) : undefined,
            limit: isNaN(limit) ? 50 : limit,
            offset: isNaN(offset) ? 0 : offset,
          });
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Invoice Tracking
        // GET /api/admin/billing?action=invoices&status=completed&currency=USD&startDate=...&endDate=...&limit=50&offset=0
        // ─────────────────────────────────────────────────────────
        case 'invoices': {
          const status = searchParams.get('status');
          const currency = searchParams.get('currency');
          const startDateStr = searchParams.get('startDate');
          const endDateStr = searchParams.get('endDate');
          const limit = parseInt(searchParams.get('limit') || '50', 10);
          const offset = parseInt(searchParams.get('offset') || '0', 10);

          const data = await getInvoiceTracking({
            status: status || undefined,
            currency: currency || undefined,
            startDate: startDateStr ? new Date(startDateStr) : undefined,
            endDate: endDateStr ? new Date(endDateStr) : undefined,
            limit: isNaN(limit) ? 50 : limit,
            offset: isNaN(offset) ? 0 : offset,
          });
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Subscription Metrics
        // GET /api/admin/billing?action=metrics&period=month
        // ─────────────────────────────────────────────────────────
        case 'metrics': {
          const periodParam = searchParams.get('period');
          const validPeriods: SubscriptionMetricsPeriod[] = ['day', 'week', 'month'];
          const period: SubscriptionMetricsPeriod = validPeriods.includes(
            periodParam as SubscriptionMetricsPeriod
          )
            ? (periodParam as SubscriptionMetricsPeriod)
            : 'month';

          const data = await getSubscriptionMetrics(period);
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Revenue by Period
        // GET /api/admin/billing?action=revenue&startDate=...&endDate=...
        // ─────────────────────────────────────────────────────────
        case 'revenue': {
          const startDateStr = searchParams.get('startDate');
          const endDateStr = searchParams.get('endDate');

          if (!startDateStr || !endDateStr) {
            return NextResponse.json(
              { success: false, error: 'startDate and endDate are required for revenue action' },
              { status: 400 }
            );
          }

          const startDate = new Date(startDateStr);
          const endDate = new Date(endDateStr);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return NextResponse.json(
              { success: false, error: 'Invalid date format for startDate or endDate' },
              { status: 400 }
            );
          }

          const data = await getRevenueByPeriod(startDate, endDate);
          return NextResponse.json({ success: true, data });
        }

        // ─────────────────────────────────────────────────────────
        // Unknown action
        // ─────────────────────────────────────────────────────────
        default:
          return NextResponse.json(
            {
              success: false,
              error: `Unknown action: "${action}". Valid actions: overview, webhooks, failed-payments, invoices, metrics, revenue`,
            },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error('[AdminBillingAPI] Unexpected error:', error);
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
