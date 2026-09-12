/**
 * AcquisitionOS Email Service
 *
 * REAL email delivery only — NO Ethereal / preview / test inbox fallback.
 * Provider chain:
 *   1. Resend (primary — modern email API, real key required)
 *   2. Nodemailer SMTP (Gmail SMTP via SMTP_USER / SMTP_PASSWORD)
 *
 * If neither provider is configured, sendEmail() returns a clear error.
 * Auth routes surface that error to the user. There is ZERO fallback to
 * any preview or test inbox — OTP / magic links must NEVER be delivered
 * to a publicly accessible test mailbox.
 */

import {
  isRealResendConfigured,
  isRealSmtpConfigured,
  getSmtpUser,
  getSmtpPassword,
  getSmtpHost,
  getSmtpPort,
  getSmtpFrom,
} from '@/lib/email-ethereal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailResult {
  sent: boolean;
  messageId?: string;
  error?: string;
  devMode?: boolean;
  /**
   * Kept for backward compatibility with existing callers, but ALWAYS
   * undefined now — there is no Ethereal preview URL anymore.
   */
  previewUrl?: string;
  /**
   * Which provider actually accepted the message. Used by auth routes to
   * annotate the API response (`emailProvider` field).
   */
  provider?: 'resend' | 'smtp';
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional CC recipients (comma-separated string or array). */
  cc?: string | string[];
  /** Optional BCC recipients (comma-separated string or array). */
  bcc?: string | string[];
  /** Optional Reply-To address. */
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

// Email bypass is permanently disabled — all emails are sent via the real provider chain.
// SMTP credentials are resolved via the shared alias-aware helpers in email-ethereal.ts
// (supports SMTP_USER/GMAIL_USER and SMTP_PASSWORD/SMTP_PASS/GMAIL_APP_PASSWORD).

/**
 * Returns `true` when at least one REAL email provider is configured.
 *
 * "Configured" means either:
 *   - A real Resend API key (not a placeholder like `re_your-...`), OR
 *   - Real SMTP credentials (not `your-email@gmail.com` / `your-app-password`).
 *
 * Ethereal is NO LONGER considered a provider — there is no test inbox.
 */
export function isEmailServiceConfigured(): boolean {
  return isRealResendConfigured() || isRealSmtpConfigured();
}

/**
 * Returns the human-readable name of the provider that *would* be used right
 * now. Useful for logging and for the `emailProvider` field in API responses.
 */
export function activeEmailProvider(): 'resend' | 'smtp' | 'none' {
  if (isRealResendConfigured()) return 'resend';
  if (isRealSmtpConfigured()) return 'smtp';
  return 'none';
}

// ---------------------------------------------------------------------------
// Provider: Resend
// ---------------------------------------------------------------------------

