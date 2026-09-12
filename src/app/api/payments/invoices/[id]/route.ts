// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/invoices/[id]
// Phase 5: Get detailed invoice data for the authenticated user
//
// Auth: Required (withAuth)
// Params: id (invoice ID)
// Returns: complete invoice data including stored HTML (or regenerated if missing)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getInvoiceForUser, getInvoiceData, generateInvoiceHTML } from '@/lib/invoice-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      if (!id) {
        return NextResponse.json(
          { error: 'Invoice ID is required' },
          { status: 400 }
        );
      }

      // Get invoice data scoped to this user (ensures ownership)
      const invoiceData = await getInvoiceForUser(user.id, id);

      if (!invoiceData) {
        return NextResponse.json(
          { error: 'Invoice not found' },
          { status: 404 }
        );
      }

      // Try to get stored HTML first; regenerate if missing (backward compat)
      let html: string | null = null;
      try {
        const invoiceRecord = await db.invoice.findUnique({
          where: { id },
          select: { htmlContent: true, userId: true },
        });
        if (invoiceRecord && invoiceRecord.userId === user.id) {
          html = invoiceRecord.htmlContent;
        }
      } catch {
        // Fallback to regeneration
      }

      if (!html) {
        html = generateInvoiceHTML(invoiceData);
        // Store the HTML for future requests (fire-and-forget)
        db.invoice.update({
          where: { id },
          data: { htmlContent: html },
        }).catch(() => {});
      }

      // Log invoice access
      await logBillingEvent({
        userId: user.id,
        action: 'payment_completed',
        details: `Invoice ${invoiceData.invoiceNumber} viewed`,
        resourceId: id,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          invoiceNumber: invoiceData.invoiceNumber,
          total: invoiceData.total,
          currency: invoiceData.currency,
        },
      });

      // Check if client wants HTML format
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return new NextResponse(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      }

      // Default: return JSON with invoice data + HTML
      return NextResponse.json({
        id,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        userName: invoiceData.userName,
        userEmail: invoiceData.userEmail,
        userGstNumber: invoiceData.userGstNumber,
        lineItems: invoiceData.lineItems,
        subtotal: invoiceData.subtotal,
        cgstRate: invoiceData.cgstRate,
        cgstAmount: invoiceData.cgstAmount,
        sgstRate: invoiceData.sgstRate,
        sgstAmount: invoiceData.sgstAmount,
        igstRate: invoiceData.igstRate,
        igstAmount: invoiceData.igstAmount,
        totalTax: invoiceData.totalTax,
        total: invoiceData.total,
        currency: invoiceData.currency,
        taxExempt: invoiceData.taxExempt,
        planName: invoiceData.planName,
        billingCycle: invoiceData.billingCycle,
        paymentProvider: invoiceData.paymentProvider,
        paymentId: invoiceData.paymentId,
        companyName: invoiceData.companyName,
        companyGstNumber: invoiceData.companyGstNumber,
        companyAddress: invoiceData.companyAddress,
        html,
      });
    } catch (error) {
      console.error('[API] Get invoice detail error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve invoice' },
        { status: 500 }
      );
    }
  });
}
