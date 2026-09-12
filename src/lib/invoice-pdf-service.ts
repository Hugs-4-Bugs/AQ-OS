// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invoice PDF Generation Service
// Phase 4-5: Billing and Payment Gaps Remediation
//
// Generates REAL PDF invoices using pdfkit.
// Supports multi-currency (USD, INR, EUR, GBP) and GST for Indian users.
// ═══════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { logPaymentEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';

// ===== TYPES =====

export type InvoiceCurrency = 'USD' | 'INR' | 'EUR' | 'GBP';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceId: string;
  date: Date;
  dueDate: Date;
  userId: string;
  userName: string;
  userEmail: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: InvoiceCurrency;
  gstNumber?: string;
  taxExempt: boolean;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyGstNumber?: string;
  companyTaxId?: string;
  paymentOrderId: string;
  plan: string;
  billingCycle: string;
  providerPaymentId?: string;
  provider?: string;
  // FIX 4: card last4 (from Stripe) + explicit PAID status
  cardLast4?: string;
  paymentStatus?: string;
}

export interface GenerateInvoicePdfResult {
  success: boolean;
  pdfUrl?: string;
  invoiceId?: string;
  error?: string;
}

// ===== CONSTANTS =====

const CURRENCY_SYMBOLS: Record<InvoiceCurrency, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
};

const COMPANY_DETAILS = {
  // FIX 4: The legal entity / company details shown at the bottom of the
  // invoice is "QuantumFusion Solutions". The product brand name
  // (AcquisitionOS) is rendered separately at the top via PRODUCT_NAME.
  name: process.env.COMPANY_NAME || 'QuantumFusion Solutions',
  address: process.env.COMPANY_ADDRESS || '123 Tech Park, Andheri East, Mumbai, Maharashtra 400069',
  email: process.env.COMPANY_EMAIL || 'billing@quantumfusionsolutions.com',
  phone: process.env.COMPANY_PHONE || '+91-80-1234-5678',
  gstNumber: process.env.COMPANY_GST_NUMBER || '27AABCA1234F1Z5',
  taxId: process.env.COMPANY_TAX_ID || '',
};

// FIX 4: Product brand name shown at the top of the invoice.
const PRODUCT_NAME = process.env.PRODUCT_NAME || 'AcquisitionOS';

// Branding colors
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

// FIX 4: Exact date AND time of payment, used for the invoice date line.
function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function generateInvoiceNumber(): string {
  // FIX 4: Format is INV-[year]-[6 random digits], e.g. INV-2026-847392
  const year = new Date().getFullYear().toString();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `INV-${year}-${random}`;
}

// ===== ENSURE INVOICES DIRECTORY =====

function ensureInvoicesDir(): string {
  // In standalone build, process.cwd() is .next/standalone/ — we need to
  // also try the project root. Check both locations.
  const candidates = [
    path.join(process.cwd(), 'public', 'invoices'),
    path.join(process.cwd(), '..', '..', 'public', 'invoices'),
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

  // Fallback: create in CWD
  const invoicesDir = path.join(process.cwd(), 'public', 'invoices');
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }
  return invoicesDir;
}

// ===== PDF GENERATION =====

/**
 * Build a PDF document buffer for the given invoice data using pdfkit.
 */
