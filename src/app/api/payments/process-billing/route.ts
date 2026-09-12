// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/payments/process-billing
// Scheduled billing task processor endpoint
// Phase 5: Payments System
//
// Processes:
// - Expired trials (auto-downgrade)
// - End-of-period subscriptions (cancellation, plan changes)
// - Past-due reminder notifications
// - Trial ending reminders
//
// This endpoint should be called by a cron job / scheduler.
// It is protected by a CRON_SECRET environment variable OR admin access.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { processEndOfPeriodSubscriptions } from '@/lib/subscription-service';
import { sendTrialEndingReminders, sendPastDueReminders } from '@/lib/payment-notification-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { requireAuth } from '@/lib/auth';
import { hasPermission, type UserRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check CRON_SECRET or admin authentication
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthenticated = cronSecret && authHeader === `Bearer ${cronSecret}`;

    let isAdminAuthenticated = false;
    if (!isCronAuthenticated) {
      // If not authenticated via CRON_SECRET, check for admin user
      try {
        const user = await requireAuth(request);
        if (hasPermission(user.role as UserRole, 'admin:access')) {
          isAdminAuthenticated = true;
        }
      } catch {
        // Not authenticated as user either
      }
    }

    if (!isCronAuthenticated && !isAdminAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized — requires CRON_SECRET or admin access' },
        { status: 401 }
      );
    }

    const results: Record<string, unknown> = {};

    // 1. Process end-of-period subscriptions (cancellations, plan changes)
    try {
      const eopResult = await processEndOfPeriodSubscriptions();
      results.endOfPeriod = eopResult;
    } catch (error) {
      results.endOfPeriod = { error: 'Failed to process end-of-period subscriptions' };
      console.error('[BillingProcessor] End-of-period error:', error);
    }

    // 2. Send trial ending reminders (3-5 days before expiry)
    try {
      const trialResult = await sendTrialEndingReminders();
      results.trialReminders = trialResult;
    } catch (error) {
      results.trialReminders = { error: 'Failed to send trial reminders' };
      console.error('[BillingProcessor] Trial reminder error:', error);
    }

    // 3. Send past-due payment reminders
    try {
      const pastDueResult = await sendPastDueReminders();
      results.pastDueReminders = pastDueResult;
    } catch (error) {
      results.pastDueReminders = { error: 'Failed to send past-due reminders' };
      console.error('[BillingProcessor] Past-due reminder error:', error);
    }

    // Log the billing processing run (no user — this is a system event)
    await logBillingEvent({
      userId: null as unknown as string,
      action: 'billing_cron_processed',
      details: 'Billing cron job executed',
      metadata: results,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('[BillingProcessor] Fatal error:', error);
    return NextResponse.json(
      { error: 'Billing processing failed' },
      { status: 500 }
    );
  }
}
