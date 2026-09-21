// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/invoices/resend-email
// Resends the invoice email for a payment order
// Generates PDF first if not already present
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
      const { paymentOrderId } = body;

      if (!paymentOrderId) {
        return NextResponse.json({ error: 'Payment order ID is required' }, { status: 400 });
      }

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

      // Ensure PDF exists first
      if (!order.invoice?.pdfUrl) {
        const pdfResult = await generateInvoicePdf(order.id, { force: true });
        if (!pdfResult.success) {
          return NextResponse.json({ error: 'Failed to generate invoice PDF before sending email' }, { status: 400 });
        }
      }

      // Send the email
      const emailResult = await sendInvoiceEmail(user.id, order.id);

      return NextResponse.json({
        success: emailResult.sent,
        error: emailResult.error,
        message: emailResult.sent ? 'Invoice email sent successfully' : 'Failed to send invoice email',
      });
    } catch (error) {
      console.error('[API] Resend invoice email error:', error);
      return NextResponse.json({ error: 'Failed to resend invoice email' }, { status: 500 });
    }
  });
}
