// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/invoices/generate
// Generates invoice PDF for any payment order (including failed/refunded)
// Also sends invoice email if requested via sendEmail flag
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import { sendInvoiceEmail } from '@/lib/invoice-email-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { paymentOrderId, sendEmail: shouldSendEmail = false } = body;

      if (!paymentOrderId) {
        return NextResponse.json({ error: 'Payment order ID is required' }, { status: 400 });
      }

      // Verify ownership
      const order = await db.paymentOrder.findUnique({
        where: { id: paymentOrderId },
        include: { invoice: true },
      });

      if (!order) {
        return NextResponse.json({ error: 'Payment order not found' }, { status: 404 });
      }

      if (order.userId !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Generate invoice PDF (force=true allows generation for non-completed orders)
      const pdfResult = await generateInvoicePdf(order.id, { force: true });

      if (!pdfResult.success) {
        return NextResponse.json({ error: pdfResult.error || 'Failed to generate invoice' }, { status: 400 });
      }

      // Send email if requested (e.g., resend invoice email)
      let emailSent = false;
      if (shouldSendEmail) {
        const emailResult = await sendInvoiceEmail(user.id, order.id);
        emailSent = emailResult?.sent || false;
      }

      // Fetch the updated invoice
      const invoice = await db.invoice.findUnique({
        where: { paymentOrderId: order.id },
      });

      return NextResponse.json({
        success: true,
        invoice: invoice ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
          currency: invoice.currency,
          pdfUrl: invoice.pdfUrl,
          downloadUrl: `/api/payments/invoice/${order.id}`,
        } : null,
        emailSent,
        pdfUrl: pdfResult.pdfUrl,
      });
    } catch (error) {
      console.error('[API] Generate invoice error:', error);
      return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
    }
  });
}
