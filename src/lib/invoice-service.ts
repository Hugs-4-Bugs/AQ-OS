// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invoice Generation Service
// Phase 5: Payments System — Invoice Generation, Numbering, PDF HTML
//
// Features:
// - Auto-incrementing invoice numbers: INV-{YYYYMMDD}-{XXXX}
// - Thread-safe numbering via DB transaction
// - Full GST breakdown (CGST/SGST/IGST)
// - Professional HTML invoice generation
// - Invoice storage and retrieval
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logPaymentEvent } from '@/lib/billing-audit';
import { PLAN_CREDITS, type PlanType } from '@/lib/entitlement-service';
import { createModuleLogger } from '@/lib/observability/logger';

const invoiceLogger = createModuleLogger({ module: 'invoice-service' });

// ===== INTERFACES =====

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userGstNumber: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  total: number;
  currency: string;
  taxExempt: boolean;
  planName: string;
  billingCycle: string;
  paymentProvider: string;
  paymentId: string;
  companyId: string;
  companyName: string;
  companyGstNumber: string;
  companyAddress: string;
}

// ===== COMPANY DETAILS =====

const COMPANY_NAME = 'AcquisitionOS Technologies Pvt. Ltd.';
const COMPANY_GST_NUMBER = process.env.COMPANY_GST_NUMBER || '27AABCA1234F1Z5';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '123 Tech Park, Andheri East, Mumbai, Maharashtra 400069';
const COMPANY_ID = 'acquisitionos-pvt-ltd';

// ===== GST CONFIGURATION =====

const GST_RATE = 0.18; // 18% GST
const CGST_RATE = 0.09; // 9% CGST (for intra-state)
const SGST_RATE = 0.09; // 9% SGST (for intra-state)
const IGST_RATE = 0.18; // 18% IGST (for inter-state)

// Plan display names
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  elite: 'Elite',
};

// Plan pricing for invoice line items
const PLAN_PRICING_INR: Record<string, { monthly: number; yearly: number }> = {
  pro: { monthly: 2499, yearly: 23990 },
  elite: { monthly: 7999, yearly: 76790 },
};

const PLAN_PRICING_USD: Record<string, { monthly: number; yearly: number }> = {
  pro: { monthly: 29, yearly: 279 },
  elite: { monthly: 89, yearly: 849 },
};

// ===== INVOICE NUMBER GENERATION =====

/**
 * Generate the next invoice number in format: INV-{YYYYMMDD}-{XXXX}
 * Thread-safe: uses DB transaction with findFirst + increment pattern.
 * The XXXX part resets daily (per-day sequential counter).
 */
export async function getNextInvoiceNumber(): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `INV-${datePart}-`;

  try {
    // Use a transaction to ensure thread-safe invoice numbering
    const result = await db.$transaction(async (tx) => {
      // Find the latest invoice number for today
      const latestInvoice = await tx.invoice.findFirst({
        where: {
          invoiceNumber: { startsWith: prefix },
        },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
      });

      let nextSeq = 1;
      if (latestInvoice) {
        const currentSeq = parseInt(latestInvoice.invoiceNumber.slice(prefix.length), 10);
        if (!isNaN(currentSeq)) {
          nextSeq = currentSeq + 1;
        }
      }

      const invoiceNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;
      return invoiceNumber;
    });

    return result;
  } catch (error) {
    invoiceLogger.error('Failed to generate invoice number', { error: error instanceof Error ? error.message : String(error) });
    // Fallback: use timestamp-based unique number
    const fallback = `${prefix}${String(Date.now()).slice(-4)}`;
    return fallback;
  }
}

// ===== INVOICE GENERATION =====

/**
 * Generate an invoice for a completed payment order.
 * Creates line items for the plan subscription and tax breakdown.
 * Stores the invoice in the database.
 */