function buildPdfBuffer(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: data.companyName,
        Subject: `${data.plan} Plan Subscription Invoice`,
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

    // ─── HEADER: Product logo/name (AcquisitionOS) + Invoice meta ───

    // Teal accent bar at the very top
    doc.rect(0, 0, doc.page.width, 6).fill(TEAL);

    y = 30;

    // FIX 4: Product logo/name (AcquisitionOS) at the top of the invoice.
    doc.fontSize(22).font('Helvetica-Bold').fillColor(TEAL).text(PRODUCT_NAME, leftX, y);
    const productNameHeight = doc.heightOfString(PRODUCT_NAME, { width: pageWidth * 0.55 });
    y += productNameHeight + 4;

    // Small tagline under the product name
    doc.fontSize(9).font('Helvetica').fillColor(GRAY_500);
    doc.text('AI-Powered Client Acquisition Platform', leftX, y, { width: pageWidth * 0.55 });
    y += 13;

    // "INVOICE" label (right side)
    const invoiceLabelX = leftX + pageWidth * 0.6;
    doc.fontSize(28).font('Helvetica-Bold').fillColor(TEAL).text('INVOICE', invoiceLabelX, 30, {
      width: pageWidth * 0.4,
      align: 'right',
    });

    // Invoice metadata (right side)
    let metaY = 62;
    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700);
    doc.text(`Invoice #:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(data.invoiceNumber);
    metaY += 14;
    // FIX 4: Invoice date shows exact date AND time of payment.
    doc.font('Helvetica').text(`Date:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(formatDateTime(data.date));
    metaY += 14;
    doc.font('Helvetica').text(`Due Date:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(formatDate(data.dueDate));
    metaY += 14;
    doc.font('Helvetica').text(`Currency:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').text(data.currency);
    metaY += 14;
    // FIX 4: Explicit PAID status on the invoice.
    doc.font('Helvetica').text(`Status:`, invoiceLabelX, metaY, { width: pageWidth * 0.22, continued: true })
      .font('Helvetica-Bold').fillColor(TEAL_DARK).text(data.paymentStatus || 'PAID');
    doc.fillColor(GRAY_700);

    // Divider line
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

    // FIX 4: Handle credit_addon orders so the payment details box shows
    // "Credit Add-on Pack", "One-time" billing, and the real credit count.
    let planLabel: string;
    let cycleLabel: string;
    let credits: number;
    if (data.plan === 'credit_addon') {
      // Derive the credit count from the line item description if present.
      const match = data.lineItems[0]?.description?.match(/([\d,]+)\s*credits/);
      const parsed = match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
      planLabel = 'Credit Add-on Pack';
      cycleLabel = 'One-time';
      credits = parsed ?? 0;
    } else {
      planLabel = `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} Plan`;
      cycleLabel = data.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
      credits = PLAN_CREDITS[data.plan as PlanType] ?? 0;
    }

    doc.fontSize(9.5).font('Helvetica').fillColor(GRAY_700);
    doc.text(`Plan:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${planLabel} — ${cycleLabel}`);
    payY += 14;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Credits Granted:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${credits.toLocaleString()}`);
    payY += 14;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Billing:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(cycleLabel);
    payY += 14;

    const paymentProvider = data.provider === 'razorpay' ? 'Razorpay' : (data.provider || 'Stripe');
    // FIX 4: Show "Card (•••• last4)" when the card last4 is available
    // from Stripe; otherwise fall back to the provider name.
    const paymentMethodLabel = data.cardLast4
      ? `Card (•••• ${data.cardLast4})`
      : paymentProvider;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Payment Method:`, rightColX, payY, { width: colWidth * 0.4, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(paymentMethodLabel);

    y = Math.max(y, payY) + 18;

    // GST badge if Indian
    const isIndianGst = data.currency === 'INR' && data.gstNumber;
    if (isIndianGst) {
      const badgeWidth = 90;
      const badgeHeight = 18;
      doc.roundedRect(leftX, y, badgeWidth, badgeHeight, 3).fill(TEAL);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(WHITE)
        .text('GST INVOICE', leftX, y + 4, { width: badgeWidth, align: 'center' });
      y += badgeHeight + 10;
    }

    // Tax exempt notice
    if (data.taxExempt) {
      const noticeWidth = pageWidth;
      const noticeHeight = 28;
      doc.roundedRect(leftX, y, noticeWidth, noticeHeight, 4)
        .fill('#fef3c7');
      doc.fontSize(9).font('Helvetica').fillColor('#92400e')
        .text('Tax Exempt: This invoice is exempt from tax as per applicable regulations.', leftX + 10, y + 8, {
          width: noticeWidth - 20,
        });
      y += noticeHeight + 10;
    }

    // ─── LINE ITEMS TABLE ───

    // Table header
    const col1 = leftX;           // Description
    const col2 = leftX + pageWidth * 0.52; // Qty
    const col3 = leftX + pageWidth * 0.62; // Unit Price
    const col4 = leftX + pageWidth * 0.80; // Amount

    doc.rect(leftX, y, pageWidth, 22).fill(GRAY_100);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500);
    doc.text('DESCRIPTION', col1 + 10, y + 6, { width: col2 - col1 - 10 });
    doc.text('QTY', col2, y + 6, { width: col3 - col2, align: 'center' });
    doc.text('UNIT PRICE', col3, y + 6, { width: col4 - col3, align: 'right' });
    doc.text('AMOUNT', col4, y + 6, { width: leftX + pageWidth - col4, align: 'right' });
    y += 22;

    // Table rows
    for (const item of data.lineItems) {
      const rowHeight = 28;
      // Check page break
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
        y = doc.page.margins.top;
        // Repeat header
        doc.rect(leftX, y, pageWidth, 22).fill(GRAY_100);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500);
        doc.text('DESCRIPTION', col1 + 10, y + 6, { width: col2 - col1 - 10 });
        doc.text('QTY', col2, y + 6, { width: col3 - col2, align: 'center' });
        doc.text('UNIT PRICE', col3, y + 6, { width: col4 - col3, align: 'right' });
        doc.text('AMOUNT', col4, y + 6, { width: leftX + pageWidth - col4, align: 'right' });
        y += 22;
      }

      // Row separator line
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

    // Bottom line of table
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

    // Discount (if included in line items, still show subtotal separately)
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
        // Generic tax
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

    // Total
    doc.moveTo(totalsX, y).lineTo(leftX + pageWidth, y).lineWidth(1.5).strokeColor(TEAL).stroke();
    y += 6;
    // Teal background strip for total
    doc.rect(totalsX, y, leftX + pageWidth - totalsX, 24).fill('#f0fdf4');
    doc.fontSize(13).font('Helvetica-Bold').fillColor(TEAL_DARK)
      .text('Total', totalsX + 8, y + 5, { width: valueX - totalsX - 8 });
    doc.text(formatCurrency(data.total, data.currency), valueX, y + 5, {
      width: valueWidth,
      align: 'right',
    });
    y += 34;

    // ─── TRANSACTION INFO ───

    // Check if we need more space
    if (y + 80 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();
    y += 12;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('TRANSACTION DETAILS', leftX, y);
    y += 14;

    doc.fontSize(9).font('Helvetica').fillColor(GRAY_700);
    const txnId = data.providerPaymentId || data.paymentOrderId;
    doc.text(`Transaction ID:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(txnId);
    y += 13;
    // FIX 4: Purchase date shows exact date + time of payment.
    doc.font('Helvetica').fillColor(GRAY_700).text(`Purchase Date:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(formatDateTime(data.date));

    // Next renewal date
    const nextRenewal = new Date(data.date);
    if (data.billingCycle === 'yearly') {
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
    } else {
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    }
    y += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Next Renewal:`, leftX, y, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(formatDate(nextRenewal));

    // Right column: payment method and plan
    const txnRightX = leftX + pageWidth * 0.55;
    let txnRightY = y - 13 - 13;
    // FIX 4: Use the card last4 label in transaction details too.
    doc.font('Helvetica').fillColor(GRAY_700).text(`Payment Method:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(paymentMethodLabel);
    txnRightY += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Plan:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${planLabel} — ${cycleLabel}`);
    txnRightY += 13;
    doc.font('Helvetica').fillColor(GRAY_700).text(`Credits:`, txnRightX, txnRightY, { width: pageWidth * 0.25, continued: true })
      .font('Helvetica-Bold').fillColor(GRAY_900).text(`${credits.toLocaleString()}`);

    y = Math.max(y, txnRightY) + 20;

    // ─── FOOTER ───

    // Check if footer fits
    if (y + 70 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).lineWidth(0.5).strokeColor(GRAY_300).stroke();
    y += 12;

    // Capture the baseline so the right column aligns with the left column.
    const footerBaselineY = y;

    // Left: Company details (QuantumFusion Solutions)
    doc.fontSize(8).font('Helvetica-Bold').fillColor(GRAY_500).text('COMPANY DETAILS', leftX, y, { width: pageWidth * 0.45 });
    y += 12;
    doc.fontSize(8.5).font('Helvetica').fillColor(GRAY_500);
    doc.text(data.companyName, leftX, y, { width: pageWidth * 0.45 });
    y += 11;
    doc.text(data.companyAddress, leftX, y, { width: pageWidth * 0.45 });
    y += 11;
    doc.text(data.companyEmail, leftX, y, { width: pageWidth * 0.45 });
    y += 11;
    doc.text(data.companyPhone, leftX, y, { width: pageWidth * 0.45 });
    if (data.companyGstNumber) {
      y += 11;
      doc.text(`GSTIN: ${data.companyGstNumber}`, leftX, y, { width: pageWidth * 0.45 });
    }

    // Right: Thank you note (aligned to the footer baseline)
    const footerRightX = leftX + pageWidth * 0.55;
    const footerRightY = footerBaselineY;
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

// ===== GENERATE INVOICE PDF =====

export async function generateInvoicePdf(paymentOrderId: string, options?: { force?: boolean }): Promise<GenerateInvoicePdfResult> {
  try {
    // 1. Fetch PaymentOrder + User from DB
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: { user: true, invoice: true },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    if (order.status !== 'completed' && !options?.force) {
      return { success: false, error: 'Invoice can only be generated for completed payments. Use force option to override.' };
    }

    const user = order.user;
    const currency = (order.currency || 'USD') as InvoiceCurrency;

    // 2. Check if invoice already exists with a valid PDF URL
    const existingInvoice = await db.invoice.findUnique({
      where: { paymentOrderId },
    });

    if (existingInvoice?.pdfUrl && !existingInvoice.pdfUrl.startsWith('data:')) {
      // Real PDF already generated, return existing URL
      return {
        success: true,
        pdfUrl: existingInvoice.pdfUrl,
        invoiceId: existingInvoice.id,
      };
    }

    // 3. Generate invoice number (INV-[year]-[6 digits])
    const invoiceNumber = existingInvoice?.invoiceNumber || generateInvoiceNumber();

    // 4. Build line items
    // FIX 4: credit add-on orders get a descriptive pack line item instead
    // of the generic "Credit_addon Plan Subscription" label.
    const cycleLabel = order.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
    let lineItems: InvoiceLineItem[];
    if (order.plan === 'credit_addon') {
      // Determine the credit count from the couponCode (addon:credits_500)
      const addonId = order.couponCode?.startsWith('addon:')
        ? order.couponCode.slice(6)
        : null;
      const creditMatch = addonId?.match(/credits_(\d+)/);
      const creditCount = creditMatch ? parseInt(creditMatch[1], 10) : null;
      lineItems = [
        {
          description: creditCount
            ? `Credit Add-on Pack (${creditCount.toLocaleString()} credits)`
            : 'Credit Add-on Pack',
          quantity: 1,
          unitPrice: order.subtotal || order.amount,
          total: order.subtotal || order.amount,
        },
      ];
    } else {
      const planLabel = `${order.plan.charAt(0).toUpperCase() + order.plan.slice(1)} Plan`;
      lineItems = [
        {
          description: `${planLabel} Subscription — ${cycleLabel}`,
          quantity: 1,
          unitPrice: order.subtotal || order.amount,
          total: order.subtotal || order.amount,
        },
      ];
    }

    // Add discount line item if any
    if (order.discountAmount > 0) {
      lineItems.push({
        description: `Discount (${order.couponCode || 'Coupon'})`,
        quantity: 1,
        unitPrice: -order.discountAmount,
        total: -order.discountAmount,
      });
    }

    // 5. Determine GST breakdown
    const isIndianUser = order.isIndianUser || currency === 'INR';
    const taxExempt = !isIndianUser;
    let taxRate = order.taxRate || 0;
    let taxAmount = order.taxAmount || 0;

    // Recalculate GST if Indian user and no tax stored
    if (isIndianUser && !taxExempt && taxAmount === 0) {
      taxRate = 0.18;
      taxAmount = Math.round((order.subtotal || order.amount) * taxRate * 100) / 100;
    }

    const subtotal = order.subtotal || order.amount;
    const total = order.amount || (subtotal + taxAmount);

    // FIX 4: Fetch the card last4 from Stripe so the invoice can show
    // "Card (•••• 4242)". Best-effort — never blocks invoice generation.
    let cardLast4: string | undefined;
    if (order.provider === 'stripe' && order.providerPaymentId) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
        let paymentIntentId = order.providerPaymentId;
        // If we only have the checkout session id, resolve the PI first.
        if (order.providerPaymentId.startsWith('cs_')) {
          const session = await stripe.checkout.sessions.retrieve(order.providerPaymentId);
          paymentIntentId = session.payment_intent?.toString() || '';
        }
        if (paymentIntentId && paymentIntentId.startsWith('pi_')) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : null;
          if (pmId) {
            const pm = await stripe.paymentMethods.retrieve(pmId);
            if (pm.card?.last4) cardLast4 = pm.card.last4;
          }
        }
      } catch (err) {
        console.error('[InvoicePdfService] Could not fetch card last4 from Stripe:', err);
      }
    }

    // 6. Assemble InvoiceData
    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceId: existingInvoice?.id || '',
      date: order.createdAt,
      dueDate: order.createdAt,
      userId: order.userId,
      userName: user.name || user.email,
      userEmail: user.email,
      lineItems,
      subtotal,
      taxRate,
      taxAmount,
      total,
      currency,
      gstNumber: order.gstNumber || undefined,
      taxExempt,
      companyName: COMPANY_DETAILS.name,
      companyAddress: COMPANY_DETAILS.address,
      companyEmail: COMPANY_DETAILS.email,
      companyPhone: COMPANY_DETAILS.phone,
      companyGstNumber: COMPANY_DETAILS.gstNumber || undefined,
      companyTaxId: COMPANY_DETAILS.taxId || undefined,
      paymentOrderId: order.id,
      plan: order.plan,
      billingCycle: order.billingCycle,
      providerPaymentId: order.providerPaymentId || undefined,
      provider: order.provider || undefined,
      cardLast4,
      paymentStatus: 'PAID',
    };

    // 7. Generate the PDF buffer using pdfkit
    const pdfBuffer = await buildPdfBuffer(invoiceData);

    // 8. Ensure invoices directory exists
    const invoicesDir = ensureInvoicesDir();

    // 9. Save PDF to public/invoices/{invoiceNumber}.pdf
    const fileName = `${invoiceNumber}.pdf`;
    const filePath = path.join(invoicesDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    // 10. Update or create Invoice record with real PDF URL
    const pdfUrl = `/invoices/${fileName}`;

    const invoice = await db.invoice.upsert({
      where: { paymentOrderId },
      create: {
        paymentOrderId,
        invoiceNumber,
        userId: invoiceData.userId,
        subtotal: invoiceData.subtotal,
        taxRate: invoiceData.taxRate,
        taxAmount: invoiceData.taxAmount,
        total: invoiceData.total,
        currency: invoiceData.currency,
        gstNumber: invoiceData.gstNumber || null,
        taxExempt: invoiceData.taxExempt,
        pdfUrl,
        lineItems: JSON.stringify(invoiceData.lineItems),
      },
      update: {
        pdfUrl,
        subtotal: invoiceData.subtotal,
        taxRate: invoiceData.taxRate,
        taxAmount: invoiceData.taxAmount,
        total: invoiceData.total,
        lineItems: JSON.stringify(invoiceData.lineItems),
      },
    });

    // 11. Log the invoice generation
    await logPaymentEvent(invoiceData.userId, 'payment_completed', {
      amount: invoiceData.total,
      currency: invoiceData.currency,
      provider: order.provider,
      plan: invoiceData.plan,
      paymentOrderId,
    });

    return {
      success: true,
      pdfUrl,
      invoiceId: invoice.id,
    };
  } catch (error) {
    console.error('[InvoicePdfService] Failed to generate invoice PDF:', error);
    return { success: false, error: 'Failed to generate invoice PDF' };
  }
}

// ===== GENERATE INVOICE HTML (Fallback) =====
// Kept for backward compatibility with existing route that imports this.

export async function generateInvoiceHtml(paymentOrderId: string): Promise<{ success: boolean; html?: string; data?: InvoiceData; error?: string }> {
  try {
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: { invoice: true, user: true },
    });

    if (!order) {
      return { success: false, error: 'Payment order not found' };
    }

    if (order.status !== 'completed') {
      return { success: false, error: 'Invoice can only be generated for completed payments' };
    }

    const user = order.user;
    const currency = (order.currency || 'USD') as InvoiceCurrency;

    // Build line items
    const planLabel = `${order.plan.charAt(0).toUpperCase() + order.plan.slice(1)} Plan`;
    const cycleLabel = order.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
    const lineItems: InvoiceLineItem[] = [
      {
        description: `${planLabel} Subscription — ${cycleLabel}`,
        quantity: 1,
        unitPrice: order.subtotal || order.amount,
        total: order.subtotal || order.amount,
      },
    ];

    // Add discount as a separate line item if any
    if (order.discountAmount > 0) {
      lineItems.push({
        description: `Discount (${order.couponCode || 'Coupon'})`,
        quantity: 1,
        unitPrice: -order.discountAmount,
        total: -order.discountAmount,
      });
    }

    const invoiceData: InvoiceData = {
      invoiceNumber: order.invoice?.invoiceNumber || generateInvoiceNumber(),
      invoiceId: order.invoice?.id || '',
      date: order.createdAt,
      dueDate: order.createdAt,
      userId: order.userId,
      userName: user.name || user.email,
      userEmail: user.email,
      lineItems,
      subtotal: order.subtotal || order.amount,
      taxRate: order.taxRate || 0,
      taxAmount: order.taxAmount || 0,
      total: order.amount,
      currency,
      gstNumber: order.gstNumber || undefined,
      taxExempt: order.invoice?.taxExempt || false,
      companyName: COMPANY_DETAILS.name,
      companyAddress: COMPANY_DETAILS.address,
      companyEmail: COMPANY_DETAILS.email,
      companyPhone: COMPANY_DETAILS.phone,
      companyGstNumber: COMPANY_DETAILS.gstNumber || undefined,
      companyTaxId: COMPANY_DETAILS.taxId || undefined,
      paymentOrderId: order.id,
      plan: order.plan,
      billingCycle: order.billingCycle,
    };

    // Generate a simple HTML fallback
    const isGstInvoice = currency === 'INR' && invoiceData.gstNumber;
    const taxLabel = isGstInvoice ? 'GST' : 'Tax';
    const credits = PLAN_CREDITS[invoiceData.plan as PlanType] ?? 0;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceData.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
    .invoice-container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #0d9488; padding-bottom: 20px; }
    .company-info h1 { font-size: 24px; color: #0d9488; margin-bottom: 8px; }
    .company-info p { font-size: 12px; color: #64748b; line-height: 1.6; }
    .invoice-meta { text-align: right; }
    .invoice-meta h2 { font-size: 20px; color: #1a1a2e; margin-bottom: 8px; }
    .invoice-meta p { font-size: 12px; color: #64748b; }
    .billing-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bill-to, .bill-from { flex: 1; }
    .bill-to h3, .bill-from h3 { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; margin-bottom: 8px; }
    .bill-to p, .bill-from p { font-size: 13px; line-height: 1.8; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #f1f5f9; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    tbody td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
    tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; color: #475569; }
    .totals-row.total { border-top: 2px solid #0d9488; padding-top: 12px; margin-top: 4px; font-size: 18px; font-weight: 700; color: #1a1a2e; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; }
    .footer p { font-size: 11px; color: #94a3b8; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="company-info">
        <h1>${invoiceData.companyName}</h1>
        <p>${invoiceData.companyAddress}<br/>
        ${invoiceData.companyEmail}<br/>
        ${invoiceData.companyPhone}</p>
        ${invoiceData.companyGstNumber ? `<p style="margin-top:8px;">GSTIN: ${invoiceData.companyGstNumber}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>INVOICE</h2>
        <p><strong>Invoice #:</strong> ${invoiceData.invoiceNumber}</p>
        <p><strong>Date:</strong> ${formatDate(invoiceData.date)}</p>
        <p><strong>Due Date:</strong> ${formatDate(invoiceData.dueDate)}</p>
      </div>
    </div>

    <div class="billing-info">
      <div class="bill-to">
        <h3>Bill To</h3>
        <p><strong>${invoiceData.userName}</strong><br/>
        ${invoiceData.userEmail}</p>
        ${invoiceData.gstNumber ? `<p style="margin-top:8px;">GSTIN: ${invoiceData.gstNumber}</p>` : ''}
      </div>
      <div class="bill-from">
        <h3>Payment Details</h3>
        <p><strong>Plan:</strong> ${planLabel} — ${cycleLabel}<br/>
        <strong>Credits:</strong> ${credits.toLocaleString()}<br/>
        <strong>Method:</strong> ${order.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}<br/>
        <strong>Transaction ID:</strong> ${order.providerPaymentId || order.id}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceData.lineItems.map(item => `
        <tr>
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unitPrice, invoiceData.currency)}</td>
          <td>${formatCurrency(item.total, invoiceData.currency)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatCurrency(invoiceData.subtotal, invoiceData.currency)}</span>
      </div>
      ${invoiceData.taxRate > 0 && !invoiceData.taxExempt ? `
      <div class="totals-row">
        <span>${taxLabel} (${(invoiceData.taxRate * 100).toFixed(0)}%)</span>
        <span>${formatCurrency(invoiceData.taxAmount, invoiceData.currency)}</span>
      </div>
      ${isGstInvoice ? `
      <div class="totals-row" style="font-size:11px;color:#94a3b8;">
        <span>CGST (${(invoiceData.taxRate * 50).toFixed(0)}%)</span>
        <span>${formatCurrency(invoiceData.taxAmount / 2, invoiceData.currency)}</span>
      </div>
      <div class="totals-row" style="font-size:11px;color:#94a3b8;">
        <span>SGST (${(invoiceData.taxRate * 50).toFixed(0)}%)</span>
        <span>${formatCurrency(invoiceData.taxAmount / 2, invoiceData.currency)}</span>
      </div>` : ''}
      ` : ''}
      <div class="totals-row total">
        <span>Total</span>
        <span>${formatCurrency(invoiceData.total, invoiceData.currency)}</span>
      </div>
    </div>

    <div class="footer">
      <div class="note">
        <p><strong>Payment Terms:</strong> Due upon receipt</p>
        <p><strong>Notes:</strong> This is a computer-generated invoice. No signature required.</p>
      </div>
      <div>
        <p>Thank you for your business!</p>
        <p style="margin-top:8px;">${invoiceData.companyName}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    return { success: true, html, data: invoiceData };
  } catch (error) {
    console.error('[InvoicePdfService] Failed to generate invoice HTML:', error);
    return { success: false, error: 'Failed to generate invoice HTML' };
  }
}

// ===== GET INVOICE BY PAYMENT ORDER =====

export async function getInvoiceForOrder(paymentOrderId: string): Promise<{
  success: boolean;
  invoice?: {
    id: string;
    invoiceNumber: string;
    pdfUrl: string | null;
    total: number;
    currency: string;
    createdAt: Date;
  };
  error?: string;
}> {
  try {
    const invoice = await db.invoice.findUnique({
      where: { paymentOrderId },
      select: {
        id: true,
        invoiceNumber: true,
        pdfUrl: true,
        total: true,
        currency: true,
        createdAt: true,
      },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    return { success: true, invoice };
  } catch (error) {
    console.error('[InvoicePdfService] Failed to get invoice:', error);
    return { success: false, error: 'Failed to get invoice' };
  }
}

// ===== GET INVOICES FOR USER =====

export async function getInvoicesForUser(userId: string, options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    total: number;
    currency: string;
    createdAt: Date;
    pdfUrl: string | null;
  }>;
  total: number;
}> {
  try {
    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          currency: true,
          createdAt: true,
          pdfUrl: true,
        },
      }),
      db.invoice.count({ where: { userId } }),
    ]);

    return { invoices, total };
  } catch (error) {
    console.error('[InvoicePdfService] Failed to get invoices for user:', error);
    return { invoices: [], total: 0 };
  }
}
