// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/invoices/[id]/download
// Phase L4: Invoice PDF Download Endpoint
//
// Generates (or retrieves cached) PDF for an invoice and serves it
// as a binary download with proper Content-Disposition headers.
//
// Auth: Required (withAuth)
// Params: id — Invoice ID (cuid)
// Response: application/pdf binary stream
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { generateInvoicePdfBuffer, type InvoicePdfData, type InvoiceCurrency } from '@/lib/invoice-pdf-generator';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';

const COMPANY_DETAILS = {
  name: process.env.COMPANY_NAME || 'AcquisitionOS Technologies Pvt. Ltd.',
  address: process.env.COMPANY_ADDRESS || '123 Tech Park, Andheri East, Mumbai, Maharashtra 400069',
  email: process.env.COMPANY_EMAIL || 'support@acquisitionos.com',
  phone: process.env.COMPANY_PHONE || '+91-80-1234-5678',
  gstNumber: process.env.COMPANY_GST_NUMBER || '27AABCA1234F1Z5',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      if (!id) {
        return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
      }

      // 1. Fetch the invoice with its payment order and user
      const invoice = await db.invoice.findUnique({
        where: { id },
        include: {
          paymentOrder: {
            include: { user: true },
          },
        },
      });

      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      // 2. Verify ownership — user can only download their own invoices
      if (invoice.userId !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const order = invoice.paymentOrder;
      const userRecord = order?.user;
      if (!order || !userRecord) {
        return NextResponse.json({ error: 'Associated payment order not found' }, { status: 404 });
      }

      // 3. Build the InvoicePdfData for the generator
      const currency = (invoice.currency || 'USD') as InvoiceCurrency;
      const plan = (order.plan || 'free') as PlanType;
      const billingCycle = order.billingCycle || 'monthly';

      // Parse line items from DB
      let lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];
      try {
        lineItems = JSON.parse(invoice.lineItems);
      } catch {
        // Fallback: build line items from stored fields
        lineItems = [
          {
            description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — ${billingCycle}`,
            quantity: 1,
            unitPrice: invoice.subtotal,
            total: invoice.subtotal,
          },
        ];
      }

      // If there's no plan line item but we have discount info, add it
      if (order.discountAmount > 0 && !lineItems.some((li) => li.description.toLowerCase().includes('discount'))) {
        lineItems.push({
          description: `Discount (${order.couponCode || 'Coupon'})`,
          quantity: 1,
          unitPrice: -order.discountAmount,
          total: -order.discountAmount,
        });
      }

      const invoiceData: InvoicePdfData = {
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.createdAt,
        dueDate: invoice.createdAt,
        userName: userRecord.name || userRecord.email,
        userEmail: userRecord.email,
        gstNumber: invoice.gstNumber || undefined,
        taxExempt: invoice.taxExempt,
        lineItems,
        subtotal: invoice.subtotal,
        taxRate: invoice.taxRate,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        currency,
        plan,
        billingCycle,
        provider: order.provider || undefined,
        providerPaymentId: order.providerPaymentId || undefined,
        creditsAllocated: PLAN_CREDITS[plan] ?? 0,
        paymentOrderId: order.id,
      };

      // 4. Generate the PDF buffer
      const pdfBuffer = await generateInvoicePdfBuffer(invoiceData);

      // 5. If invoice has no pdfUrl yet, persist it to public/invoices/
      if (!invoice.pdfUrl || invoice.pdfUrl.startsWith('data:')) {
        const fs = await import('fs');
        const path = await import('path');

        // Ensure directory
        const candidates = [
          path.join(process.cwd(), 'public', 'invoices'),
          path.join(process.cwd(), '..', '..', 'public', 'invoices'),
          path.join(process.cwd(), '..', 'public', 'invoices'),
        ];

        let invoicesDir = candidates[0];
        for (const dir of candidates) {
          if (fs.existsSync(path.dirname(dir))) {
            invoicesDir = dir;
            break;
          }
        }
        if (!fs.existsSync(invoicesDir)) {
          fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const fileName = `${invoice.invoiceNumber}.pdf`;
        const filePath = path.join(invoicesDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);

        // Update the invoice record with the real PDF URL (fire-and-forget)
        db.invoice.update({
          where: { id: invoice.id },
          data: { pdfUrl: `/invoices/${fileName}` },
        }).catch(() => {
          // Non-critical — don't block the download
        });
      }

      // 6. Return the PDF as a downloadable response
      const filename = `${invoice.invoiceNumber}.pdf`;

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(pdfBuffer.length),
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
        },
      });
    } catch (error) {
      console.error('[API] Invoice PDF download error:', error);
      return NextResponse.json(
        { error: 'Failed to generate invoice PDF' },
        { status: 500 }
      );
    }
  });
}
