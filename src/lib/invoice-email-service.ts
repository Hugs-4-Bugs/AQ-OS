// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Invoice Email Service
// Task 4-b: PDF attachment support + invoice email sending
//
// Sends payment invoice emails to users with optional PDF attachment.
// Handles errors gracefully — never throws.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getAppUrl } from '@/lib/app-url';
import { promises as fs } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendInvoiceEmailResult {
  sent: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Plan credit map (mirrors subscription logic)
// ---------------------------------------------------------------------------

const PLAN_CREDITS: Record<string, number> = {
  free: 50,
  pro: 500,
  elite: 2000,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
};

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalizePlan(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

// ---------------------------------------------------------------------------
// PDF attachment reader
// ---------------------------------------------------------------------------

/**
 * Attempts to read the PDF file for an invoice.
 * Handles three cases:
 *   1. pdfUrl is a data: URI → decode the base64 content
 *   2. pdfUrl is a relative path (e.g., "/invoices/inv.pdf") → read from public/
 *   3. pdfUrl is an absolute URL → skip (can't attach remote files)
 *
 * Returns `null` if the file can't be read (graceful degradation).
 */
async function readPdfAttachment(
  pdfUrl: string,
): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
  try {
    // Case 1: Data URI (base64-encoded HTML/PDF content)
    if (pdfUrl.startsWith('data:')) {
      const base64Match = pdfUrl.match(/^data:[^;]*;base64,(.+)$/);
      if (base64Match?.[1]) {
        const buffer = Buffer.from(base64Match[1], 'base64');
        return {
          filename: 'invoice.html',
          content: buffer,
          contentType: 'text/html',
        };
      }
      // Data URI without base64 encoding — skip
      return null;
    }

    // Case 2: Absolute external URL — can't attach
    if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
      console.warn('[InvoiceEmailService] pdfUrl is an external URL — skipping attachment:', pdfUrl);
      return null;
    }

    // Case 3: Relative path — read from public/ directory
    // Try both CWD (standalone) and project root locations
    const relativePath = pdfUrl.startsWith('/') ? pdfUrl.slice(1) : pdfUrl;
    const candidates = [
      path.join(process.cwd(), 'public', relativePath),
      path.join(process.cwd(), '..', '..', 'public', relativePath),
    ];

    let buffer: Buffer | null = null;
    for (const filePath of candidates) {
      try {
        buffer = await fs.readFile(filePath);
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!buffer) {
      console.error('[InvoiceEmailService] PDF file not found in any location:', pdfUrl);
      return null;
    }
    // FIX 4: Attachment filename is invoice-[INV-NUMBER].pdf per spec.
    const baseName = path.basename(relativePath);
    return {
      filename: baseName.startsWith('invoice-') ? baseName : `invoice-${baseName}`,
      content: buffer,
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.error('[InvoiceEmailService] Failed to read PDF attachment:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main function: sendInvoiceEmail
// ---------------------------------------------------------------------------

/**
 * Sends an invoice confirmation email to the user for a completed payment.
 * If the associated Invoice record has a pdfUrl, the PDF/HTML file is
 * attached to the email.  If no PDF exists, the email is still sent
 * with invoice details but without an attachment.
 *
 * This function never throws — errors are caught and returned.
 */
export async function sendInvoiceEmail(
  userId: string,
  paymentOrderId: string,
): Promise<SendInvoiceEmailResult> {
  try {
    // ── 1. Fetch data from DB ──────────────────────────────────────────
    const order = await db.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: {
        user: true,
        invoice: true,
      },
    });

    if (!order) {
      return { sent: false, error: 'Payment order not found' };
    }

    if (order.userId !== userId) {
      return { sent: false, error: 'Payment order does not belong to this user' };
    }

    const user = order.user;
    if (!user?.email) {
      return { sent: false, error: 'User email not found' };
    }

    const invoice = order.invoice;

    // ── 2. Build email content ─────────────────────────────────────────
    const planLabel = capitalizePlan(order.plan);
    const cycleLabel = order.billingCycle === 'yearly' ? 'Annual' : 'Monthly';
    const credits = PLAN_CREDITS[order.plan] ?? 50;
    const appUrl = getAppUrl();
    const dashboardUrl = `${appUrl}/dashboard`;

    const currency = order.currency || 'USD';
    const totalFormatted = formatCurrency(order.amount, currency);
    const subtotalFormatted = formatCurrency(order.subtotal || order.amount, currency);
    const taxFormatted = order.taxAmount > 0 ? formatCurrency(order.taxAmount, currency) : null;

    const invoiceNumber = invoice?.invoiceNumber || 'N/A';
    const invoiceDate = order.createdAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    // Brand colors (consistent with email.ts)
    const BRAND_COLOR = '#0d9488';
    const BRAND_DARK = '#0f766e';
    const BRAND_BG = '#f0fdfa';
    const TEXT_PRIMARY = '#1e293b';
    const TEXT_SECONDARY = '#64748b';
    const BORDER_COLOR = '#e2e8f0';

    // FIX 4: Subject includes the invoice number per spec.
    const subject = `Payment Confirmation — AcquisitionOS ${invoiceNumber}`;

    const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>AcquisitionOS Payment Invoice</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: ${BRAND_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: ${TEXT_PRIMARY}; }
    a { color: ${BRAND_COLOR}; text-decoration: underline; }
    a:hover { color: ${BRAND_DARK}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND_BG}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${TEXT_PRIMARY};">
  <div style="display:none; font-size:1px; color:${BRAND_BG}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    Your payment invoice from AcquisitionOS — ${planLabel} Plan, ${cycleLabel}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);">
          <!-- Brand header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); padding:32px 40px; text-align:center;">
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.3px;">
                AcquisitionOS
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
                Hi <strong>${user.name || user.email}</strong>,
              </p>

              <p style="margin:0 0 24px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
                Thank you for your payment! Your subscription has been activated. Here are your invoice details:
              </p>

              <!-- Invoice details card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px; font-size:14px; line-height:24px; color:${TEXT_PRIMARY};">
                    <strong style="color:${BRAND_DARK};">Invoice #:</strong> ${invoiceNumber}<br />
                    <strong style="color:${BRAND_DARK};">Date:</strong> ${invoiceDate}<br />
                    <strong style="color:${BRAND_DARK};">Plan:</strong> ${planLabel} Plan<br />
                    <strong style="color:${BRAND_DARK};">Billing:</strong> ${cycleLabel}<br />
                    <strong style="color:${BRAND_DARK};">Credits Granted:</strong> ${credits.toLocaleString()} credits<br />
                    <strong style="color:${BRAND_DARK};">Subtotal:</strong> ${subtotalFormatted}
                    ${taxFormatted ? `<br /><strong style="color:${BRAND_DARK};">Tax:</strong> ${taxFormatted}` : ''}
                  </td>
                </tr>
              </table>

              <!-- Total -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; background-color:${BRAND_BG}; border:2px solid ${BRAND_COLOR}; border-radius:8px; overflow:hidden;">
                <tr>
                  <td style="padding:16px 24px; text-align:center;">
                    <span style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:${TEXT_SECONDARY};">Total Paid</span><br />
                    <span style="font-size:28px; font-weight:800; color:${BRAND_DARK};">${totalFormatted}</span>
                  </td>
                </tr>
              </table>

              ${invoice?.pdfUrl ? `
              <p style="margin:0 0 24px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
                📎 Your invoice is attached to this email as a PDF for your records.
              </p>` : ''}

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
                Cheers,<br />
                <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; margin-top:16px;">
          <tr>
            <td style="padding:16px 24px; text-align:center; font-size:12px; line-height:18px; color:${TEXT_SECONDARY};">
              &copy; ${new Date().getFullYear()} AcquisitionOS, Inc. All rights reserved.<br />
              This is an automated message — please do not reply directly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hi ${user.name || user.email},

Thank you for your payment! Your subscription has been activated.

Invoice Details:
  Invoice #: ${invoiceNumber}
  Date: ${invoiceDate}
  Plan: ${planLabel} Plan
  Billing: ${cycleLabel}
  Credits Granted: ${credits.toLocaleString()} credits
  Subtotal: ${subtotalFormatted}${taxFormatted ? `\n  Tax: ${taxFormatted}` : ''}
  Total: ${totalFormatted}
${invoice?.pdfUrl ? '\nYour invoice is attached to this email for your records.' : ''}

Go to Dashboard: ${dashboardUrl}

— The AcquisitionOS Team`;

    // ── 3. Build attachments array ─────────────────────────────────────
    let attachments: Array<{
      filename: string;
      content: Buffer | string;
      contentType?: string;
    }> | undefined;

    if (invoice?.pdfUrl) {
      const attachment = await readPdfAttachment(invoice.pdfUrl);
      if (attachment) {
        attachments = [attachment];
      }
    }

    // ── 4. Send email ──────────────────────────────────────────────────
    const result = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
      attachments,
    });

    if (result.sent) {
      console.log(`[InvoiceEmailService] ✓ Invoice email sent to ${user.email} for order ${paymentOrderId}`);
    } else {
      console.error(`[InvoiceEmailService] ✗ Failed to send invoice email:`, result.error);
    }

    return { sent: result.sent, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error sending invoice email';
    console.error('[InvoiceEmailService] Unhandled error:', message);
    return { sent: false, error: message };
  }
}