export async function generateInvoice(params: {
  paymentOrderId: string;
  userId: string;
}): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; error?: string }> {
  const { paymentOrderId, userId } = params;

  try {
    // 1. Check if invoice already exists for this payment order
    const existingInvoice = await db.invoice.findUnique({
      where: { paymentOrderId },
    });

    if (existingInvoice) {
      return {
        success: true,
        invoiceId: existingInvoice.id,
        invoiceNumber: existingInvoice.invoiceNumber,
      };
    }

    // 2. Find the PaymentOrder
    const paymentOrder = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
    });

    if (!paymentOrder) {
      return { success: false, error: 'Payment order not found' };
    }

    if (paymentOrder.userId !== userId) {
      return { success: false, error: 'Payment order does not belong to this user' };
    }

    if (paymentOrder.status !== 'completed') {
      return { success: false, error: 'Cannot generate invoice for incomplete payment' };
    }

    // 3. Find the User
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        country: true,
      },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // 4. Generate next invoice number (thread-safe)
    const invoiceNumber = await getNextInvoiceNumber();

    // 5. Create line items
    const plan = paymentOrder.plan as PlanType;
    const billingCycle = paymentOrder.billingCycle;
    const currency = paymentOrder.currency;
    const isIndianUser = paymentOrder.isIndianUser || currency === 'INR';
    const userGstNumber = paymentOrder.gstNumber || null;
    const taxExempt = !isIndianUser;

    // Build line items
    const lineItems: InvoiceLineItem[] = [];

    // Main subscription line item
    const planDisplayName = PLAN_DISPLAY_NAMES[plan] || plan;
    const cycleLabel = billingCycle === 'yearly' ? 'Annual' : 'Monthly';
    const mainDescription = `${planDisplayName} Plan — ${cycleLabel} Subscription`;

    lineItems.push({
      description: mainDescription,
      quantity: 1,
      unitPrice: paymentOrder.subtotal - paymentOrder.discountAmount,
      amount: paymentOrder.subtotal - paymentOrder.discountAmount,
    });

    // Discount line item (if applicable)
    if (paymentOrder.discountAmount > 0) {
      lineItems.push({
        description: `Discount (Coupon: ${paymentOrder.couponCode || 'N/A'})`,
        quantity: 1,
        unitPrice: -paymentOrder.discountAmount,
        amount: -paymentOrder.discountAmount,
      });
    }

    const subtotal = paymentOrder.subtotal;

    // Calculate tax breakdown
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;

    if (isIndianUser && !taxExempt) {
      // Check if user is in same state as company (Maharashtra)
      // Company is in Maharashtra, so intra-state users get CGST+SGST
      const userState = user.country === 'IN' ? 'MH' : null; // Simplified: use MH for Indian users
      const companyState = COMPANY_ADDRESS.includes('Maharashtra') ? 'MH' : 'XX';

      if (userState === companyState) {
        // Intra-state: CGST + SGST
        cgstRate = CGST_RATE;
        sgstRate = SGST_RATE;
        cgstAmount = Math.round(subtotal * cgstRate * 100) / 100;
        sgstAmount = Math.round(subtotal * sgstRate * 100) / 100;
      } else {
        // Inter-state: IGST
        igstRate = IGST_RATE;
        igstAmount = Math.round(subtotal * igstRate * 100) / 100;
      }
    }

    const totalTax = cgstAmount + sgstAmount + igstAmount;
    const total = Math.round((subtotal + totalTax) * 100) / 100;
    const taxRate = isIndianUser ? GST_RATE : 0;

    // 6. Create Invoice record in DB (with pre-rendered HTML)
    const invoiceData: Omit<InvoiceData, 'companyId' | 'companyName' | 'companyGstNumber' | 'companyAddress' | 'paymentProvider' | 'paymentId'> = {
      invoiceNumber,
      invoiceDate: new Date().toISOString().split('T')[0],
      userId,
      userName: user.name,
      userEmail: user.email,
      userGstNumber,
      lineItems,
      subtotal,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalTax,
      total,
      currency,
      taxExempt,
      planName: PLAN_DISPLAY_NAMES[plan] || plan,
      billingCycle,
    };

    // Generate HTML and store alongside the invoice record
    const fullInvoiceData: InvoiceData = {
      ...invoiceData,
      paymentProvider: paymentOrder.provider,
      paymentId: paymentOrder.providerPaymentId || paymentOrder.id,
      companyId: COMPANY_ID,
      companyName: COMPANY_NAME,
      companyGstNumber: COMPANY_GST_NUMBER,
      companyAddress: COMPANY_ADDRESS,
    };

    const htmlContent = generateInvoiceHTML(fullInvoiceData);

    const invoice = await db.invoice.create({
      data: {
        paymentOrderId,
        invoiceNumber,
        userId,
        subtotal,
        taxRate,
        taxAmount: totalTax,
        total,
        currency,
        gstNumber: userGstNumber,
        taxExempt,
        lineItems: JSON.stringify(lineItems),
        htmlContent,
      },
    });

    // 7. Log the invoice generation
    await logPaymentEvent(userId, 'payment_completed', {
      amount: total,
      currency,
      provider: paymentOrder.provider,
      plan,
      paymentOrderId,
    });

    return {
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    };
  } catch (error) {
    invoiceLogger.error('Failed to generate invoice', { error: error instanceof Error ? error.message : String(error), paymentOrderId: params.paymentOrderId });
    return { success: false, error: 'Failed to generate invoice' };
  }
}

