// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/invoice/[id]
// Returns the invoice PDF for a payment order.
// If the PDF exists at a stored path, serves it directly.
// If not, generates the PDF on-the-fly and serves it.
// Uses getAppUrl() for any URL construction (never request.url).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { generateInvoicePdf, generateInvoiceHtml, getInvoiceForOrder } from '@/lib/invoice-pdf-service';
import { db } from '@/lib/db';
import { getAppUrl } from '@/lib/app-url';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const paymentOrderId = id;

      if (!paymentOrderId) {
        return NextResponse.json(
          { error: 'Payment order ID is required' },
          { status: 400 }
        );
      }

      // Verify the payment order belongs to this user
      const order = await db.paymentOrder.findUnique({
        where: { id: paymentOrderId },
        select: { id: true, userId: true, status: true },
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Payment order not found' },
          { status: 404 }
        );
      }

      if (order.userId !== user.id) {
        return NextResponse.json(
          { error: 'You do not have access to this invoice' },
          { status: 403 }
        );
      }

      if (order.status !== 'completed') {
        // Allow invoice generation for non-completed orders via force option
        // (e.g., when user explicitly requests to generate/download)
      }

      // ── Step 1: Check if invoice already exists with pdfUrl ──
      const existingInvoice = await getInvoiceForOrder(paymentOrderId);

      if (existingInvoice.success && existingInvoice.invoice?.pdfUrl) {
        const pdfUrl = existingInvoice.invoice.pdfUrl;

        // If the pdfUrl is a data URI (base64 HTML), serve it directly as HTML
        if (pdfUrl.startsWith('data:text/html;base64,')) {
          const base64Data = pdfUrl.replace('data:text/html;base64,', '');
          const htmlContent = Buffer.from(base64Data, 'base64').toString('utf-8');

          return new NextResponse(htmlContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `inline; filename="invoice-${existingInvoice.invoice.invoiceNumber}.html"`,
            },
          });
        }

        // If the pdfUrl is an external URL, redirect to it
        if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
          // Ensure the URL uses getAppUrl() if it references our own domain
          const appUrl = getAppUrl();
          if (pdfUrl.includes('0.0.0.0') || pdfUrl.includes('localhost:3000')) {
            const urlObj = new URL(pdfUrl);
            const correctUrl = `${appUrl}${urlObj.pathname}${urlObj.search}`;
            return NextResponse.redirect(correctUrl);
          }
          return NextResponse.redirect(pdfUrl);
        }

        // If the pdfUrl is a local file path, try to serve it
        // (In production, this would use S3 or a file storage service)
        // For now, fall through to generate on-the-fly
      }

      // ── Step 2: Generate invoice on-the-fly ──
      const generateResult = await generateInvoicePdf(paymentOrderId, { force: true });

      if (!generateResult.success) {
        // If PDF generation fails, try serving as HTML instead
        const htmlResult = await generateInvoiceHtml(paymentOrderId);
        if (htmlResult.success && htmlResult.html) {
          return new NextResponse(htmlResult.html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `inline; filename="invoice-${paymentOrderId}.html"`,
            },
          });
        }

        return NextResponse.json(
          { error: generateResult.error || 'Failed to generate invoice' },
          { status: 400 }
        );
      }

      // ── Step 3: Serve the generated invoice ──
      if (generateResult.pdfUrl) {
        const pdfUrl = generateResult.pdfUrl;

        // If the pdfUrl is a data URI (base64 HTML), serve it directly
        if (pdfUrl.startsWith('data:text/html;base64,')) {
          const base64Data = pdfUrl.replace('data:text/html;base64,', '');
          const htmlContent = Buffer.from(base64Data, 'base64').toString('utf-8');

          return new NextResponse(htmlContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `inline; filename="invoice-${paymentOrderId}.html"`,
            },
          });
        }

        // If external URL, redirect
        if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
          return NextResponse.redirect(pdfUrl);
        }
      }

      // ── Step 4: Return invoice metadata as JSON fallback ──
      const invoiceResult = await getInvoiceForOrder(paymentOrderId);

      return NextResponse.json({
        success: true,
        invoice: invoiceResult.success ? invoiceResult.invoice : {
          id: generateResult.invoiceId,
          pdfUrl: generateResult.pdfUrl,
          total: 0,
          currency: 'USD',
          invoiceNumber: '',
          createdAt: new Date().toISOString(),
        },
        generated: true,
        downloadUrl: `${getAppUrl()}/api/payments/invoice/${paymentOrderId}`,
      });
    } catch (error) {
      console.error('[API] Invoice error:', error);
      return NextResponse.json(
        { error: 'Failed to get or generate invoice' },
        { status: 500 }
      );
    }
  });
}
