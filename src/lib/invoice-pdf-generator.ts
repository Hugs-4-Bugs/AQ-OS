// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invoice PDF Generator
// Phase L4: Invoice PDF Generation
//
// Pure PDF rendering module. Takes invoice data (line items, GST,
// amounts, dates) and generates a professional PDF invoice.
// No database operations — this is a rendering-only module.
//
// Features:
//   - Professional A4 invoice layout
//   - Company branding (teal accent, logo area)
//   - Invoice metadata (number, date, due date, currency)
//   - Bill-to section (customer name, email, GSTIN)
//   - Payment details (plan, credits, billing cycle, provider)
//   - Line items table with page-break support
//   - Subtotal / CGST / SGST / IGST / Total
//   - Tax-exempt badge
//   - Transaction details section
//   - Footer with company info + thank-you note
//   - Multi-currency support (USD, INR, EUR, GBP)
//
// Usage:
//   import { generateInvoicePdfBuffer, saveInvoicePdf } from '@/lib/invoice-pdf-generator';
//   const buffer = await generateInvoicePdfBuffer(invoiceData);
//   const filePath = await saveInvoicePdf(invoiceData);
// ═══════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// ===== TYPES =====

export type InvoiceCurrency = 'USD' | 'INR' | 'EUR' | 'GBP';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoicePdfData {
  /** e.g. "INV-20260607-0001" */
  invoiceNumber: string;
  /** Invoice creation date */
  date: Date;
  /** Due date (typically same as date for SaaS subscriptions) */
  dueDate: Date;
  /** Customer name */
  userName: string;
  /** Customer email */
  userEmail: string;
  /** Customer GSTIN (Indian users only) */
  gstNumber?: string;
  /** Whether the customer is tax-exempt */
  taxExempt: boolean;
  /** Line items (plan charge, discount, etc.) */
  lineItems: InvoiceLineItem[];
  /** Subtotal after discount, before tax */
  subtotal: number;
  /** Effective tax rate (e.g. 0.18 for 18%) */
  taxRate: number;
  /** Total tax amount */
  taxAmount: number;
  /** Grand total including tax */
  total: number;
  /** Currency code */
  currency: InvoiceCurrency;
  /** Plan name (e.g. "Pro", "Elite") */
  plan: string;
  /** Billing cycle (e.g. "monthly", "yearly") */
  billingCycle: string;
  /** Payment provider ("razorpay" or "stripe") */
  provider?: string;
  /** Provider's payment/transaction ID */
  providerPaymentId?: string;
  /** Credits allocated for this plan */
  creditsAllocated?: number;
  /** Payment order ID (internal reference) */
  paymentOrderId?: string;
}

// ===== CONSTANTS =====

const CURRENCY_SYMBOLS: Record<InvoiceCurrency, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
};

const COMPANY_DETAILS = {
  name: process.env.COMPANY_NAME || 'AcquisitionOS Technologies Pvt. Ltd.',
  address: process.env.COMPANY_ADDRESS || '123 Tech Park, Andheri East, Mumbai, Maharashtra 400069',
  email: process.env.COMPANY_EMAIL || 'support@acquisitionos.com',
  phone: process.env.COMPANY_PHONE || '+91-80-1234-5678',
  gstNumber: process.env.COMPANY_GST_NUMBER || '27AABCA1234F1Z5',
};

// Branding colours
const TEAL = '#0d9488';
const TEAL_DARK = '#0f766e';
const GRAY_900 = '#111827';
const GRAY_700 = '#374151';
const GRAY_500 = '#6b7280';
const GRAY_300 = '#d1d5db';
const GRAY_100 = '#f3f4f6';
const WHITE = '#ffffff';

// ===== HELPERS =====

