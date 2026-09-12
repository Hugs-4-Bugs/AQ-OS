// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/feedback/retry-emails
//
// Re-sends admin notification emails for feedback reports whose
// delivery previously failed (tagged email-failed). Auth:
//   - Bearer <CRON_SECRET> (same token as other /api/cron endpoints), OR
//   - an authenticated admin session (withAdmin)
//
// This is the "no feedback email is ever lost" safety net — wire it to
// any scheduler (vercel.json cron, sandbox cron, uptime pinger) or hit
// it manually after an SMTP outage.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { retryFailedAdminEmails } from '@/lib/feedback/admin-email';

export async function POST(request: NextRequest) {
  // 1) Cron token path
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    try {
      const result = await retryFailedAdminEmails(20);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      console.error('[FeedbackRetry] cron retry failed:', err);
      return NextResponse.json({ error: 'Retry sweep failed' }, { status: 500 });
    }
  }

  // 2) Admin session path
  return withAdmin(request, async () => {
    try {
      const result = await retryFailedAdminEmails(20);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      console.error('[FeedbackRetry] admin retry failed:', err);
      return NextResponse.json({ error: 'Retry sweep failed' }, { status: 500 });
    }
  });
}

// Convenience GET so an uptime pinger / browser can trigger it too.
export async function GET(request: NextRequest) {
  return POST(request);
}
