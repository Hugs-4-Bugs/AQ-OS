// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/payments/preview
// Phase 5: Billing preview for a plan change with proration
//
// Auth: Required (withAuth)
// Query: ?plan=pro&billingCycle=monthly
// Returns: billing preview with proration, tax, and effective date
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getBillingPreview } from '@/lib/payment-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import type { PlanType } from '@/lib/entitlement-service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const plan = searchParams.get('plan') as PlanType | null;
      const billingCycle = searchParams.get('billingCycle') as 'monthly' | 'yearly' | null;

      if (!plan || !['pro', 'elite'].includes(plan)) {
        return NextResponse.json(
          { error: 'Invalid or missing plan parameter. Must be "pro" or "elite".' },
          { status: 400 }
        );
      }

      if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
        return NextResponse.json(
          { error: 'Invalid or missing billingCycle parameter. Must be "monthly" or "yearly".' },
          { status: 400 }
        );
      }

      const preview = await getBillingPreview({
        userId: user.id,
        targetPlan: plan as PlanType,
        billingCycle,
      });

      // Log the preview request
      await logBillingEvent({
        userId: user.id,
        action: 'upgrade_initiated',
        details: `Billing preview requested for ${plan} plan (${billingCycle})`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          targetPlan: plan,
          billingCycle,
          direction: preview.direction,
          newAmount: preview.newAmount,
          taxAmount: preview.taxAmount,
          totalAmount: preview.totalAmount,
          currency: preview.currency,
          prorationCredit: preview.prorationCredit,
          effectiveImmediately: preview.effectiveImmediately,
        },
      });

      return NextResponse.json({
        currentPlan: preview.currentPlan,
        targetPlan: preview.targetPlan,
        direction: preview.direction,
        currentPeriodEnd: preview.currentPeriodEnd?.toISOString() ?? null,
        prorationCredit: preview.prorationCredit,
        newAmount: preview.newAmount,
        taxAmount: preview.taxAmount,
        totalAmount: preview.totalAmount,
        currency: preview.currency,
        effectiveImmediately: preview.effectiveImmediately,
        scheduledFor: preview.scheduledFor?.toISOString() ?? null,
      });
    } catch (error) {
      console.error('[API] Billing preview error:', error);
      return NextResponse.json(
        { error: 'Failed to generate billing preview' },
        { status: 500 }
      );
    }
  });
}