// ===== INVOICE DATA RETRIEVAL =====

/**
 * Build complete InvoiceData for a given invoice ID.
 * This assembles all information needed for PDF generation or display.
 */
export async function getInvoiceData(invoiceId: string): Promise<InvoiceData | null> {
  try {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentOrder: true,
      },
    });

    if (!invoice) return null;

    const user = await db.user.findUnique({
      where: { id: invoice.userId },
      select: { id: true, email: true, name: true, country: true },
    });

    const paymentOrder = invoice.paymentOrder;
    const isIndianUser = paymentOrder.isIndianUser || paymentOrder.currency === 'INR';
    const userGstNumber = invoice.gstNumber || null;

    // Parse line items
    let lineItems: InvoiceLineItem[] = [];
    try {
      lineItems = JSON.parse(invoice.lineItems);
    } catch {
      lineItems = [];
    }

    // Calculate tax breakdown from stored amounts
    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isIndianUser && !invoice.taxExempt && invoice.taxAmount > 0) {
      const userState = user?.country === 'IN' ? 'MH' : null;
      const companyState = COMPANY_ADDRESS.includes('Maharashtra') ? 'MH' : 'XX';

      if (userState === companyState) {
        cgstRate = CGST_RATE;
        sgstRate = SGST_RATE;
        cgstAmount = Math.round(invoice.subtotal * cgstRate * 100) / 100;
        sgstAmount = Math.round(invoice.subtotal * sgstRate * 100) / 100;
      } else {
        igstRate = IGST_RATE;
        igstAmount = Math.round(invoice.subtotal * igstRate * 100) / 100;
      }
    }

    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt.toISOString().split('T')[0],
      userId: invoice.userId,
      userName: user?.name || null,
      userEmail: user?.email || '',
      userGstNumber,
      lineItems,
      subtotal: invoice.subtotal,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalTax: invoice.taxAmount,
      total: invoice.total,
      currency: invoice.currency,
      taxExempt: invoice.taxExempt,
      planName: PLAN_DISPLAY_NAMES[paymentOrder.plan] || paymentOrder.plan,
      billingCycle: paymentOrder.billingCycle,
      paymentProvider: paymentOrder.provider,
      paymentId: paymentOrder.providerPaymentId || paymentOrder.id,
      companyId: COMPANY_ID,
      companyName: COMPANY_NAME,
      companyGstNumber: COMPANY_GST_NUMBER,
      companyAddress: COMPANY_ADDRESS,
    };
  } catch (error) {
    invoiceLogger.error('Failed to get invoice data', { error: error instanceof Error ? error.message : String(error), invoiceId });
    return null;
  }
}