async function sendViaResend(
  payload: EmailPayload,
  from: string,
): Promise<EmailResult> {
  try {
    // Dynamic import so the app doesn't crash if `resend` is not installed.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);

    // Build email params — include attachments if provided
    const emailParams: Record<string, unknown> = {
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };

    // Optional CC / BCC / Reply-To (Resend supports all three natively)
    if (payload.cc) {
      emailParams.cc = Array.isArray(payload.cc) ? payload.cc.join(', ') : payload.cc;
    }
    if (payload.bcc) {
      emailParams.bcc = Array.isArray(payload.bcc) ? payload.bcc.join(', ') : payload.bcc;
    }
    if (payload.replyTo) {
      emailParams.reply_to = payload.replyTo;
    }

    if (payload.attachments && payload.attachments.length > 0) {
      emailParams.attachments = payload.attachments.map((att) => ({
        filename: att.filename,
        content:
          typeof att.content === "string"
            ? att.content
            : att.content.toString("base64"),
        ...(att.contentType ? { content_type: att.contentType } : {}),
      }));
    }

    const { data, error } = await resend.emails.send(emailParams as Parameters<typeof resend.emails.send>[0]);

    if (error) {
      console.error("[EmailService] Resend error:", error);
      return { sent: false, error: error.message };
    }

    return { sent: true, messageId: data?.id, provider: 'resend' };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to send via Resend";
    console.error("[EmailService] Resend exception:", message);
    return { sent: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Nodemailer SMTP
// ---------------------------------------------------------------------------

/**
 * Check if an SMTP error is a permanent failure that should NOT be retried.
 * - 550-5.4.5: Gmail daily sending limit exceeded (quota — won't reset today)
 * - 535: Authentication failure (wrong credentials)
 * - 553: Invalid from address
 * - 550: General permanent failure (mailbox unavailable, etc.)
 */
function isPermanentSmtpError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('5.4.5') ||             // Daily sending limit
    lower.includes('daily user sending') || // Gmail quota
    lower.includes('535') ||               // Auth failure
    lower.includes('authentication') ||    // Auth failure
    lower.includes('553') ||               // Invalid from
    lower.includes('mailbox unavailable')  // Bad recipient
  );
}

async function sendViaSmtp(
  payload: EmailPayload,
): Promise<EmailResult> {
  try {
    const nodemailer = await import("nodemailer");

    const smtpHost = getSmtpHost();
    const smtpPort = getSmtpPort();
    const smtpConfig = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: getSmtpUser(),
        pass: getSmtpPassword(),
      },
    };

    console.log(`[EmailService] SMTP connecting to ${smtpConfig.host}:${smtpConfig.port} (secure=${smtpConfig.secure}, user=${smtpConfig.auth.user ? 'SET' : 'MISSING'})`);

    const transporter = nodemailer.createTransport(smtpConfig);

    const smtpUser = getSmtpUser();
    const fromAddress =
      getSmtpFrom() ||
      (smtpUser ? `AcquisitionOS <${smtpUser}>` : "AcquisitionOS <noreply@acquisitionos.com>");

    const mailOptions: Record<string, unknown> = {
      from: fromAddress,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };

    // Optional CC / BCC / Reply-To (Nodemailer supports all three natively)
    if (payload.cc) {
      mailOptions.cc = Array.isArray(payload.cc) ? payload.cc.join(', ') : payload.cc;
    }
    if (payload.bcc) {
      mailOptions.bcc = Array.isArray(payload.bcc) ? payload.bcc.join(', ') : payload.bcc;
    }
    if (payload.replyTo) {
      mailOptions.replyTo = payload.replyTo;
    }

    if (payload.attachments && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        ...(att.contentType ? { contentType: att.contentType } : {}),
      }));
    }

    // ── Retry with exponential backoff for transient errors ──
    // Permanent errors (quota exceeded, auth failure) are NOT retried.
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 2000; // 2s, 4s, 8s

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] ✓ SMTP mail sent (attempt ${attempt}/${MAX_RETRIES}): messageId=${info.messageId}, response=${info.response}`);
        return { sent: true, messageId: info.messageId, provider: 'smtp' };
      } catch (sendErr: unknown) {
        const message = sendErr instanceof Error ? sendErr.message : String(sendErr);

        // If this is a permanent error, don't retry — return immediately
        if (isPermanentSmtpError(message)) {
          console.error(`[EmailService] ✗ SMTP permanent error (no retry): ${message}`);
          return { sent: false, error: message, provider: 'smtp' };
        }

        // Transient error — retry if we haven't exhausted attempts
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[EmailService] ⚠ SMTP attempt ${attempt}/${MAX_RETRIES} failed (${message}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Last attempt failed
          console.error(`[EmailService] ✗ SMTP failed after ${MAX_RETRIES} attempts: ${message}`);
          return { sent: false, error: message, provider: 'smtp' };
        }
      }
    }

    // Shouldn't reach here, but just in case
    return { sent: false, error: "SMTP send exhausted retries", provider: 'smtp' };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to send via SMTP";
    console.error("[EmailService] SMTP exception:", message);
    return { sent: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Ethereal / Console — PERMANENTLY REMOVED
// ---------------------------------------------------------------------------
// All Ethereal (test inbox) and console-fallback code paths have been deleted.
// The email service now ONLY attempts real providers (Resend, SMTP).
// If neither is configured or both fail, a clear error is returned.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Core send function (real providers only)
// ---------------------------------------------------------------------------

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const provider = activeEmailProvider();
  console.log(
    `[EmailService] sendEmail called: to=${payload.to}, subject=${payload.subject}, activeProvider=${provider}`,
  );

  // If NO real provider is configured, return a clear error immediately.
  // We do NOT fall back to Ethereal or console — the caller must surface
  // this error so the user knows email delivery is not possible.
  if (!isRealResendConfigured() && !isRealSmtpConfigured()) {
    const errMsg =
      'SMTP_USER and SMTP_PASSWORD must be set in environment (or RESEND_API_KEY). ' +
      'No preview/test inbox fallback is available.';
    console.error(`[EmailService] ✗ No real email provider configured: ${errMsg}`);
    return { sent: false, error: errMsg };
  }

  // Default "from" address: prefer resolved SMTP_FROM aliases, then the
  // authenticated SMTP user (required for Gmail), then a generic noreply.
  const from =
    getSmtpFrom() ||
    (getSmtpUser() ? `AcquisitionOS <${getSmtpUser()}>` : "AcquisitionOS <noreply@acquisitionos.com>");

  let lastError: string | undefined;

  // 1. Try Resend (primary) — only when a REAL API key is configured.
  if (isRealResendConfigured()) {
    console.log("[EmailService] Attempting Resend…");
    const result = await sendViaResend(payload, from);
    if (result.sent) {
      console.log(
        `[EmailService] ✓ Sent via Resend to ${payload.to} (id: ${result.messageId})`,
      );
      return result;
    }
    lastError = result.error;
    console.warn("[EmailService] ✗ Resend failed:", lastError);
  }

  // 2. Try REAL SMTP — only when real credentials are configured.
  // Placeholders (`your-email@gmail.com`, `your-app-password`) are skipped so
  // we don't waste cycles failing Gmail auth.
  if (isRealSmtpConfigured()) {
    console.log(
      `[EmailService] Attempting SMTP to ${getSmtpHost()}:${getSmtpPort()}…`,
    );
    const result = await sendViaSmtp(payload);
    if (result.sent) {
      console.log(
        `[EmailService] ✓ Sent via SMTP to ${payload.to} (id: ${result.messageId})`,
      );
      return result;
    }
    lastError = result.error;
    console.warn("[EmailService] ✗ SMTP failed:", lastError);
  }

  // 3. If we reach here, a real provider WAS configured but delivery FAILED.
  //    Return the error — there is NO Ethereal / console fallback.
  console.error(
    `[EmailService] ✗ All real providers failed (lastError=${lastError || 'unknown'}). ` +
    `No preview/test inbox fallback available.`,
  );
  return {
    sent: false,
    error: lastError || 'Email delivery failed. Please try again later.',
    provider: isRealSmtpConfigured() ? 'smtp' : 'resend',
  };
}

// ---------------------------------------------------------------------------
// HTML template helpers
// ---------------------------------------------------------------------------

const BRAND_COLOR = "#0d9488"; // teal-600
const BRAND_COLOR_LIGHT = "#14b8a6"; // teal-500
const BRAND_BG = "#f0fdfa"; // teal-50
const BRAND_DARK = "#0f766e"; // teal-700
const TEXT_PRIMARY = "#1e293b"; // slate-800
const TEXT_SECONDARY = "#64748b"; // slate-500
const BORDER_COLOR = "#e2e8f0"; // slate-200

function baseHtml(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>AcquisitionOS</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: ${BRAND_BG}; }
    a { color: ${BRAND_COLOR}; text-decoration: underline; }
    a:hover { color: ${BRAND_DARK}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND_BG}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${TEXT_PRIMARY};">
  <!-- Preheader (hidden text for email clients) -->
  <div style="display:none; font-size:1px; color:${BRAND_BG}; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${previewText}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">

        <!-- Card -->
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
              ${body}
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
}

function greeting(name: string): string {
  return `<p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:${TEXT_PRIMARY};">
    Hi <strong>${escapeHtml(name)}</strong>,
  </p>`;
}

function signOff(): string {
  return `<p style="margin:24px 0 0 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
    Cheers,<br />
    <strong style="color:${BRAND_COLOR};">The AcquisitionOS Team</strong>
  </p>`;
}

function otpBlock(otp: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_BG}; border:2px dashed ${BRAND_COLOR_LIGHT}; border-radius:10px; padding:0;">
          <tr>
            <td style="padding:20px 40px; text-align:center;">
              <span style="font-size:32px; font-weight:800; letter-spacing:6px; color:${BRAND_DARK}; font-family:'Courier New', Courier, monospace;">
                ${escapeHtml(otp)}
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function securityNote(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;">
    <tr>
      <td style="background-color:#fffbeb; border-left:4px solid #f59e0b; border-radius:6px; padding:12px 16px;">
        <p style="margin:0; font-size:13px; line-height:20px; color:#92400e;">
          <strong>Didn't request this?</strong> You can safely ignore this email. If you keep receiving unexpected messages, please contact our support team.
        </p>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Public API — Email templates
// ---------------------------------------------------------------------------

/**
 * Email verification OTP — sent when a user signs up or changes their email.
 */
export async function sendVerificationEmail(
  email: string,
  name: string,
  otp: string,
): Promise<EmailResult> {
  const subject = "Verify your email — AcquisitionOS";
  const preview = `Your verification code is ${otp}`;

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Welcome to AcquisitionOS! To verify your email address, please use the following code:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes.
    </p>
    ${securityNote()}
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nWelcome to AcquisitionOS! Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Login OTP — sent for passwordless authentication.
 */
export async function sendOtpLoginEmail(
  email: string,
  name: string,
  otp: string,
): Promise<EmailResult> {
  const subject = "Your login code — AcquisitionOS";
  const preview = `Your login code is ${otp}`;

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Someone requested a login code for your account. Use the following OTP to continue:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes.
    </p>
    ${securityNote()}
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nYour login code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Magic link — sent for passwordless authentication via clickable link.
 */
export async function sendMagicLinkEmail(
  email: string,
  name: string,
  link: string,
): Promise<EmailResult> {
  const subject = "Your sign-in link — AcquisitionOS";
  const preview = "Click the link to sign in to your account";

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Click the button below to sign in to your AcquisitionOS account. This link is one-time use and expires in 15 minutes.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Sign in to AcquisitionOS
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      If the button doesn't work, copy and paste this URL into your browser:
    </p>
    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_COLOR};">${escapeHtml(link)}</a>
    </p>
    ${securityNote()}
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nSign in to AcquisitionOS by clicking this link:\n${link}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Password reset OTP — sent when a user requests a password reset.
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  otp: string,
): Promise<EmailResult> {
  const subject = "Reset your password — AcquisitionOS";
  const preview = `Your password reset code is ${otp}`;

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We received a request to reset the password for your account. Use the code below to proceed:
    </p>
    ${otpBlock(otp)}
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      This code expires in 10 minutes. If you didn't request a password reset, your account is safe — no changes will be made.
    </p>
    ${securityNote()}
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, your account is safe — no changes will be made.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Security alert — sent when a sensitive action occurs on the account.
 */
export async function sendSecurityAlertEmail(
  email: string,
  name: string,
  event: string,
  ip: string,
  userAgent: string,
): Promise<EmailResult> {
  const subject = "Security alert — AcquisitionOS";
  const preview = `Security activity detected on your account`;

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      We detected the following security activity on your account:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0; background-color:#f8fafc; border:1px solid ${BORDER_COLOR}; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="padding:16px 20px; font-size:14px; line-height:22px; color:${TEXT_PRIMARY};">
          <strong style="color:${BRAND_DARK};">Event:</strong> ${escapeHtml(event)}<br />
          <strong style="color:${BRAND_DARK};">IP Address:</strong> ${escapeHtml(ip)}<br />
          <strong style="color:${BRAND_DARK};">Device / Browser:</strong> ${escapeHtml(userAgent)}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      If this was you, no further action is needed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0;">
      <tr>
        <td style="background-color:#fef2f2; border-left:4px solid #ef4444; border-radius:6px; padding:12px 16px;">
          <p style="margin:0; font-size:13px; line-height:20px; color:#991b1b;">
            <strong>Don't recognize this activity?</strong> Change your password immediately and enable two-factor authentication if you haven't already. Contact support if you need help securing your account.
          </p>
        </td>
      </tr>
    </table>
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nWe detected the following security activity on your account:\n\n  Event: ${event}\n  IP Address: ${ip}\n  Device / Browser: ${userAgent}\n\nIf this was you, no further action is needed.\n\nIf you don't recognize this activity, change your password immediately and enable two-factor authentication.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Welcome email — sent after a user successfully verifies their email.
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
): Promise<EmailResult> {
  const subject = "Welcome to AcquisitionOS 🎉";
  const preview = "Your account is ready — let's get started!";

  const html = baseHtml(
    `${greeting(name)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your email has been verified and your account is all set. Welcome aboard!
    </p>
    <p style="margin:0 0 24px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Here are a few things you can do to get started:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td style="padding:0 0 12px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">1</span>
          Complete your profile and company details
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 12px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">2</span>
          Set up your first acquisition pipeline
        </td>
      </tr>
      <tr>
        <td style="padding:0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
          <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background-color:${BRAND_BG}; color:${BRAND_COLOR}; border-radius:6px; font-size:13px; font-weight:700; margin-right:10px;">3</span>
          Invite your team and start collaborating
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <a href="#" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Questions? Reply to this email or reach out to our support team anytime — we're here to help.
    </p>
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name},\n\nYour email has been verified and your account is all set. Welcome aboard!\n\nHere are a few things you can do to get started:\n  1. Complete your profile and company details\n  2. Set up your first acquisition pipeline\n  3. Invite your team and start collaborating\n\nQuestions? Reply to this email or reach out to our support team anytime.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Diagnostic test email — used by /api/auth/email-diagnostic to verify the
 * entire email delivery chain end-to-end. Sends a minimal test message and
 * returns the real provider result (including error messages from Gmail etc.)
 * so delivery failures can be diagnosed instead of silently swallowed.
 */
