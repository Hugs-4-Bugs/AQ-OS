// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/cron/renew-subscriptions
// Cron job to renew paid subscription credits and reset free plan credits.
// - Renews credits for active paid subscriptions at period end
// - Downgrades canceled subscriptions to free
// - Resets free plan credits on 1st of month
// - Updates BOTH Subscription AND User credit fields (User.credits
//   is the source of truth for the credit-service)
// Protected by a shared secret to prevent unauthorized invocation.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PLAN_CREDITS as PLAN_CREDITS_CONFIG } from '@/lib/entitlement-service';

const ONE_MONTH_SECONDS = 2628000; // 365/12 days in seconds
const PLAN_CREDITS: Record<string, number> = { free: 50, pro: 500, elite: 2000 };
const ROLLOVER_MAX: Record<string, number> = { free: 0, pro: 200, elite: 1000 };

export async function POST(request: NextRequest) {
  // Verify cron auth — require CRON_SECRET to be set
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron RenewSubscriptions] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let renewedCount = 0;
  let downgradedCount = 0;
  let freeResetCount = 0;
  const errors: string[] = [];

  try {
    // 1. Process expired subscriptions (past their period end)
    const expiredSubs = await db.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: { lte: now },
      },
    });

    for (const sub of expiredSubs) {
      try {
        if (sub.cancelAtPeriodEnd) {
          // Downgrade to free
          await downgradeToFree(sub.userId, now);
          downgradedCount++;
          continue;
        }

        // Renew credits
        const planCredits = PLAN_CREDITS[sub.plan] || 50;
        const maxRollover = ROLLOVER_MAX[sub.plan] || 0;
        const rollover = Math.min(sub.creditsRemaining, maxRollover);
        const freshCredits = planCredits;
        const totalCredits = freshCredits + rollover;

        let newPeriodEnd: Date;
        if (sub.billingCycle === 'yearly') {
          newPeriodEnd = new Date(sub.currentPeriodEnd!.getTime() + 365 * 24 * 60 * 60 * 1000);
        } else {
          newPeriodEnd = new Date(sub.currentPeriodEnd!.getTime() + ONE_MONTH_SECONDS * 1000);
        }

        await db.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: sub.currentPeriodEnd,
            currentPeriodEnd: newPeriodEnd,
            creditsTotal: totalCredits,
            creditsUsed: 0,
            creditsRemaining: totalCredits,
            creditsResetAt: newPeriodEnd,
            updatedAt: now,
          },
        });

        // CRITICAL: Also update User.credits and User.creditsMonthly
        // The credit-service deducts from User.credits — without this update,
        // the user's actual usable credits would NOT reflect the renewal.
        await db.user.update({
          where: { id: sub.userId },
          data: {
            credits: totalCredits,
            creditsMonthly: freshCredits,
            rolloverCredits: rollover,
          },
        });

        // Log in credits ledger
        await db.creditsLedger.create({
          data: {
            userId: sub.userId,
            action: 'monthly_renewal',
            credits: freshCredits + rollover,
            balance: totalCredits,
            description: `Monthly renewal: ${freshCredits} fresh + ${rollover} rolled over`,
          },
        });

        renewedCount++;
      } catch (err) {
        errors.push(`Failed to renew sub ${sub.id}: ${err}`);
      }
    }

    // 2. Reset free plan credits on 1st of month
    if (now.getDate() === 1) {
      const freeSubs = await db.subscription.findMany({
        where: {
          plan: 'free',
          status: { in: ['trialing', 'active', 'expired', 'canceled'] },
        },
      });

      for (const sub of freeSubs) {
        try {
          const nextMonth = now.getMonth() === 11
            ? new Date(now.getFullYear() + 1, 1, 1)
            : new Date(now.getFullYear(), now.getMonth() + 2, 1);

          await db.subscription.update({
            where: { id: sub.id },
            data: {
              creditsTotal: 50,
              creditsUsed: 0,
              creditsRemaining: 50,
              creditsResetAt: nextMonth,
            },
          });

          // CRITICAL: Also update User.credits for free plan users
          await db.user.update({
            where: { id: sub.userId },
            data: {
              credits: 50,
              creditsMonthly: 50,
              rolloverCredits: 0,
            },
          });

          await db.creditsLedger.create({
            data: {
              userId: sub.userId,
              action: 'free_monthly_reset',
              credits: 50 - sub.creditsRemaining,
              balance: 50,
              description: 'Free plan monthly reset on 1st of month',
            },
          });

          freeResetCount++;
        } catch (err) {
          errors.push(`Failed to reset free sub ${sub.id}: ${err}`);
        }
      }
    }

    return NextResponse.json({
      renewed: renewedCount,
      downgraded: downgradedCount,
      freeReset: freeResetCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Renew subscriptions error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}

async function downgradeToFree(userId: string, now: Date) {
  const nextFirst = now.getMonth() === 11
    ? new Date(now.getFullYear() + 1, 1, 1)
    : new Date(now.getFullYear(), now.getMonth() + 2, 1);

  await db.subscription.updateMany({
    where: { userId, status: 'active' },
    data: {
      plan: 'free',
      billingCycle: 'monthly',
      status: 'canceled',
      stripeSubscriptionId: null,
      creditsTotal: 50,
      creditsUsed: 0,
      creditsRemaining: 50,
      creditsResetAt: nextFirst,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    },
  });

  // Also update the user's plan and credits
  await db.user.update({
    where: { id: userId },
    data: { plan: 'free', credits: 50, creditsMonthly: 50, rolloverCredits: 0 },
  });
}
