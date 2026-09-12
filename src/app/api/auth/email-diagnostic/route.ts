import { NextRequest, NextResponse } from 'next/server';
import {
  isEmailServiceConfigured,
  activeEmailProvider,
  sendTestEmail,
} from '@/lib/email';
import {
  isRealSmtpConfigured,
  isRealResendConfigured,
  isEtherealMode,
  isRealGoogleConfigured,
  getSmtpUser,
} from '@/lib/email-ethereal';

/**
 * Email Delivery Diagnostic Endpoint
 *
 * Surfaces the REAL reason email delivery is failing (or succeeding).
 * This is critical because the OTP / magic-link request routes deliberately
 * return a generic "If an account exists..." message to prevent user
 * enumeration — which means the user can never see WHY their email never
 * arrives. This endpoint fixes that blind spot.
 *
 * Protected by CRON_SECRET (admin-only). Never expose in production without auth.
 *
 * Usage:
 *   GET /api/auth/email-diagnostic
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Returns:
 *   - Provider configuration status
 *   - SMTP connection test result
 *   - Actual send test result (with real error message if failed)
 *   - Gmail quota diagnosis if "Daily user sending limit exceeded"
 */
export async function GET(request: NextRequest) {
  // ── Auth: require CRON_SECRET ─────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const urlSecret = request.nextUrl.searchParams.get('key');
  const cronSecret = process.env.CRON_SECRET;

  const providedSecret = authHeader?.replace('Bearer ', '') || urlSecret;
  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide Authorization: Bearer <CRON_SECRET> or ?key=<CRON_SECRET>' },
      { status: 401 }
    );
  }

  const timestamp = new Date().toISOString();
  const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Calcutta' });
  const ptTime = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });

  // ── Configuration status ──────────────────────────────────────
  const config = {
    timestamp,
    timezone: { IST: istTime, PT: ptTime },
    providers: {
      resend: {
        configured: isRealResendConfigured(),
        apiKeyPrefix: process.env.RESEND_API_KEY
          ? process.env.RESEND_API_KEY.substring(0, 8) + '...'
          : 'not set',
      },
      smtp: {
        configured: isRealSmtpConfigured(),
        host: process.env.SMTP_HOST || 'not set',
        port: process.env.SMTP_PORT || 'not set',
        user: getSmtpUser() ? `${getSmtpUser()!.substring(0, 4)}***` : 'not set',
        from: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'not set',
      },
      googleOAuth: {
        configured: isRealGoogleConfigured(),
        clientIdPrefix: process.env.GOOGLE_CLIENT_ID
          ? process.env.GOOGLE_CLIENT_ID.substring(0, 12) + '...'
          : 'not set',
      },
      ethereal: {
        wouldBeUsed: isEtherealMode(),
      },
    },
    emailServiceConfigured: isEmailServiceConfigured(),
    activeProvider: activeEmailProvider(),
  };

  // ── If no email provider is configured, return config only ────
  if (!isEmailServiceConfigured()) {
    return NextResponse.json({
      ...config,
      sendTest: {
        attempted: false,
        reason: 'No email provider configured. Set SMTP_* or RESEND_API_KEY env vars.',
      },
    });
  }

  // ── Attempt a REAL send test ──────────────────────────────────
  const testRecipient = getSmtpUser() || 'diagnostic@acquisitionos.local';

  let sendTest: {
    attempted: boolean;
    recipient: string;
    sent: boolean;
    provider?: string;
    messageId?: string;
    error?: string;
    diagnosis?: string;
    recommendation?: string;
  } = {
    attempted: true,
    recipient: testRecipient,
    sent: false,
  };

  try {
    const result = await sendTestEmail(testRecipient);
    sendTest = {
      ...sendTest,
      sent: result.sent,
      provider: result.provider,
      messageId: result.messageId,
      error: result.error,
    };

    // ── Diagnose common Gmail errors ──────────────────────────
    if (!result.sent && result.error) {
      const err = result.error.toLowerCase();

      if (err.includes('daily user sending limit') || err.includes('550-5.4.5')) {
        sendTest.diagnosis =
          'Gmail daily SMTP sending limit exceeded. This is a Gmail-side quota, NOT a code bug. ' +
          'The SMTP credentials are valid and the connection succeeds — Gmail simply refuses to accept more messages today.';
        const ptHour = parseInt(
          new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour: 'numeric',
            hour12: false,
          })
        );
        const hoursUntilReset = (24 - ptHour) % 24;
        sendTest.recommendation =
          `Gmail quotas reset around midnight Pacific Time (currently PT ${ptTime}). ` +
          `Approx ${hoursUntilReset} hour(s) until reset. ` +
          `Alternatives: (1) Wait for reset, (2) Set RESEND_API_KEY for a separate provider ` +
          `(free tier: 3000/month, 100/day), (3) Use a different Gmail account.`;
      } else if (err.includes('invalid login') || err.includes('535')) {
        sendTest.diagnosis =
          'Gmail SMTP authentication failed. The app password is incorrect or 2FA is not enabled on the account.';
        sendTest.recommendation =
          'Generate a new App Password at https://myaccount.google.com/apppasswords ' +
          'and update SMTP_PASSWORD / GMAIL_APP_PASSWORD in .env';
      } else if (err.includes('less secure') || err.includes('534')) {
        sendTest.diagnosis = 'Gmail requires App Password (not regular password) for SMTP.';
        sendTest.recommendation = 'Use a Gmail App Password, not the account password.';
      } else if (err.includes('eaouth') || err.includes('timeout') || err.includes('connect')) {
        sendTest.diagnosis = 'SMTP connection failed — network/firewall issue.';
        sendTest.recommendation = 'Check SMTP_HOST and SMTP_PORT, and verify network access to smtp.gmail.com:587';
      } else {
        sendTest.diagnosis = `Unrecognized SMTP error: ${result.error}`;
        sendTest.recommendation = 'Check server logs for the full nodemailer error trace.';
      }
    }
  } catch (err: unknown) {
    sendTest.error = err instanceof Error ? err.message : String(err);
    sendTest.diagnosis = 'Unexpected exception during email send test.';
  }

  return NextResponse.json({ ...config, sendTest });
}