export async function sendTestEmail(to: string): Promise<EmailResult> {
  const subject = `AcquisitionOS Email Diagnostic — ${new Date().toISOString()}`;
  const html = baseHtml(
    `<p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      This is a diagnostic test email from AcquisitionOS. If you received this,
      your email delivery pipeline is working correctly.
    </p>
    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Timestamp: ${new Date().toISOString()}
    </p>`,
    'AcquisitionOS diagnostic test email',
  );
  const text = `AcquisitionOS Email Diagnostic\n\nThis is a test email. If you received this, your email delivery pipeline is working correctly.\n\nTimestamp: ${new Date().toISOString()}`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Credit add-on purchase confirmation email — sent after the Stripe webhook
 * confirms a successful credit add-on payment. Confirms the amount paid and
 * the credits added to the user's account.
 */
export async function sendCreditAddonConfirmationEmail(params: {
  to: string;
  name?: string | null;
  credits: number;
  amount: number;
  currency: string;
  newBalance: number;
  orderId: string;
}): Promise<EmailResult> {
  const { to, name, credits, amount, currency, newBalance, orderId } = params;
  const currencySymbol = currency.toUpperCase() === 'INR' ? '₹' : '$';
  const formattedAmount = `${currencySymbol}${amount.toLocaleString('en-IN')}`;
  const subject = `AcquisitionOS — ${credits} credits added to your account`;
  const preview = `${credits} credits have been added. Your new balance is ${newBalance} credits.`;

  const html = baseHtml(
    `${greeting(name || undefined)}
    <p style="margin:0 0 16px 0; font-size:15px; line-height:22px; color:${TEXT_PRIMARY};">
      Your credit add-on purchase was successful. <strong>${credits} credits</strong>
      have been added to your account.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; background-color:${BRAND_BG}; border-radius:8px;">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0 0 6px 0;">Amount paid</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${TEXT_PRIMARY}; padding:0 0 6px 0;">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0 0 6px 0;">Credits added</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${TEXT_PRIMARY}; padding:0 0 6px 0;">${credits.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:${TEXT_SECONDARY}; padding:0;">New balance</td>
              <td align="right" style="font-size:15px; font-weight:600; color:${BRAND_COLOR}; padding:0;">${newBalance.toLocaleString('en-IN')} credits</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px 0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Order ID: <span style="font-family:monospace;">${orderId}</span><br/>
      Credits never expire. Use them anytime for lead discovery, outreach, analysis, and more.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <a href="#" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 36px; border-radius:8px; letter-spacing:0.3px;">
            Go to Dashboard
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; font-size:13px; line-height:20px; color:${TEXT_SECONDARY};">
      Questions about your purchase? Reply to this email or contact
      <a href="mailto:support@acquisitionos.com" style="color:${BRAND_COLOR}; text-decoration:none;">support@acquisitionos.com</a>.
    </p>
    ${signOff()}`,
    preview,
  );

  const text = `Hi ${name || 'there'},\n\nYour credit add-on purchase was successful. ${credits} credits have been added to your account.\n\nAmount paid: ${formattedAmount}\nCredits added: ${credits.toLocaleString('en-IN')}\nNew balance: ${newBalance.toLocaleString('en-IN')} credits\nOrder ID: ${orderId}\n\nCredits never expire. Use them anytime for lead discovery, outreach, analysis, and more.\n\nQuestions? Reply to this email or contact support@acquisitionos.com.\n\n— The AcquisitionOS Team`;

  return sendEmail({ to, subject, html, text });
}
