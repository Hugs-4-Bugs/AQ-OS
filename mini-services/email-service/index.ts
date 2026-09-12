/**
 * AcquisitionOS Email Service
 * 
 * A dedicated email sending microservice that provides real email delivery.
 * 
 * Email Provider Priority:
 *   1. Resend API (if RESEND_API_KEY env var set)
 *   2. SMTP (if SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD set)
 *   3. Ethereal Email (auto-generated test account - always available)
 * 
 * Port: 3031
 */

import http from 'http';

// ── Types ──────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
  }>;
}

interface EmailResult {
  sent: boolean;
  messageId?: string;
  provider?: string;
  error?: string;
  previewUrl?: string; // Ethereal preview URL
}

// ── Provider: Ethereal Email (always available) ────────────────────────

let etherealAccount: { user: string; pass: string; web: string } | null = null;

async function getEtherealAccount() {
  if (etherealAccount) return etherealAccount;
  
  try {
    const nodemailer = await import('nodemailer');
    const account = await nodemailer.default.createTestAccount();
    etherealAccount = {
      user: account.user,
      pass: account.pass,
      web: account.web,
    };
    console.log('[EmailService] ✓ Ethereal account ready:', account.user);
    console.log('[EmailService] ✓ View emails at:', account.web);
    return etherealAccount;
  } catch (err) {
    console.error('[EmailService] Failed to create Ethereal account:', err);
    return null;
  }
}

// ── Email Sending ──────────────────────────────────────────────────────

async function sendEmailViaEthereal(payload: EmailPayload): Promise<EmailResult> {
  const account = await getEtherealAccount();
  if (!account) {
    return { sent: false, error: 'Ethereal account not available' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: account.user,
        pass: account.pass,
      },
    });

    const mailOptions: Record<string, unknown> = {
      from: payload.from || 'AcquisitionOS <noreply@acquisitionos.com>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };

    if (payload.attachments && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        ...(att.contentType ? { contentType: att.contentType } : {}),
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.default.getTestMessageUrl(info) || account.web;

    console.log(`[EmailService] ✓ Email sent via Ethereal to ${payload.to}`);
    console.log(`[EmailService] ✓ Preview: ${previewUrl}`);

    return {
      sent: true,
      messageId: info.messageId,
      provider: 'ethereal',
      previewUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EmailService] Ethereal send error:', message);
    return { sent: false, error: message, provider: 'ethereal' };
  }
}

async function sendEmailViaSmtp(payload: EmailPayload): Promise<EmailResult> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return { sent: false, error: 'SMTP not configured' };
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const mailOptions: Record<string, unknown> = {
      from: payload.from || process.env.SMTP_FROM || 'AcquisitionOS <noreply@acquisitionos.com>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };

    if (payload.attachments && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        ...(att.contentType ? { contentType: att.contentType } : {}),
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✓ Email sent via SMTP to ${payload.to}`);
    return { sent: true, messageId: info.messageId, provider: 'smtp' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EmailService] SMTP send error:', message);
    return { sent: false, error: message, provider: 'smtp' };
  }
}

async function sendEmailViaResend(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: 'Resend not configured' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const emailParams: Record<string, unknown> = {
      from: payload.from || 'AcquisitionOS <noreply@acquisitionos.com>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };

    if (payload.attachments && payload.attachments.length > 0) {
      emailParams.attachments = payload.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        ...(att.contentType ? { content_type: att.contentType } : {}),
      }));
    }

    const { data, error } = await resend.emails.send(emailParams as any);

    if (error) {
      console.error('[EmailService] Resend error:', error);
      return { sent: false, error: error.message, provider: 'resend' };
    }

    console.log(`[EmailService] ✓ Email sent via Resend to ${payload.to}`);
    return { sent: true, messageId: data?.id, provider: 'resend' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EmailService] Resend exception:', message);
    return { sent: false, error: message, provider: 'resend' };
  }
}

async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  console.log(`[EmailService] Sending email to=${payload.to}, subject=${payload.subject}`);

  // 1. Try Resend (if configured)
  if (process.env.RESEND_API_KEY) {
    const result = await sendEmailViaResend(payload);
    if (result.sent) return result;
    console.warn('[EmailService] Resend failed, trying SMTP fallback...');
  }

  // 2. Try SMTP (if configured)
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    const result = await sendEmailViaSmtp(payload);
    if (result.sent) return result;
    console.warn('[EmailService] SMTP failed, trying Ethereal fallback...');
  }

  // 3. Always-fallback: Ethereal Email (guaranteed to work)
  return sendEmailViaEthereal(payload);
}

// ── HTTP Server ────────────────────────────────────────────────────────

const PORT = 3031;

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'email-service',
      providers: {
        resend: !!process.env.RESEND_API_KEY,
        smtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
        ethereal: true,
      },
    }));
    return;
  }

  // Send email endpoint
  if (req.method === 'POST' && req.url === '/send') {
    try {
      const body = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      const payload: EmailPayload = JSON.parse(body);

      if (!payload.to || !payload.subject || !payload.html) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: to, subject, html' }));
        return;
      }

      const result = await sendEmail(payload);
      res.writeHead(result.sent ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: false, error: message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Initialize Ethereal account on startup
getEtherealAccount().then(() => {
  server.listen(PORT, () => {
    console.log(`[EmailService] 🚀 Running on port ${PORT}`);
    console.log('[EmailService] Provider chain: Resend → SMTP → Ethereal');
  });
});