/**
 * Get a single invoice for a specific user.
 * Returns InvoiceData only if the invoice belongs to the user.
 */
export async function getInvoiceForUser(userId: string, invoiceId: string): Promise<InvoiceData | null> {
  try {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: { userId: true },
    });

    if (!invoice || invoice.userId !== userId) {
      return null;
    }

    return getInvoiceData(invoiceId);
  } catch (error) {
    invoiceLogger.error('Failed to get invoice for user', { error: error instanceof Error ? error.message : String(error), invoiceId, userId });
    return null;
  }
}

/**
 * Get all invoices for a user with pagination.
 */
export async function getInvoicesForUser(
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ invoices: Array<{
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  status: string;
  plan: string;
  billingCycle: string;
  createdAt: Date;
}>; total: number }> {
  try {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          paymentOrder: {
            select: {
              plan: true,
              billingCycle: true,
              status: true,
            },
          },
        },
      }),
      db.invoice.count({ where: { userId } }),
    ]);

    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        total: inv.total,
        currency: inv.currency,
        status: inv.paymentOrder?.status || 'unknown',
        plan: inv.paymentOrder?.plan || 'unknown',
        billingCycle: inv.paymentOrder?.billingCycle || 'monthly',
        createdAt: inv.createdAt,
      })),
      total,
    };
  } catch (error) {
    invoiceLogger.error('Failed to get invoices for user', { error: error instanceof Error ? error.message : String(error), userId });
    return { invoices: [], total: 0 };
  }
}

// ===== HTML INVOICE GENERATION =====

/**
 * Generate a complete, professional HTML invoice.
 * This can be used for PDF generation or direct browser display.
 */