function formatCurrency(amount: number, currency: InvoiceCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ===== DIRECTORY HELPER =====

function ensureInvoicesDir(): string {
  // In standalone Next.js builds, process.cwd() is .next/standalone/.
  // Try several candidate directories to locate the public folder.
  const candidates = [
    path.join(process.cwd(), 'public', 'invoices'),
    path.join(process.cwd(), '..', '..', 'public', 'invoices'),
    path.join(process.cwd(), '..', 'public', 'invoices'),
  ];

  for (const dir of candidates) {
    const publicDir = path.dirname(dir);
    if (fs.existsSync(publicDir)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    }
  }

  // Fallback: create relative to CWD
  const fallback = path.join(process.cwd(), 'public', 'invoices');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// ===== CORE PDF RENDERER =====

/**
 * Build a PDF document buffer for the given invoice data using pdfkit.
 * Returns a Promise<Buffer> containing the full PDF bytes.
 */
export function generateInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: COMPANY_DETAILS.name,
        Subject: `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} Plan Subscription Invoice`,
        Creator: 'AcquisitionOS Billing System',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    let y = doc.page.margins.top;

    // ─── HEADER: Teal accent bar ───
    doc.rect(0, 0, doc.page.width, 6).fill(TEAL);
    y = 30;

    // Company name (left)
    doc.fontSize(20).font('Helvetica-Bold').fillColor(TEAL).text(COMPANY_DETAILS.name, leftX, y);
    const companyNameHeight = doc.heightOfString(COMPANY_DETAILS.name, { width: pageWidth * 0.55 });
    y += companyNameHeight + 4;

    // Company details (left)
    doc.fontSize(9).font('Helvetica').fillColor(GRAY_500);
    doc.text(COMPANY_DETAILS.address, leftX, y, { width: pageWidth * 0.55 });
    y += 13;
    doc.text(COMPANY_DETAILS.email, leftX, y, { width: pageWidth * 0.55 });
    y += 13;
    doc.text(COMPANY_DETAILS.phone, leftX, y, { width: pageWidth * 0.55 });
    if (COMPANY_DETAILS.gstNumber) {
      y += 13;
      doc.text(`GSTIN: ${COMPANY_DETAILS.gstNumber}`, leftX, y, { width: pageWidth * 0.55 });
    }

    // "INVOICE" label (right)
    const invoiceLabelX = leftX + pageWidth * 0.6;
    doc.fontSize(28).font('Helvetica-Bold').fillColor(TEAL).text('INVOICE', invoiceLabelX, 30, {
      width: pageWidth * 0.4,
      align: 'right',
    });

    // Invoice metadata (right)
    let metaY = 62;
    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700);
    doc.text(`Invoice #:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(data.invoiceNumber);
    metaY += 14;
    doc.font('Helvetica').text(`Date:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(formatDate(data.date));
    metaY += 14;
    doc.font('Helvetica').text(`Due Date:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(formatDate(data.dueDate));
    metaY += 14;
    doc.font('Helvetica').text(`Currency:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(data.currency);

    // Divider
    y = Math.max(y + 18, metaY + 18);
    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(2).strokeColor(TEAL).stroke();
    y += 18;

    // ─── BILL TO / PAYMENT INFO ───
    const colWidth = pageWidth * 0.48;

    // Bill To
    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('BILLED TO', leftX, y, { width: colWidth });
    y += 14;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(GRAY_900).text(data.userName, leftX, y, { width: colWidth });
    y += 15;
    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700).text(data.userEmail, leftX, y, { width: colWidth });
    y += 13;
    if (data.gstNumber) {
      doc.text(`GSTIN: ${data.gstNumber}`, leftX, y, { width: colWidth });
      y += 13;
    }

    // Payment Details (right column)
    const rightColX = leftX + pageWidth * 0.52;
    let payY = y - 13 - 15 - 13 - (data.gstNumber ? 13 : 0);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('PAYMENT DETAILS', rightColX, payY, { width: colWidth });
    payY += 14;

    const planLabel = `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} Plan`;
    const cycleLabel = data.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
    const credits = data.creditsAllocated ?? 0;

    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700);
    doc.text(`Plan:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${planLabel} — ${cycleLabel}`);
    payY += 14;
    if (credits > 0) {
      doc.font('Helvetica').fillColor(GRAY_700).text(`Credits Granted:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
        .font('Helvetica-Bold').fillColor(GRAY_900).text(`${credits.toLocaleString()}`);
      payY += 14;
    }
    doc.font('Helvetica').fillColor(GRAY_700).text(`Billing:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(cycleLabel);
    payY += 14;

    const paymentProvider = data.provider === 'razorpay' ? 'Razorpay' : (data.provider || 'Stripe');
    doc.font('Helvetica').fillColor(GRAY_700).text(`Payment Method:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(paymentProvider);

    y = Math.max(y, payY) + 18;

    // ─── GST / TAX-EXEMPT BADGES ───
    const isIndianGst = data.currency === 'INR' && data.gstNumber;
    if (isIndianGst) {
      const badgeWidth = 90;
      const badgeHeight = 18;
      doc.roundedRect(leftX, y, badgeWidth, badgeHeight, 3).fill(TEAL);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(WHITE)
        .text('GST INVOICE', leftX, y + 4, { width: badgeWidth, align: 'center' });
      y += badgeHeight + 10;
    }

    if (data.taxExempt) {
      const noticeWidth = pageWidth;
      const noticeHeight = 28;
      doc.roundedRect(leftX, y, noticeWidth, noticeHeight, 4).fill('#fef3c7');
      doc.fontSize(9).font('Helvetica').fillColor('#92400e')
        .text('Tax Exempt: This invoice is exempt from tax as per applicable regulations.', leftX + 10, y + 8, {
          width: noticeWidth - 20,
        });
      y += noticeHeight + 10;
    }

    // ─── LINE ITEMS TABLE ───
    const col1 = leftX;
    const col2 = leftX + pageWidth * 0.52;
    const col3 = leftX + pageWidth * 0.62;
    const col4 = leftX + pageWidth * 0.80;

    function drawTableHeader(currentY: number): number {
      doc.rect(leftX, currentY, pageWidth, 22).fill(GRAY_100);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500);
      doc.text('DESCRIPTION', col1 + 10, currentY + 6, { width: col2 - col1 - 10 });
      doc.text('QTY', col2, currentY + 6, { width: col3 - col2, align: 'center' });
      doc.text('UNIT PRICE', col3, currentY + 6, { width: col4 - col3, align: 'right' });
      doc.text('AMOUNT', col4, currentY + 6, { width: leftX + pageWidth - col4, align: 'right' });
      return currentY + 22;
    }

    y = drawTableHeader(y);

    for (const item of data.lineItems) {
      const rowHeight = 28;
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
        y = doc.page.margins.top;
        y = drawTableHeader(y);
      }

      // Row separator
      doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();

      doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700);
      doc.text(item.description, col1 + 10, y + 8, { width: col2 - col1 - 20 });

      const isNegative = item.quantity < 0 || item.unitPrice < 0;
      const textColor = isNegative ? '#dc2626' : GRAY_700;

      doc.text(String(item.quantity), col2, y + 8, { width: col3 - col2, align: 'center' });
      doc.fillColor(textColor).text(formatCurrency(item.unitPrice, data.currency), col3, y + 8, {
        width: col4 - col3,
        align: 'right',
      });
      doc.text(formatCurrency(item.total, data.currency), col4, y + 8, {
        width: leftX + pageWidth - col4,
        align: 'right',
      });
      y += rowHeight;
    }

    // Bottom line
    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();
    y += 14;

    // ─── TOTALS ───
    const totalsX = leftX + pageWidth * 0.55;
    const totalsWidth = pageWidth * 0.45;
    const valueX = leftX + pageWidth * 0.78;
    const valueWidth = leftX + pageWidth - valueX;

    // Subtotal
    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_500).text('Subtotal', totalsX, y, { width: valueX - totalsX });
    doc.font('Helvetica').fillColor(GRAY_700).text(formatCurrency(data.subtotal, data.currency), valueX, y, {
      width: valueWidth,
      align: 'right',
    });
    y += 16;

    // Tax breakdown
    if (data.taxAmount > 0 && !data.taxExempt) {
      if (isIndianGst) {
        // CGST
        const cgstRate = data.taxRate / 2;
        const cgstAmount = data.taxAmount / 2;
        doc.fontSize(9).font('Helvetica').fillColor(GRAY_500)
          .text(`CGST (${(cgstRate * 100).toFixed(0)}%)`, totalsX, y, { width: valueX - totalsX });
        doc.fillColor(GRAY_700).text(formatCurrency(cgstAmount, data.currency), valueX, y, {
          width: valueWidth,
          align: 'right',
        });
        y += 14;

        // SGST
        doc.fontSize(9).font('Helvetica').fillColor(GRAY_500)
          .text(`SGST (${(cgstRate * 100).toFixed(0)}%)`, totalsX, y, { width: valueX - totalsX });
        doc.fillColor(GRAY_700).text(formatCurrency(cgstAmount, data.currency), valueX, y, {
          width: valueWidth,
          align: 'right',
        });
        y += 16;
      } else {
        doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_500)
          .text(`Tax (${(data.taxRate * 100).toFixed(0)}%)`, totalsX, y, { width: valueX - totalsX });
        doc.fillColor(GRAY_700).text(formatCurrency(data.taxAmount, data.currency), valueX, y, {
          width: valueWidth,
          align: 'right',
        });
        y += 16;
      }
    } else if (data.taxExempt) {
      doc.fontSize(9).font('Helvetica').fillColor(GRAY_500)
        .text('Tax', totalsX, y, { width: valueX - totalsX });
      doc.font('Helvetica-Oblique').fillColor(GRAY_500).text('Exempt', valueX, y, {
        width: valueWidth,
        align: 'right',
      });
      y += 16;
    }

    // Total divider
    doc.moveTo(totalsX, y).lineTo(leftX + pageWidth, y).lineWidth(1.5).strokeColor(TEAL).stroke();
    y += 6;

    // Total row with green highlight
    doc.rect(totalsX, y, leftX + pageWidth - totalsX, 24).fill('#f0fdf4');
    doc.fontSize(13).font('Helvetica-Bold').fillColor(TEAL_DARK)
      .text('Total', totalsX + 8, y + 5, { width: valueX - totalsX - 8 });
    doc.text(formatCurrency(data.total, data.currency), valueX, y + 5, {
      width: valueWidth,
      align: 'right',
    });
    y += 34;

    // ─── TRANSACTION DETAILS ───
    if (y + 80 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();
    y += 12;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('TRANSACTION DETAILS', leftX, y);
    y += 14;

    doc.fontSize(9).font('Helvetica').fillColor(GRAY_700);
    const txnId = data.providerPaymentId || data.paymentOrderId || 'N/A';
    doc.text(`Transaction ID:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(txnId);
    y += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Purchase Date:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(formatDate(data.date));

    // Next renewal
    const nextRenewal = new Date(data.date);
    if (data.billingCycle === 'yearly') {
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
    } else {
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    }
    y += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Next Renewal:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(formatDate(nextRenewal));

    // Right column
    const txnRightX = leftX + pageWidth * 0.55;
    let txnRightY = y - 13 - 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Payment Method:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(paymentProvider);
    txnRightY += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Plan:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${planLabel} — ${cycleLabel}`);
    if (credits > 0) {
      txnRightY += 13;
      doc.font('Helvetica').fillColor(GRAY_700).text(`Credits:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
        .font('Helvetica-Bold').fillColor(GRAY_900).text(`${credits.toLocaleString()}`);
    }

    y = Math.max(y, txnRightY) + 20;

    // ─── FOOTER ───
    if (y + 70 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();
    y += 12;

    // Left: company details
    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('COMPANY DETAILS', leftX, y, { width: pageWidth * 0.45 });
    y += 12;
    doc.fontSize(8.5).font('Helvetica').fillColor(GRAY_500);
    doc.text(COMPANY_DETAILS.name, leftX, y, { width: pageWidth * 0.45 });
    y += 11;
    doc.text(COMPANY_DETAILS.address, leftX, y, { width: pageWidth * 0.45 });
    y += 11;
    doc.text(COMPANY_DETAILS.email, leftX, y, { width: pageWidth * 0.45 });

    // Right: thank-you
    const footerRightX = leftX + pageWidth * 0.55;
    const footerRightY = y - 11 - 11 - 11;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500)
      .text('THANK YOU FOR YOUR BUSINESS', footerRightX, footerRightY, { width: pageWidth * 0.45, align: 'right' });
    doc.fontSize(8).font('Helvetica').fillColor(GRAY_500)
      .text('This is a computer-generated invoice. No physical signature is required.', footerRightX, footerRightY + 12, {
        width: pageWidth * 0.45,
        align: 'right',
      });
    doc.text('For support: support@acquisitionos.com', footerRightX, footerRightY + 24, {
      width: pageWidth * 0.45,
      align: 'right',
    });

    // Bottom teal bar
    doc.rect(0, doc.page.height - 6, doc.page.width, 6).fill(TEAL);

    doc.end();
  });
}

// ===== SAVE TO DISK =====

/**
 * Generate the PDF and save it to disk at `public/invoices/{invoiceNumber}.pdf`.
 * Returns the absolute file path of the saved PDF.
 */
export async function saveInvoicePdf(data: InvoicePdfData): Promise<string> {
  const buffer = await generateInvoicePdfBuffer(data);
  const invoicesDir = ensureInvoicesDir();
  const fileName = `${data.invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Generate the PDF and save it, returning the web-accessible URL path.
 */
export async function saveInvoicePdfAndGetUrl(data: InvoicePdfData): Promise<string> {
  await saveInvoicePdf(data);
  return `/invoices/${data.invoiceNumber}.pdf`;
}
