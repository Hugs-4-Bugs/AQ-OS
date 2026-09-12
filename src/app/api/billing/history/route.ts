// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/billing/history
// Comprehensive billing history: payment orders, invoices, subscription
// details, credit ledger, next billing date, plan changes, and refunds.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAppUrl } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const userId = authUser.id;
    const appUrl = getAppUrl();

    // ── Parallel data fetches ──
    const [
      paymentOrders,
      totalCount,
      invoices,
      subscription,
      creditLedger,
      creditAddons,
      planChanges,
      refundHistory,
    ] = await Promise.all([
      // 1. All PaymentOrders with invoice details
      db.paymentOrder.findMany({
        where: { userId },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              subtotal: true,
              taxRate: true,
              taxAmount: true,
              total: true,
              currency: true,
              pdfUrl: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),

      // 2. Total count of payment orders
      db.paymentOrder.count({
        where: { userId },
      }),

      // 3. All Invoices for download (with pdfUrl)
      db.invoice.findMany({
        where: { userId },
        select: {
          id: true,
          paymentOrderId: true,
          invoiceNumber: true,
          subtotal: true,
          taxRate: true,
          taxAmount: true,
          total: true,
          currency: true,
          pdfUrl: true,
          lineItems: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // 4. Current subscription details
      db.subscription.findFirst({
        where: {
          userId,
          status: { in: ['active', 'trialing', 'past_due'] },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // 5. Recent credit ledger entries
      db.creditsLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),

      // 6. Credit add-ons purchased
      db.creditAddon.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // 7. Plan changes (from audit logs or payment orders showing plan transitions)
      db.auditLog.findMany({
        where: {
          userId,
          action: { in: ['plan_change', 'subscription_upgrade', 'subscription_downgrade', 'plan_upgrade', 'plan_downgrade'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // 8. Refund history (payment orders with refunded status)
      db.paymentOrder.findMany({
        where: {
          userId,
          status: 'refunded',
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);

    // ── Format payment orders ──
    const formattedOrders = paymentOrders.map((order) => ({
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
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      invoice: order.invoice
        ? {
            id: order.invoice.id,
            invoiceNumber: order.invoice.invoiceNumber,
            subtotal: order.invoice.subtotal,
            taxRate: order.invoice.taxRate,
            taxAmount: order.invoice.taxAmount,
            total: order.invoice.total,
            currency: order.invoice.currency,
            pdfUrl: order.invoice.pdfUrl
              ? `${appUrl}/api/payments/invoice/${order.id}`
              : null,
            createdAt: order.invoice.createdAt.toISOString(),
          }
        : null,
    }));

    // ── Format invoices with download URL ──
    const formattedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      subtotal: inv.subtotal,
      taxRate: inv.taxRate,
      taxAmount: inv.taxAmount,
      total: inv.total,
      currency: inv.currency,
      pdfUrl: `${appUrl}/api/payments/invoice/${inv.paymentOrderId || inv.id}`,
      lineItems: inv.lineItems,
      createdAt: inv.createdAt.toISOString(),
    }));

    // ── Format subscription details ──
    const subscriptionDetails = subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          creditsTotal: subscription.creditsTotal,
          creditsUsed: subscription.creditsUsed,
          creditsRemaining: subscription.creditsRemaining,
          currentPeriodStart: subscription.currentPeriodStart?.toISOString() || null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          scheduledPlanChange: subscription.scheduledPlanChange,
          isTrial: subscription.isTrial,
          trialEndsAt: subscription.trialEndsAt?.toISOString() || null,
          creditsResetAt: subscription.creditsResetAt?.toISOString() || null,
        }
      : null;

    // ── Calculate next billing date ──
    let nextBillingDate: string | null = null;
    if (subscription?.currentPeriodEnd && !subscription.cancelAtPeriodEnd) {
      nextBillingDate = subscription.currentPeriodEnd.toISOString();
    }

    // ── Format credit ledger ──
    const formattedCreditLedger = creditLedger.map((entry) => ({
      id: entry.id,
      action: entry.action,
      credits: entry.credits,
      balance: entry.balance,
      description: entry.description,
      referenceId: entry.referenceId,
      createdAt: entry.createdAt.toISOString(),
    }));

    // ── Format credit add-ons ──
    const formattedCreditAddons = creditAddons.map((addon) => ({
      id: addon.id,
      credits: addon.credits,
      pricePaid: addon.pricePaid,
      currency: addon.currency,
      expiresAt: addon.expiresAt?.toISOString() || null,
      createdAt: addon.createdAt.toISOString(),
    }));

    // ── Format plan changes ──
    const formattedPlanChanges = planChanges.map((change) => {
      let details: unknown = null;
      try {
        details = change.details ? JSON.parse(change.details) : null;
      } catch {
        // details is not JSON
        details = change.details;
      }
      return {
        id: change.id,
        action: change.action,
        details,
        createdAt: change.createdAt.toISOString(),
      };
    });

    // ── Format refund history ──
    const formattedRefundHistory = refundHistory.map((refund) => ({
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      plan: refund.plan,
      billingCycle: refund.billingCycle,
      reason: refund.couponCode || null,
      refundedAt: refund.updatedAt.toISOString(),
      invoice: refund.invoice
        ? {
            id: refund.invoice.id,
            invoiceNumber: refund.invoice.invoiceNumber,
            total: refund.invoice.total,
            currency: refund.invoice.currency,
          }
        : null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      // Payment orders with pagination
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages,
        hasMore: page < totalPages,
      },

      // All invoices with download URLs
      invoices: formattedInvoices,

      // Current subscription details
      subscription: subscriptionDetails,

      // Next billing date
      nextBillingDate,

      // Credit ledger entries
      creditLedger: formattedCreditLedger,

      // Credit add-ons
      creditAddons: formattedCreditAddons,

      // Plan change history
      planChanges: formattedPlanChanges,

      // Refund history
      refunds: formattedRefundHistory,
    });
  } catch (error) {
    console.error('Get billing history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing history' },
      { status: 500 }
    );
  }
}