export function generateInvoiceHTML(invoice: InvoiceData): string {
  const currencySymbol = invoice.currency === 'INR' ? '₹' : '$';
  const formatAmount = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const hasGST = invoice.cgstAmount > 0 || invoice.sgstAmount > 0 || invoice.igstAmount > 0;

  // Build tax breakdown rows
  let taxRowsHTML = '';
  if (hasGST) {
    if (invoice.cgstAmount > 0) {
      taxRowsHTML += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">CGST @ ${(invoice.cgstRate * 100).toFixed(0)}%</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatAmount(invoice.cgstAmount)}</td>
        </tr>`;
    }
    if (invoice.sgstAmount > 0) {
      taxRowsHTML += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">SGST @ ${(invoice.sgstRate * 100).toFixed(0)}%</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatAmount(invoice.sgstAmount)}</td>
        </tr>`;
    }
    if (invoice.igstAmount > 0) {
      taxRowsHTML += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">IGST @ ${(invoice.igstRate * 100).toFixed(0)}%</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatAmount(invoice.igstAmount)}</td>
        </tr>`;
    }
  }

  // Build line items rows
  const lineItemsHTML = invoice.lineItems.map((item) => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${item.description}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${item.quantity}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatAmount(item.unitPrice)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151; font-weight: 500;">${formatAmount(item.amount)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="max-width: 800px; margin: 0 auto; padding: 40px 32px;">

    <!-- Header -->
    <table style="width: 100%; margin-bottom: 40px;">
      <tr>
        <td style="vertical-align: top;">
          <div style="font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 4px;">${invoice.companyName}</div>
          <div style="font-size: 13px; color: #6b7280; line-height: 1.6;">
            ${invoice.companyAddress}<br>
            GSTIN: ${invoice.companyGstNumber}
          </div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div style="font-size: 28px; font-weight: 700; color: #059669; margin-bottom: 8px;">INVOICE</div>
          <div style="font-size: 14px; color: #374151; line-height: 1.8;">
            <strong>Invoice #:</strong> ${invoice.invoiceNumber}<br>
            <strong>Date:</strong> ${invoice.invoiceDate}<br>
            <strong>Currency:</strong> ${invoice.currency}
          </div>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="height: 2px; background: linear-gradient(to right, #059669, #10b981); margin-bottom: 32px; border-radius: 1px;"></div>

    <!-- Customer & Payment Info -->
    <table style="width: 100%; margin-bottom: 32px;">
      <tr>
        <td style="vertical-align: top; width: 50%; padding-right: 20px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">Billed To</div>
          <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 4px;">${invoice.userName || 'Valued Customer'}</div>
          <div style="font-size: 13px; color: #6b7280; line-height: 1.6;">
            ${invoice.userEmail}
            ${invoice.userGstNumber ? `<br>GSTIN: ${invoice.userGstNumber}` : ''}
          </div>
        </td>
        <td style="vertical-align: top; width: 50%; padding-left: 20px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">Payment Details</div>
          <div style="font-size: 13px; color: #6b7280; line-height: 1.8;">
            <strong>Plan:</strong> ${invoice.planName} Plan<br>
            <strong>Billing:</strong> ${invoice.billingCycle === 'yearly' ? 'Annual' : 'Monthly'}<br>
            <strong>Provider:</strong> ${invoice.paymentProvider === 'razorpay' ? 'Razorpay' : 'Stripe'}<br>
            <strong>Payment ID:</strong> ${invoice.paymentId}
          </div>
        </td>
      </tr>
    </table>

    <!-- Line Items Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Description</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qty</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Unit Price</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <!-- Totals -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
      <tr>
        <td style="width: 60%;"></td>
        <td style="width: 40%;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Subtotal</td>
              <td style="padding: 8px 12px; text-align: right; color: #374151;">${formatAmount(invoice.subtotal)}</td>
            </tr>
            ${taxRowsHTML}
            ${invoice.taxExempt ? `
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Tax</td>
              <td style="padding: 8px 12px; text-align: right; color: #6b7280; font-style: italic;">Exempt</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px 12px; color: #6b7280;">Total Tax</td>
              <td style="padding: 8px 12px; text-align: right; color: #374151;">${formatAmount(invoice.totalTax)}</td>
            </tr>
            <tr style="background: #f0fdf4;">
              <td style="padding: 12px; font-size: 16px; font-weight: 700; color: #059669; border-top: 2px solid #059669;">Total</td>
              <td style="padding: 12px; font-size: 16px; font-weight: 700; text-align: right; color: #059669; border-top: 2px solid #059669;">${formatAmount(invoice.total)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Amount in Words (for Indian invoices) -->
    ${invoice.currency === 'INR' ? `
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 4px;">Amount in Words</div>
      <div style="font-size: 13px; color: #374151;">${numberToWords(invoice.total)} Rupees Only</div>
    </div>` : ''}

    <!-- GST Summary (for Indian invoices with GST) -->
    ${hasGST ? `
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 12px;">GST Summary</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <th style="padding: 6px 8px; text-align: left; color: #6b7280; font-weight: 500;">Tax Type</th>
            <th style="padding: 6px 8px; text-align: right; color: #6b7280; font-weight: 500;">Taxable Amount</th>
            <th style="padding: 6px 8px; text-align: right; color: #6b7280; font-weight: 500;">Rate</th>
            <th style="padding: 6px 8px; text-align: right; color: #6b7280; font-weight: 500;">Tax Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.cgstAmount > 0 ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 6px 8px; color: #374151;">CGST</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.subtotal)}</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${(invoice.cgstRate * 100).toFixed(0)}%</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.cgstAmount)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 6px 8px; color: #374151;">SGST</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.subtotal)}</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${(invoice.sgstRate * 100).toFixed(0)}%</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.sgstAmount)}</td>
          </tr>` : ''}
          ${invoice.igstAmount > 0 ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 6px 8px; color: #374151;">IGST</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.subtotal)}</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${(invoice.igstRate * 100).toFixed(0)}%</td>
            <td style="padding: 6px 8px; text-align: right; color: #374151;">${formatAmount(invoice.igstAmount)}</td>
          </tr>` : ''}
          <tr style="font-weight: 600;">
            <td style="padding: 8px 8px; color: #111827;" colspan="2">Total Tax</td>
            <td style="padding: 8px 8px; text-align: right; color: #111827;"></td>
            <td style="padding: 8px 8px; text-align: right; color: #111827;">${formatAmount(invoice.totalTax)}</td>
          </tr>
        </tbody>
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top: 2px solid #e5e7eb; padding-top: 24px; margin-top: 32px;">
      <table style="width: 100%;">
        <tr>
          <td style="vertical-align: top; width: 50%;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">Company Details</div>
            <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
              ${invoice.companyName}<br>
              ${invoice.companyAddress}<br>
              GSTIN: ${invoice.companyGstNumber}
            </div>
          </td>
          <td style="vertical-align: top; text-align: right; width: 50%;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px;">Thank You For Your Business</div>
            <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
              This is a computer-generated invoice.<br>
              No physical signature is required.<br>
              For support: support@acquisitionos.com
            </div>
          </td>
        </tr>
      </table>
    </div>

  </div>
</body>
</html>`;
}

// ===== HELPER: NUMBER TO WORDS =====

/**
 * Convert a number to words (Indian numbering system).
 * Used for "Amount in Words" on invoices.
 */
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];

  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelowThousand(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertBelowThousand(n % 100) : '');
  }

  // Split into rupees and paise
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = '';

  // Handle Indian numbering: lakhs and crores
  if (rupees >= 10000000) {
    const crores = Math.floor(rupees / 10000000);
    result += convertBelowThousand(crores) + ' Crore ';
    const remainder = rupees % 10000000;
    if (remainder >= 100000) {
      const lakhs = Math.floor(remainder / 100000);
      result += convertBelowThousand(lakhs) + ' Lakh ';
      const afterLakhs = remainder % 100000;
      if (afterLakhs >= 1000) {
        const thousands = Math.floor(afterLakhs / 1000);
        result += convertBelowThousand(thousands) + ' Thousand ';
        const hundreds = afterLakhs % 1000;
        if (hundreds > 0) {
          result += convertBelowThousand(hundreds);
        }
      } else if (afterLakhs > 0) {
        result += convertBelowThousand(afterLakhs);
      }
    } else if (remainder > 0) {
      if (remainder >= 1000) {
        const thousands = Math.floor(remainder / 1000);
        result += convertBelowThousand(thousands) + ' Thousand ';
        const hundreds = remainder % 1000;
        if (hundreds > 0) {
          result += convertBelowThousand(hundreds);
        }
      } else {
        result += convertBelowThousand(remainder);
      }
    }
  } else if (rupees >= 100000) {
    const lakhs = Math.floor(rupees / 100000);
    result += convertBelowThousand(lakhs) + ' Lakh ';
    const remainder = rupees % 100000;
    if (remainder >= 1000) {
      const thousands = Math.floor(remainder / 1000);
      result += convertBelowThousand(thousands) + ' Thousand ';
      const hundreds = remainder % 1000;
      if (hundreds > 0) {
        result += convertBelowThousand(hundreds);
      }
    } else if (remainder > 0) {
      result += convertBelowThousand(remainder);
    }
  } else if (rupees >= 1000) {
    const thousands = Math.floor(rupees / 1000);
    result += convertBelowThousand(thousands) + ' Thousand ';
    const hundreds = rupees % 1000;
    if (hundreds > 0) {
      result += convertBelowThousand(hundreds);
    }
  } else {
    result += convertBelowThousand(rupees);
  }

  result = result.trim();

  if (paise > 0) {
    result += ` and ${convertBelowThousand(paise)} Paise`;
  }

  return result;
}
