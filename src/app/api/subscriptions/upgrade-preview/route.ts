// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/subscriptions/upgrade-preview
// Preview an upgrade: pricing, coupon discount, GST, credit allocation
// NO actual change is made — this is purely a preview
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSubscriptionStatus } from '@/lib/subscription-service';
import {
  PLAN_CREDITS,
  type PlanType,
  getPlanLevel,
  isValidPlanChange,
  getPlanChangeDirection,
  comparePlans,
} from '@/lib/entitlement-service';
import { getCreditBalance } from '@/lib/credit-service';
import { validateAndApplyCoupon } from '@/lib/coupon-service';
import { logBillingEvent } from '@/lib/billing-audit';
import { getClientIp, getUserAgent } from '@/lib/auth';

// Plan pricing configuration
const PLAN_PRICING: Record<PlanType, { monthly: number; yearly: number; currency: string }> = {
  free: { monthly: 0, yearly: 0, currency: 'USD' },
  pro: { monthly: 29, yearly: 279, currency: 'USD' },
  elite: { monthly: 89, yearly: 849, currency: 'USD' },
};

const YEARLY_DISCOUNT_PERCENT = 20; // ~20% savings with yearly billing
const GST_RATE = 0.18; // 18% GST for Indian users

interface UpgradePreviewBody {
  plan: PlanType;
  billingCycle: 'monthly' | 'yearly';
  couponCode?: string;
  currency?: 'USD' | 'INR';
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = (await request.json()) as UpgradePreviewBody;
      const { plan, billingCycle = 'monthly', couponCode, currency = 'USD' } = body;

      // Validate target plan
      if (!plan || !['pro', 'elite'].includes(plan)) {
        return NextResponse.json(
          { error: 'Invalid target plan. Must be "pro" or "elite".' },
          { status: 400 }
        );
      }

      if (!['monthly', 'yearly'].includes(billingCycle)) {
        return NextResponse.json(
          { error: 'Invalid billing cycle. Must be "monthly" or "yearly".' },
          { status: 400 }
        );
      }

      const currentPlan = (user.plan || 'free') as PlanType;

      // Validate plan change direction
      if (!isValidPlanChange(currentPlan, plan)) {
        return NextResponse.json(
          { error: `Cannot change from ${currentPlan} to ${plan}. You are already on this plan.` },
          { status: 400 }
        );
      }

      const direction = getPlanChangeDirection(currentPlan, plan);
      if (direction !== 'upgrade') {
        return NextResponse.json(
          { error: 'This is not an upgrade. Use the downgrade preview endpoint instead.' },
          { status: 400 }
        );
      }

      // Get current subscription info
      const subStatus = await getSubscriptionStatus(user.id);
      const creditBalance = await getCreditBalance(user.id);

      // Calculate pricing
      const planPricing = PLAN_PRICING[plan];
      const baseAmount = billingCycle === 'monthly' ? planPricing.monthly : planPricing.yearly;
      const yearlySavings =
        billingCycle === 'yearly'
          ? planPricing.monthly * 12 - planPricing.yearly
          : 0;

      // Coupon discount
      let couponResult: { valid: boolean; coupon: { discountType: string; discountValue: number } | null; discountAmount: number; finalAmount?: number; error?: string } | null = null;
      let discountAmount = 0;
      let finalAmount = baseAmount;

      if (couponCode) {
        couponResult = await validateAndApplyCoupon({
          code: couponCode,
          baseAmount,
          plan,
          userId: user.id,
        });

        if (couponResult.valid) {
          discountAmount = couponResult.discountAmount;
          finalAmount = couponResult.finalAmount ?? baseAmount;
        }
      }

      // GST calculation for Indian users (currency = INR)
      const isIndianUser = currency === 'INR';
      const subtotalAfterDiscount = finalAmount;
      const gstAmount = isIndianUser ? Math.round(subtotalAfterDiscount * GST_RATE * 100) / 100 : 0;
      const totalAmount = subtotalAfterDiscount + gstAmount;

      // New credit allocation
      const newCredits = PLAN_CREDITS[plan];
      const currentCredits = creditBalance.total;

      // Prorated credit adjustment: credits added for the new plan minus current
      const creditAdjustment = Math.max(0, newCredits - currentCredits);

      // Feature comparison
      const planComparison = comparePlans(currentPlan, plan);

      // Log the preview event
      await logBillingEvent({
        userId: user.id,
        action: 'upgrade_initiated',
        details: `Upgrade preview: ${currentPlan} → ${plan} (${billingCycle})`,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          fromPlan: currentPlan,
          toPlan: plan,
          billingCycle,
          baseAmount,
          discountAmount,
          totalAmount,
          currency,
          couponCode: couponCode || undefined,
          couponValid: couponResult?.valid ?? null,
        },
      });

      return NextResponse.json({
        preview: true, // Indicates this is a preview, no changes made
        currentPlan,
        targetPlan: plan,
        billingCycle,
        planLevel: getPlanLevel(plan),
        pricing: {
          baseAmount,
          discountAmount: Math.round(discountAmount * 100) / 100,
          subtotalAfterDiscount: Math.round(subtotalAfterDiscount * 100) / 100,
          gstRate: isIndianUser ? GST_RATE : 0,
          gstAmount,
          totalAmount: Math.round(totalAmount * 100) / 100,
          currency,
          yearlySavings,
          yearlyDiscountPercent: billingCycle === 'yearly' ? YEARLY_DISCOUNT_PERCENT : 0,
        },
        coupon: couponResult
          ? {
              valid: couponResult.valid,
              code: couponCode,
              discountType: couponResult.coupon?.discountType,
              discountValue: couponResult.coupon?.discountValue,
              error: couponResult.error,
            }
          : null,
        credits: {
          currentCredits,
          newCredits,
          creditAdjustment,
        },
        features: {
          gained: planComparison.gained,
          limitIncreases: planComparison.limitIncreases,
          lost: planComparison.lost, // Should be empty for upgrades
        },
        effectiveDate: new Date().toISOString(), // Upgrades are immediate
        subscription: subStatus.subscription
          ? {
              currentPeriodEnd: subStatus.subscription.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: subStatus.subscription.cancelAtPeriodEnd,
            }
          : null,
      });
    } catch (error) {
      console.error('[API] Failed to preview upgrade:', error);
      return NextResponse.json(
        { error: 'Failed to preview upgrade' },
        { status: 500 }
      );
    }
  });
}
