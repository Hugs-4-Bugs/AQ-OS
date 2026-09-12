// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/billing/invoices/[invoiceId]/download
// Serves PDF invoice files for download.
// Verifies the invoice belongs to the authenticated user.
// Falls back to generating the PDF on-the-fly if not found on disk.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { generateInvoicePdf } from '@/lib/invoice-pdf-service';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { invoiceId } = await params;

      if (!invoiceId) {
        return NextResponse.json(
          { error: 'Invoice ID is required' },
          { status: 400 }
        );
      }

      // ── Step 1: Look up the invoice by ID or invoice number ──
      const invoice = await db.invoice.findFirst({
        where: {
          OR: [
            { id: invoiceId },
            { invoiceNumber: invoiceId },
          ],
          userId: user.id,
        },
        include: {
          paymentOrder: {
            select: {
              id: true,
              status: true,
              userId: true,
            },
          },
        },
      });

      if (!invoice) {
        return NextResponse.json(
          { error: 'Invoice not found' },
          { status: 404 }
        );
      }

      if (invoice.paymentOrder?.userId !== user.id) {
        return NextResponse.json(
          { error: 'You do not have permission to access this invoice' },
          { status: 403 }
        );
      }

      // ── Step 2: Try to serve PDF from disk ──
      if (invoice.pdfUrl && !invoice.pdfUrl.startsWith('data:') && !invoice.pdfUrl.startsWith('http')) {
        // Relative path — read from public/ directory
        const relativePath = invoice.pdfUrl.startsWith('/') ? invoice.pdfUrl.slice(1) : invoice.pdfUrl;
        const filePath = path.join(process.cwd(), 'public', relativePath);

        try {
          if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);

            return new NextResponse(fileBuffer, {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Length': String(fileBuffer.length),
                'Cache-Control': 'private, max-age=3600',
              },
            });
          }
        } catch (readError) {
          console.error('[InvoiceDownload] Failed to read PDF from disk:', readError);
          // Fall through to generate on-the-fly
        }
      }

      // ── Step 3: Try to generate PDF on-the-fly ──
      if (invoice.paymentOrder) {
        const generateResult = await generateInvoicePdf(invoice.paymentOrder.id, { force: true });

        if (generateResult.success && generateResult.pdfUrl) {
          // Try reading the newly generated file
          if (!generateResult.pdfUrl.startsWith('data:') && !generateResult.pdfUrl.startsWith('http')) {
            const relativePath = generateResult.pdfUrl.startsWith('/') ? generateResult.pdfUrl.slice(1) : generateResult.pdfUrl;
            const filePath = path.join(process.cwd(), 'public', relativePath);

            try {
              if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                const fileName = path.basename(filePath);

                return new NextResponse(fileBuffer, {
                  status: 200,
                  headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                    'Content-Length': String(fileBuffer.length),
                    'Cache-Control': 'private, max-age=3600',
                  },
                });
              }
            } catch {
              // Ignore and return JSON response
            }
          }
        }
      }

      // ── Step 4: Return invoice metadata as fallback ──
      return NextResponse.json({
        success: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        currency: invoice.currency,
        message: 'PDF file not available. Please try again later or contact support.',
      });
    } catch (error) {
      console.error('[InvoiceDownload] Error:', error);
      return NextResponse.json(
        { error: 'Failed to download invoice' },
        { status: 500 }
      );
    }
  });
}
